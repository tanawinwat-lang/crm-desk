import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  AlertTriangle,
  CheckSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Shield,
  X,
} from 'lucide-react';
import { AdminPanelView } from './components/AdminPanelView.tsx';
import { BrandLogo } from './components/BrandLogo.tsx';
import { CaseListView } from './components/CaseListView.tsx';
import { CaseModal } from './components/CaseModal.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { LoginView } from './components/LoginView.tsx';
import { SlaAlertModal } from './components/SlaAlertModal.tsx';
import { unlockAudio } from './lib/bell.ts';
import { auth } from './lib/firebase.ts';
import {
  acknowledgeCaseForUser,
  acknowledgeCasesBulkForUser,
  buildDashboardSummary,
  enrichCasesForUser,
  resolveAuthenticatedUser,
  signOutFirebase,
  subscribeActiveUsers,
  subscribeMyCaseAcks,
  subscribePositions,
  subscribeRawCases,
  subscribeStaffDirectory,
  subscribeTeams,
  updateCaseDoc,
  type RawCaseDoc,
} from './lib/firestoreService.ts';
import { computeAlertStage, needsUserAck } from './lib/sla.ts';
import type {
  CaseItem,
  CaseStatus,
  Position,
  StaffEntry,
  Team,
  UserCaseAck,
  UserPublic,
} from './types.ts';

type NavView = 'dashboard' | 'cases' | 'admin';

export default function App() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [firestoreError, setFirestoreError] = useState<Error | null>(null);
  const [currentUser, setCurrentUser] = useState<UserPublic | null>(null);
  const [activeView, setActiveView] = useState<NavView>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [teams, setTeams] = useState<Team[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [activeUsers, setActiveUsers] = useState<UserPublic[]>([]);
  const [staffList, setStaffList] = useState<StaffEntry[]>([]);
  const [rawCases, setRawCases] = useState<RawCaseDoc[]>([]);
  const [myCaseAcks, setMyCaseAcks] = useState<UserCaseAck[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Live clock for real-time SLA countdowns & automatic SLA alert transitions
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Case filters
  const [statusFilter, setStatusFilter] = useState<'all' | CaseStatus>('all');
  const [slaFilter, setSlaFilter] = useState<'all' | 'alert' | 'overdue' | 'due_today' | 'normal'>('all');
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<CaseItem | null>(null);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [alertNonce, setAlertNonce] = useState(0);

  // Track which alert signatures (id:sla_due_at:stage) were already triggered automatically
  const seenAlertKeysRef = useRef<Set<string>>(new Set());

  if (firestoreError) {
    throw firestoreError;
  }

  const handleLogout = useCallback(async () => {
    try {
      await signOutFirebase();
    } catch {
      // Ignore signout errors
    }
    setCurrentUser(null);
    setRawCases([]);
    setMyCaseAcks([]);
    setTeams([]);
    setPositions([]);
    setActiveUsers([]);
    setStaffList([]);
    setAlertModalOpen(false);
    seenAlertKeysRef.current.clear();
    setActiveView('dashboard');
  }, []);

  // Firebase Auth state listener
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!active) return;
      if (!firebaseUser) {
        setCurrentUser(null);
        setCheckingAuth(false);
        return;
      }

      setCheckingAuth(true);
      setAuthError(null);
      try {
        const profile = await resolveAuthenticatedUser(firebaseUser);
        if (!active) return;
        seenAlertKeysRef.current.clear();
        setCurrentUser(profile);
      } catch (err) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'ไม่สามารถยืนยันสิทธิ์ผู้ใช้งานได้';
        setAuthError(msg);
        await signOutFirebase().catch(() => {});
        setCurrentUser(null);
      } finally {
        if (active) setCheckingAuth(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Unlock Web Audio on any user gesture so SLA bell alerts can play immediately
  useEffect(() => {
    const handleGesture = () => {
      void unlockAudio();
    };
    window.addEventListener('pointerdown', handleGesture, { passive: true });
    window.addEventListener('keydown', handleGesture, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleGesture);
      window.removeEventListener('keydown', handleGesture);
    };
  }, []);

  // Attach Firestore real-time listeners only after auth is ready and user profile is resolved
  useEffect(() => {
    if (!currentUser) return;

    setLoadingData(true);
    const unsubs: (() => void)[] = [];
    const onErr = (err: Error) => {
      setFirestoreError(err);
    };

    unsubs.push(subscribeTeams(setTeams, onErr));
    unsubs.push(subscribePositions(setPositions, onErr));
    unsubs.push(subscribeActiveUsers(setActiveUsers, onErr));
    unsubs.push(subscribeMyCaseAcks(currentUser.uid, setMyCaseAcks, onErr));
    unsubs.push(
      subscribeRawCases(
        currentUser,
        (docs) => {
          setRawCases(docs);
          setLoadingData(false);
        },
        onErr
      )
    );

    if (currentUser.role === 'admin') {
      unsubs.push(subscribeStaffDirectory(setStaffList, onErr));
    }

    const ticker = setInterval(() => {
      setNowMs(Date.now());
    }, 5000);

    return () => {
      unsubs.forEach((u) => u());
      clearInterval(ticker);
    };
  }, [currentUser]);

  // Enrich cases with live SLA & per-user ack states
  const cases = useMemo(() => {
    return enrichCasesForUser(rawCases, myCaseAcks, nowMs);
  }, [rawCases, myCaseAcks, nowMs]);

  const summary = useMemo(() => {
    if (!currentUser) return null;
    return buildDashboardSummary(currentUser, cases, teams, nowMs);
  }, [currentUser, cases, teams, nowMs]);

  const assignableUsers = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'agent') {
      return activeUsers.filter((u) => u.team_id === currentUser.team_id);
    }
    return activeUsers;
  }, [currentUser, activeUsers]);

  // Compute unacknowledged SLA alerts for the current user (30m before due + at due time)
  const unacknowledgedAlerts = useMemo(() => {
    return cases.filter((c) => needsUserAck(c, nowMs));
  }, [cases, nowMs]);

  // Trigger SLA Alert Popup immediately when a new stage (pre_30m or due_reached) enters
  useEffect(() => {
    if (!currentUser) return;

    if (unacknowledgedAlerts.length === 0) {
      setAlertModalOpen(false);
      return;
    }

    let hasNewAlert = false;
    for (const item of unacknowledgedAlerts) {
      const stage = computeAlertStage(item.sla_due_at, item.status, nowMs);
      if (!stage) continue;
      const key = `${item.id}:${item.sla_due_at}:${stage}`;
      if (!seenAlertKeysRef.current.has(key)) {
        seenAlertKeysRef.current.add(key);
        hasNewAlert = true;
      }
    }

    if (hasNewAlert) {
      setAlertModalOpen(true);
      setAlertNonce((n) => n + 1);
    }
  }, [currentUser, unacknowledgedAlerts, nowMs]);

  // Repeat alert every 30 seconds for users who have NOT clicked acknowledge yet
  useEffect(() => {
    if (!currentUser || unacknowledgedAlerts.length === 0 || caseModalOpen) {
      return;
    }

    const repeatTimer = setInterval(() => {
      setAlertModalOpen(true);
      setAlertNonce((n) => n + 1);
    }, 30000);

    return () => clearInterval(repeatTimer);
  }, [currentUser, unacknowledgedAlerts.length, caseModalOpen]);

  const handleQuickStatus = async (item: CaseItem, nextStatus: CaseStatus) => {
    if (!currentUser) return;
    await updateCaseDoc(currentUser, item, { status: nextStatus }, cases);
  };

  const handleAcknowledgeOne = async (item: CaseItem, note = '') => {
    if (!currentUser) return;
    await acknowledgeCaseForUser(item, currentUser, note, Date.now());
  };

  const handleAcknowledgeAll = async (items: CaseItem[]) => {
    if (!currentUser) return;
    await acknowledgeCasesBulkForUser(items, currentUser, Date.now());
    setAlertModalOpen(false);
  };

  if (!currentUser) {
    return (
      <LoginView
        checkingAuth={checkingAuth}
        authError={authError}
        onClearError={() => setAuthError(null)}
      />
    );
  }

  const navItems: { id: NavView; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'แดชบอร์ดติดตามเคส', icon: LayoutDashboard },
    { id: 'cases', label: 'รายการเคส To-Do', icon: CheckSquare },
  ];
  if (currentUser.role === 'admin') {
    navItems.push({ id: 'admin', label: 'จัดการผู้ใช้และทีม', icon: Shield });
  }

  const pageBreadcrumb =
    activeView === 'dashboard'
      ? 'แดชบอร์ดติดตามเคส'
      : activeView === 'cases'
        ? 'รายการเคส To-Do'
        : 'จัดการระบบ (Admin)';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col justify-between">
        <div>
          <div className="h-16 px-6 border-b border-slate-200 flex items-center gap-3">
            <BrandLogo size="md" />
            <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
              CRM Desk
            </span>
          </div>

          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-blue-50 text-blue-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-700' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Account Summary Footer */}
        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="px-2">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {currentUser.display_name}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 truncate">
              {currentUser.position_name} · {currentUser.team_name}
            </div>
            {currentUser.email && (
              <div className="text-xs font-mono text-slate-400 mt-0.5 truncate">
                {currentUser.email}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white h-full border-r border-slate-200 flex flex-col justify-between p-4">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <BrandLogo size="sm" />
                  <span className="text-lg font-bold text-slate-900">CRM Desk</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="ปิดเมนู"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveView(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium ${
                        active ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="border-t border-slate-200 pt-4 space-y-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{currentUser.display_name}</div>
                <div className="text-xs text-slate-500">
                  {currentUser.position_name} · {currentUser.team_name}
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>ออกจากระบบ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="เปิดเมนู"
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 min-w-0 truncate">
              <span className="font-medium text-slate-900 truncate">{pageBreadcrumb}</span>
              <span aria-hidden="true">/</span>
              <span className="truncate">{currentUser.team_name}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {unacknowledgedAlerts.length > 0 && (
              <button
                type="button"
                onClick={() => setAlertModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="tabular-nums">แจ้งเตือน SLA ({unacknowledgedAlerts.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setEditingCase(null);
                setCaseModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 px-3.5 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>เพิ่มเคส</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">
          {activeView === 'dashboard' && (
            <DashboardView
              currentUser={currentUser}
              summary={summary}
              cases={cases}
              nowMs={nowMs}
              loading={loadingData}
              onCreateCase={() => {
                setEditingCase(null);
                setCaseModalOpen(true);
              }}
              onInspectCase={(item) => {
                setEditingCase(item);
                setCaseModalOpen(true);
              }}
              onQuickStatus={handleQuickStatus}
              onOpenAlertModal={() => setAlertModalOpen(true)}
              onFilterByTeam={(tid) => {
                setTeamFilter(tid);
                setActiveView('cases');
              }}
              onGoToCases={() => setActiveView('cases')}
            />
          )}

          {activeView === 'cases' && (
            <CaseListView
              currentUser={currentUser}
              cases={cases}
              teams={teams}
              nowMs={nowMs}
              loading={loadingData}
              statusFilter={statusFilter}
              slaFilter={slaFilter}
              teamFilter={teamFilter}
              searchQuery={searchQuery}
              onStatusFilterChange={setStatusFilter}
              onSlaFilterChange={setSlaFilter}
              onTeamFilterChange={setTeamFilter}
              onSearchChange={setSearchQuery}
              onCreateCase={() => {
                setEditingCase(null);
                setCaseModalOpen(true);
              }}
              onInspectCase={(item) => {
                setEditingCase(item);
                setCaseModalOpen(true);
              }}
              onQuickStatus={handleQuickStatus}
              onAcknowledgeOne={(item) => handleAcknowledgeOne(item)}
            />
          )}

          {activeView === 'admin' && currentUser.role === 'admin' && (
            <AdminPanelView
              currentUser={currentUser}
              teams={teams}
              positions={positions}
              staffList={staffList}
              cases={cases}
            />
          )}
        </main>
      </div>

      {/* Create / Edit / Inspect Case Modal */}
      <CaseModal
        open={caseModalOpen}
        editingCase={editingCase}
        currentUser={currentUser}
        teams={teams}
        assignableUsers={assignableUsers}
        existingCases={cases}
        onClose={() => {
          setCaseModalOpen(false);
          setEditingCase(null);
        }}
      />

      {/* Real-time SLA Alert Popup requiring per-user acknowledgment */}
      <SlaAlertModal
        open={alertModalOpen}
        alerts={unacknowledgedAlerts}
        nowMs={nowMs}
        alertNonce={alertNonce}
        onAcknowledgeOne={handleAcknowledgeOne}
        onAcknowledgeAll={handleAcknowledgeAll}
        onInspectCase={(item) => {
          setEditingCase(item);
          setCaseModalOpen(true);
        }}
        onClose={() => setAlertModalOpen(false)}
      />
    </div>
  );
}
