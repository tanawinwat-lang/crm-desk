import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, db, googleAuthProvider, handleFirestoreError, OperationType } from './firebase.ts';
import { computeAlertStage, computeLiveSlaState, needsUserAck } from './sla.ts';
import type {
  AckHistoryEntry,
  AlertStage,
  AssigneeStat,
  CaseItem,
  CaseStatus,
  DashboardSummary,
  Position,
  RoleLevel,
  StaffEntry,
  Team,
  TeamStat,
  UserCaseAck,
  UserPublic,
} from '../types.ts';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'tanawin.wat@gmail.com';

const DEFAULT_TEAMS: { id: string; name: string; description: string }[] = [
  { id: 'line_oa', name: 'Line OA', description: 'ทีมดูแลลูกค้าและร้านค้าผ่านช่องทาง Line Official Account' },
  { id: 'call', name: 'Call', description: 'ทีมรับสายโทรศัพท์และประสานงานเร่งด่วน' },
  { id: 'email', name: 'Email', description: 'ทีมตอบรับและตรวจสอบเคสผ่านช่องทางอีเมล' },
  { id: 'social_media', name: 'Social Media', description: 'ทีมดูแลช่องทาง Facebook, Instagram, TikTok และคอมเมนต์' },
];

const DEFAULT_POSITIONS: { id: string; name: string; role_level: RoleLevel; is_system: boolean }[] = [
  { id: 'pos_admin', name: 'Admin', role_level: 'admin', is_system: true },
  { id: 'pos_tl', name: 'TL', role_level: 'tl', is_system: true },
  { id: 'pos_agent', name: 'Agent', role_level: 'agent', is_system: true },
];

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

export async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function signInWithGooglePopup(): Promise<User> {
  const result = await signInWithPopup(auth, googleAuthProvider);
  return result.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

async function seedDefaultOrgMetadata(): Promise<void> {
  const teamsSnap = await getDocs(
    query(collection(db, 'teams'), where('is_archived', '==', false))
  ).catch((err) => handleFirestoreError(err, OperationType.LIST, 'teams'));

  const existingTeamIds = new Set(teamsSnap.docs.map((d) => d.id));
  const batch = writeBatch(db);
  let hasWrites = false;

  for (const t of DEFAULT_TEAMS) {
    if (!existingTeamIds.has(t.id)) {
      batch.set(doc(db, 'teams', t.id), {
        id: t.id,
        name: t.name,
        description: t.description,
        is_archived: false,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      hasWrites = true;
    }
  }

  const posSnap = await getDocs(
    query(collection(db, 'positions'), where('is_archived', '==', false))
  ).catch((err) => handleFirestoreError(err, OperationType.LIST, 'positions'));
  const existingPosIds = new Set(posSnap.docs.map((d) => d.id));

  for (const p of DEFAULT_POSITIONS) {
    if (!existingPosIds.has(p.id)) {
      batch.set(doc(db, 'positions', p.id), {
        id: p.id,
        name: p.name,
        role_level: p.role_level,
        is_system: p.is_system,
        is_archived: false,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      hasWrites = true;
    }
  }

  if (hasWrites) {
    await batch.commit().catch((err) => handleFirestoreError(err, OperationType.WRITE, 'teams/positions'));
  }
}

export async function resolveAuthenticatedUser(firebaseUser: User): Promise<UserPublic> {
  const emailLower = (firebaseUser.email ?? '').trim().toLowerCase();
  if (!emailLower || !firebaseUser.emailVerified) {
    throw new Error('บัญชี Google ของคุณต้องยืนยันอีเมลเรียบร้อยแล้วจึงจะเข้าใช้งานได้');
  }

  const uid = firebaseUser.uid;
  const staffId = await sha256Hex(emailLower);
  const isBootstrapAdmin = emailLower === BOOTSTRAPPED_ADMIN_EMAIL;

  if (isBootstrapAdmin) {
    await seedDefaultOrgMetadata();

    const adminRef = doc(db, 'admins', uid);
    const adminSnap = await getDoc(adminRef).catch((err) =>
      handleFirestoreError(err, OperationType.GET, `admins/${uid}`)
    );
    if (!adminSnap.exists()) {
      await setDoc(adminRef, {
        uid,
        granted_by: uid,
        granted_at: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `admins/${uid}`));
    }
  }

  const staffRef = doc(db, 'staff_directory', staffId);
  let staffSnap;
  try {
    staffSnap = await getDoc(staffRef);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (!isBootstrapAdmin && (code === 'permission-denied' || String(err).includes('insufficient permissions'))) {
      throw new Error(
        `อีเมล ${emailLower} ยังไม่ได้รับสิทธิ์เข้าใช้งาน กรุณาติดต่อ Admin เพื่อเพิ่มอีเมลนี้เข้าสู่ระบบ`
      );
    }
    handleFirestoreError(err, OperationType.GET, `staff_directory/${staffId}`);
  }

  if (!staffSnap.exists()) {
    if (isBootstrapAdmin) {
      const displayName = (firebaseUser.displayName ?? 'Admin').trim().slice(0, 120) || 'Admin';
      await setDoc(staffRef, {
        id: staffId,
        email: emailLower,
        display_name: displayName,
        position_id: 'pos_admin',
        position_name: 'Admin',
        role: 'admin',
        team_id: 'line_oa',
        team_name: 'Line OA',
        is_active: true,
        linked_uid: uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `staff_directory/${staffId}`));
      staffSnap = await getDoc(staffRef).catch((err) =>
        handleFirestoreError(err, OperationType.GET, `staff_directory/${staffId}`)
      );
    } else {
      throw new Error(
        `อีเมล ${emailLower} ยังไม่ได้รับสิทธิ์เข้าใช้งาน กรุณาติดต่อ Admin เพื่อเพิ่มอีเมลนี้เข้าสู่ระบบ`
      );
    }
  }

  const staffData = staffSnap.data() as Record<string, unknown>;
  if (staffData.is_active !== true) {
    throw new Error('บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อ Admin');
  }

  if (staffData.linked_uid !== uid) {
    await updateDoc(staffRef, {
      linked_uid: uid,
      updated_at: serverTimestamp(),
    }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `staff_directory/${staffId}`));
  }

  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef).catch((err) =>
    handleFirestoreError(err, OperationType.GET, `users/${uid}`)
  );

  const profilePayload = {
    uid,
    staff_id: staffId,
    display_name: String(staffData.display_name ?? firebaseUser.displayName ?? 'User').slice(0, 120),
    position_id: String(staffData.position_id ?? 'pos_agent'),
    position_name: String(staffData.position_name ?? 'Agent'),
    role: (staffData.role as RoleLevel) ?? 'agent',
    team_id: String(staffData.team_id ?? 'line_oa'),
    team_name: String(staffData.team_name ?? 'Line OA'),
    is_active: Boolean(staffData.is_active),
  };

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      ...profilePayload,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `users/${uid}`));
  } else {
    const existing = userSnap.data();
    const changed =
      existing.display_name !== profilePayload.display_name ||
      existing.position_id !== profilePayload.position_id ||
      existing.position_name !== profilePayload.position_name ||
      existing.role !== profilePayload.role ||
      existing.team_id !== profilePayload.team_id ||
      existing.team_name !== profilePayload.team_name ||
      existing.is_active !== profilePayload.is_active;

    if (changed) {
      await updateDoc(userRef, {
        display_name: profilePayload.display_name,
        position_id: profilePayload.position_id,
        position_name: profilePayload.position_name,
        role: profilePayload.role,
        team_id: profilePayload.team_id,
        team_name: profilePayload.team_name,
        is_active: profilePayload.is_active,
        updated_at: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`));
    }
  }

  await setDoc(doc(db, 'users', uid, 'private', 'info'), {
    uid,
    email: emailLower,
    updated_at: serverTimestamp(),
  }).catch((err) => handleFirestoreError(err, OperationType.WRITE, `users/${uid}/private/info`));

  if (staffData.role === 'admin') {
    const adminRef = doc(db, 'admins', uid);
    const adminSnap = await getDoc(adminRef).catch((err) =>
      handleFirestoreError(err, OperationType.GET, `admins/${uid}`)
    );
    if (!adminSnap.exists()) {
      await setDoc(adminRef, {
        uid,
        granted_by: uid,
        granted_at: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `admins/${uid}`));
    }
  }

  const finalSnap = await getDoc(userRef).catch((err) =>
    handleFirestoreError(err, OperationType.GET, `users/${uid}`)
  );
  const finalData: Record<string, unknown> = finalSnap.data() ?? profilePayload;

  return {
    id: uid,
    uid,
    staff_id: String(finalData.staff_id ?? staffId),
    display_name: String(finalData.display_name),
    role: finalData.role as RoleLevel,
    position_id: String(finalData.position_id),
    position_name: String(finalData.position_name),
    team_id: String(finalData.team_id),
    team_name: String(finalData.team_name),
    is_active: Boolean(finalData.is_active),
    email: emailLower,
    created_at: timestampToIso(finalData.created_at),
  };
}

// ==================== REAL-TIME LISTENERS ====================

export function subscribeTeams(
  onData: (teams: Team[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'teams';
  const q = query(collection(db, path), where('is_archived', '==', false));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Team[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name ?? ''),
          description: String(data.description ?? ''),
          is_archived: Boolean(data.is_archived),
          created_at: timestampToIso(data.created_at),
          updated_at: timestampToIso(data.updated_at),
        };
      });
      list.sort((a, b) => a.name.localeCompare(b.name, 'th'));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribePositions(
  onData: (positions: Position[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'positions';
  const q = query(collection(db, path), where('is_archived', '==', false));
  return onSnapshot(
    q,
    (snapshot) => {
      const rank: Record<RoleLevel, number> = { admin: 1, tl: 2, agent: 3 };
      const list: Position[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name ?? ''),
          role_level: (data.role_level as RoleLevel) ?? 'agent',
          is_system: Boolean(data.is_system),
          is_archived: Boolean(data.is_archived),
          created_at: timestampToIso(data.created_at),
          updated_at: timestampToIso(data.updated_at),
        };
      });
      list.sort((a, b) => rank[a.role_level] - rank[b.role_level] || a.name.localeCompare(b.name, 'th'));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeActiveUsers(
  onData: (users: UserPublic[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'users';
  const q = query(collection(db, path), where('is_active', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: UserPublic[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          uid: String(data.uid ?? d.id),
          staff_id: String(data.staff_id ?? ''),
          display_name: String(data.display_name ?? ''),
          role: (data.role as RoleLevel) ?? 'agent',
          position_id: String(data.position_id ?? ''),
          position_name: String(data.position_name ?? ''),
          team_id: String(data.team_id ?? ''),
          team_name: String(data.team_name ?? ''),
          is_active: Boolean(data.is_active),
          created_at: timestampToIso(data.created_at),
        };
      });
      list.sort((a, b) => a.display_name.localeCompare(b.display_name, 'th'));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeStaffDirectory(
  onData: (staff: StaffEntry[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'staff_directory';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const rank: Record<RoleLevel, number> = { admin: 1, tl: 2, agent: 3 };
      const list: StaffEntry[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          email: String(data.email ?? ''),
          display_name: String(data.display_name ?? ''),
          position_id: String(data.position_id ?? ''),
          position_name: String(data.position_name ?? ''),
          role: (data.role as RoleLevel) ?? 'agent',
          team_id: String(data.team_id ?? ''),
          team_name: String(data.team_name ?? ''),
          is_active: Boolean(data.is_active),
          linked_uid: String(data.linked_uid ?? ''),
          created_at: timestampToIso(data.created_at),
          updated_at: timestampToIso(data.updated_at),
        };
      });
      list.sort((a, b) => rank[a.role] - rank[b.role] || a.display_name.localeCompare(b.display_name, 'th'));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeMyCaseAcks(
  uid: string,
  onData: (acks: UserCaseAck[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/case_acks`;
  const q = query(collection(db, 'users', uid, 'case_acks'), where('user_id', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: UserCaseAck[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          case_id: String(data.case_id ?? ''),
          user_id: String(data.user_id ?? uid),
          ack_stage: (data.ack_stage as AlertStage) ?? 'pre_30m',
          sla_due_at: String(data.sla_due_at ?? ''),
          ack_at: timestampToIso(data.ack_at),
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export interface RawCaseDoc {
  id: string;
  case_no: string;
  shop_id: string;
  issue_summary: string;
  details: string;
  status: CaseStatus;
  team_id: string;
  team_name: string;
  assignee_id: string;
  assignee_name: string;
  created_by: string;
  sla_due_at: string;
  last_ack_at: string | null;
  last_ack_by_name: string | null;
  last_ack_level: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export function subscribeRawCases(
  currentUser: UserPublic,
  onData: (cases: RawCaseDoc[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'cases';
  const ref =
    currentUser.role === 'agent'
      ? query(collection(db, path), where('team_id', '==', currentUser.team_id))
      : collection(db, path);

  return onSnapshot(
    ref,
    (snapshot) => {
      const list: RawCaseDoc[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          case_no: String(data.case_no ?? ''),
          shop_id: String(data.shop_id ?? ''),
          issue_summary: String(data.issue_summary ?? ''),
          details: String(data.details ?? ''),
          status: (data.status as CaseStatus) ?? 'todo',
          team_id: String(data.team_id ?? ''),
          team_name: String(data.team_name ?? ''),
          assignee_id: String(data.assignee_id ?? ''),
          assignee_name: String(data.assignee_name ?? ''),
          created_by: String(data.created_by ?? ''),
          sla_due_at: String(data.sla_due_at ?? ''),
          last_ack_at: data.last_ack_at ? String(data.last_ack_at) : null,
          last_ack_by_name: data.last_ack_by_name ? String(data.last_ack_by_name) : null,
          last_ack_level: data.last_ack_level ? String(data.last_ack_level) : null,
          resolved_at: data.resolved_at ? String(data.resolved_at) : null,
          created_at: timestampToIso(data.created_at),
          updated_at: timestampToIso(data.updated_at),
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

// ==================== COMPUTED ENRICHMENT & SUMMARY ====================

export function enrichCasesForUser(
  rawCases: RawCaseDoc[],
  myAcks: UserCaseAck[],
  nowMs: number
): CaseItem[] {
  const ackMap = new Map<string, AlertStage[]>();
  for (const ack of myAcks) {
    const key = `${ack.case_id}:${ack.sla_due_at}`;
    const list = ackMap.get(key) ?? [];
    list.push(ack.ack_stage);
    ackMap.set(key, list);
  }

  const enriched = rawCases.map((row): CaseItem => {
    const slaState = computeLiveSlaState(row.sla_due_at, row.status, nowMs);
    const alertStage = computeAlertStage(row.sla_due_at, row.status, nowMs);
    const myAckStages = ackMap.get(`${row.id}:${row.sla_due_at}`) ?? [];

    let needsAck = false;
    if (alertStage === 'pre_30m') {
      needsAck = !myAckStages.includes('pre_30m') && !myAckStages.includes('due_reached');
    } else if (alertStage === 'due_reached') {
      needsAck = !myAckStages.includes('due_reached');
    }

    return {
      ...row,
      sla_state: slaState,
      alert_stage_required: alertStage,
      my_ack_stages: myAckStages,
      needs_ack: needsAck,
      ack_level_required: alertStage,
    };
  });

  enriched.sort((a, b) => {
    if (a.status === 'done' && b.status !== 'done') return 1;
    if (a.status !== 'done' && b.status === 'done') return -1;
    return new Date(a.sla_due_at).getTime() - new Date(b.sla_due_at).getTime();
  });

  return enriched;
}

export function buildDashboardSummary(
  currentUser: UserPublic,
  cases: CaseItem[],
  teams: Team[],
  nowMs: number
): DashboardSummary {
  const isAgent = currentUser.role === 'agent';
  const teamMap = new Map<string, TeamStat>();
  const scopedTeams = isAgent ? teams.filter((t) => t.id === currentUser.team_id) : teams;

  for (const t of scopedTeams) {
    teamMap.set(t.id, {
      team_id: t.id,
      team_name: t.name,
      total_open: 0,
      todo_count: 0,
      in_progress_count: 0,
      due_today_count: 0,
      overdue_count: 0,
      done_count: 0,
    });
  }

  const assigneeMap = new Map<string, AssigneeStat>();
  let openCases = 0;
  let todoCases = 0;
  let inProgressCases = 0;
  let dueTodayCases = 0;
  let overdueCases = 0;
  let doneCases = 0;
  let unacknowledgedAlerts = 0;

  for (const c of cases) {
    const ts = teamMap.get(c.team_id);
    if (!assigneeMap.has(c.assignee_id)) {
      assigneeMap.set(c.assignee_id, {
        user_id: c.assignee_id,
        display_name: c.assignee_name,
        team_name: c.team_name,
        total_open: 0,
        due_today_count: 0,
        overdue_count: 0,
        done_count: 0,
      });
    }
    const asg = assigneeMap.get(c.assignee_id)!;

    if (c.status === 'done') {
      doneCases++;
      if (ts) ts.done_count++;
      asg.done_count++;
    } else {
      openCases++;
      if (ts) ts.total_open++;
      asg.total_open++;
      if (c.status === 'todo') {
        todoCases++;
        if (ts) ts.todo_count++;
      } else {
        inProgressCases++;
        if (ts) ts.in_progress_count++;
      }

      const liveSla = computeLiveSlaState(c.sla_due_at, c.status, nowMs);
      if (liveSla === 'due_today') {
        dueTodayCases++;
        if (ts) ts.due_today_count++;
        asg.due_today_count++;
      } else if (liveSla === 'overdue') {
        overdueCases++;
        if (ts) ts.overdue_count++;
        asg.overdue_count++;
      }
      if (needsUserAck(c, nowMs)) {
        unacknowledgedAlerts++;
      }
    }
  }

  return {
    scope: isAgent ? 'team' : 'global',
    scope_team_name: isAgent ? currentUser.team_name : null,
    totals: {
      open_cases: openCases,
      todo_cases: todoCases,
      in_progress_cases: inProgressCases,
      due_today_cases: dueTodayCases,
      overdue_cases: overdueCases,
      done_cases: doneCases,
      unacknowledged_alerts: unacknowledgedAlerts,
    },
    team_stats: Array.from(teamMap.values()),
    assignee_stats: Array.from(assigneeMap.values()).sort((a, b) => b.total_open - a.total_open),
    server_time: new Date(nowMs).toISOString(),
  };
}

// ==================== CASE MUTATIONS ====================

export async function createCaseDoc(
  currentUser: UserPublic,
  input: {
    case_no: string;
    shop_id: string;
    issue_summary: string;
    details: string;
    status: CaseStatus;
    sla_due_at: string;
  },
  existingCases: CaseItem[]
): Promise<void> {
  const caseNo = input.case_no.trim().slice(0, 64);
  const shopId = input.shop_id.trim().slice(0, 64);
  const issueSummary = input.issue_summary.trim().slice(0, 300);
  const details = input.details.trim().slice(0, 4000);

  if (!caseNo || !shopId || !issueSummary || !input.sla_due_at) {
    throw new Error('กรุณากรอกข้อมูลเลขเคส, ID SHOP, รายละเอียดปัญหา และวันครบกำหนด SLA ให้ครบถ้วน');
  }

  if (existingCases.some((c) => c.case_no.toLowerCase() === caseNo.toLowerCase())) {
    throw new Error(`เลขเคส "${caseNo}" มีอยู่ในระบบแล้ว`);
  }

  const newRef = doc(collection(db, 'cases'));
  const resolvedAt = input.status === 'done' ? new Date().toISOString() : '';

  await setDoc(newRef, {
    id: newRef.id,
    case_no: caseNo,
    shop_id: shopId,
    issue_summary: issueSummary,
    details,
    status: input.status,
    team_id: currentUser.team_id,
    team_name: currentUser.team_name,
    assignee_id: currentUser.uid,
    assignee_name: currentUser.display_name.slice(0, 120),
    created_by: currentUser.uid,
    sla_due_at: input.sla_due_at.slice(0, 64),
    last_ack_at: '',
    last_ack_by: '',
    last_ack_by_name: '',
    last_ack_level: '',
    resolved_at: resolvedAt,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `cases/${newRef.id}`));
}

export async function updateCaseDoc(
  currentUser: UserPublic,
  editingCase: CaseItem,
  input: {
    case_no?: string;
    shop_id?: string;
    issue_summary?: string;
    details?: string;
    status?: CaseStatus;
    sla_due_at?: string;
    team_id?: string;
    team_name?: string;
    assignee_id?: string;
    assignee_name?: string;
  },
  existingCases: CaseItem[]
): Promise<void> {
  const caseNo = (input.case_no ?? editingCase.case_no).trim().slice(0, 64);
  if (
    caseNo.toLowerCase() !== editingCase.case_no.toLowerCase() &&
    existingCases.some((c) => c.id !== editingCase.id && c.case_no.toLowerCase() === caseNo.toLowerCase())
  ) {
    throw new Error(`เลขเคส "${caseNo}" มีอยู่ในระบบแล้ว`);
  }

  const nextStatus = input.status ?? editingCase.status;
  const resolvedAt =
    nextStatus === 'done' ? (editingCase.resolved_at || new Date().toISOString()) : '';

  const payload: Record<string, unknown> = {
    case_no: caseNo,
    shop_id: (input.shop_id ?? editingCase.shop_id).trim().slice(0, 64),
    issue_summary: (input.issue_summary ?? editingCase.issue_summary).trim().slice(0, 300),
    details: (input.details ?? editingCase.details).trim().slice(0, 4000),
    status: nextStatus,
    sla_due_at: (input.sla_due_at ?? editingCase.sla_due_at).slice(0, 64),
    resolved_at: resolvedAt,
    updated_at: serverTimestamp(),
  };

  if (currentUser.role === 'admin' || currentUser.role === 'tl') {
    if (input.team_id && input.team_name) {
      payload.team_id = input.team_id;
      payload.team_name = input.team_name.slice(0, 80);
    }
    if (input.assignee_id && input.assignee_name) {
      payload.assignee_id = input.assignee_id;
      payload.assignee_name = input.assignee_name.slice(0, 120);
    }
  }

  await updateDoc(doc(db, 'cases', editingCase.id), payload).catch((err) =>
    handleFirestoreError(err, OperationType.UPDATE, `cases/${editingCase.id}`)
  );
}

export async function deleteCaseDoc(caseId: string): Promise<void> {
  await deleteDoc(doc(db, 'cases', caseId)).catch((err) =>
    handleFirestoreError(err, OperationType.DELETE, `cases/${caseId}`)
  );
}

export async function acknowledgeCaseForUser(
  caseItem: CaseItem,
  currentUser: UserPublic,
  note: string,
  nowMs: number
): Promise<void> {
  const ackStage = computeAlertStage(caseItem.sla_due_at, caseItem.status, nowMs);
  if (!ackStage) return;

  const ackKey = `${caseItem.id}_${ackStage}`;
  const ackHistoryRef = doc(collection(db, 'cases', caseItem.id, 'acknowledgments'));
  const ackAtIso = new Date(nowMs).toISOString();

  const batch = writeBatch(db);
  batch.set(doc(db, 'users', currentUser.uid, 'case_acks', ackKey), {
    id: ackKey,
    case_id: caseItem.id,
    user_id: currentUser.uid,
    ack_stage: ackStage,
    sla_due_at: caseItem.sla_due_at.slice(0, 64),
    ack_at: serverTimestamp(),
  });

  batch.set(ackHistoryRef, {
    id: ackHistoryRef.id,
    case_id: caseItem.id,
    user_id: currentUser.uid,
    user_name: currentUser.display_name.slice(0, 120),
    ack_level: ackStage,
    note: note.trim().slice(0, 500),
    ack_at: serverTimestamp(),
  });

  batch.update(doc(db, 'cases', caseItem.id), {
    last_ack_at: ackAtIso,
    last_ack_by: currentUser.uid,
    last_ack_by_name: currentUser.display_name.slice(0, 120),
    last_ack_level: ackStage,
    updated_at: serverTimestamp(),
  });

  await batch
    .commit()
    .catch((err) => handleFirestoreError(err, OperationType.WRITE, `cases/${caseItem.id}/acknowledge`));
}

export async function acknowledgeCasesBulkForUser(
  targets: CaseItem[],
  currentUser: UserPublic,
  nowMs: number
): Promise<void> {
  const actionable = targets.filter((c) => needsUserAck(c, nowMs));
  if (actionable.length === 0) return;

  const ackAtIso = new Date(nowMs).toISOString();
  const batch = writeBatch(db);

  for (const item of actionable.slice(0, 150)) {
    const ackStage = computeAlertStage(item.sla_due_at, item.status, nowMs);
    if (!ackStage) continue;

    const ackKey = `${item.id}_${ackStage}`;
    const ackHistoryRef = doc(collection(db, 'cases', item.id, 'acknowledgments'));

    batch.set(doc(db, 'users', currentUser.uid, 'case_acks', ackKey), {
      id: ackKey,
      case_id: item.id,
      user_id: currentUser.uid,
      ack_stage: ackStage,
      sla_due_at: item.sla_due_at.slice(0, 64),
      ack_at: serverTimestamp(),
    });

    batch.set(ackHistoryRef, {
      id: ackHistoryRef.id,
      case_id: item.id,
      user_id: currentUser.uid,
      user_name: currentUser.display_name.slice(0, 120),
      ack_level: ackStage,
      note: '',
      ack_at: serverTimestamp(),
    });

    batch.update(doc(db, 'cases', item.id), {
      last_ack_at: ackAtIso,
      last_ack_by: currentUser.uid,
      last_ack_by_name: currentUser.display_name.slice(0, 120),
      last_ack_level: ackStage,
      updated_at: serverTimestamp(),
    });
  }

  await batch
    .commit()
    .catch((err) => handleFirestoreError(err, OperationType.WRITE, 'cases/acknowledge-bulk'));
}

export async function fetchCaseAckHistory(caseId: string): Promise<AckHistoryEntry[]> {
  const path = `cases/${caseId}/acknowledgments`;
  const q = query(collection(db, 'cases', caseId, 'acknowledgments'), where('case_id', '==', caseId));
  const snap = await getDocs(q).catch((err) => handleFirestoreError(err, OperationType.LIST, path));
  const entries: AckHistoryEntry[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      case_id: String(data.case_id ?? caseId),
      user_id: String(data.user_id ?? ''),
      user_name: String(data.user_name ?? ''),
      ack_level: String(data.ack_level ?? ''),
      note: String(data.note ?? ''),
      ack_at: timestampToIso(data.ack_at),
    };
  });
  entries.sort((a, b) => new Date(b.ack_at).getTime() - new Date(a.ack_at).getTime());
  return entries;
}

// ==================== ADMIN MUTATIONS ====================

export async function createStaffMemberDoc(input: {
  email: string;
  display_name: string;
  position: Position;
  team: Team;
}): Promise<void> {
  const emailLower = input.email.trim().toLowerCase();
  const displayName = input.display_name.trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower) || emailLower.length > 254) {
    throw new Error('กรุณากรอกอีเมล Google ให้ถูกต้อง');
  }
  if (!displayName) {
    throw new Error('กรุณาระบุชื่อ-นามสกุลผู้ใช้งาน');
  }

  const staffId = await sha256Hex(emailLower);
  const staffRef = doc(db, 'staff_directory', staffId);
  const existing = await getDoc(staffRef).catch((err) =>
    handleFirestoreError(err, OperationType.GET, `staff_directory/${staffId}`)
  );
  if (existing.exists()) {
    throw new Error(`อีเมล "${emailLower}" มีอยู่ในระบบแล้ว`);
  }

  await setDoc(staffRef, {
    id: staffId,
    email: emailLower,
    display_name: displayName,
    position_id: input.position.id,
    position_name: input.position.name.slice(0, 80),
    role: input.position.role_level,
    team_id: input.team.id,
    team_name: input.team.name.slice(0, 80),
    is_active: true,
    linked_uid: '',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `staff_directory/${staffId}`));
}

export async function updateStaffMemberDoc(
  currentUser: UserPublic,
  staff: StaffEntry,
  input: {
    display_name: string;
    position: Position;
    team: Team;
    is_active: boolean;
  },
  allStaff: StaffEntry[]
): Promise<void> {
  const displayName = input.display_name.trim().slice(0, 120);
  if (!displayName) {
    throw new Error('กรุณาระบุชื่อ-นามสกุลผู้ใช้งาน');
  }

  if (staff.role === 'admin' && (input.position.role_level !== 'admin' || !input.is_active)) {
    const otherActiveAdmins = allStaff.filter(
      (s) => s.id !== staff.id && s.role === 'admin' && s.is_active
    );
    if (otherActiveAdmins.length === 0) {
      throw new Error('ไม่สามารถลดสิทธิ์หรือปิดการใช้งาน Admin คนสุดท้ายได้');
    }
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'staff_directory', staff.id), {
    display_name: displayName,
    position_id: input.position.id,
    position_name: input.position.name.slice(0, 80),
    role: input.position.role_level,
    team_id: input.team.id,
    team_name: input.team.name.slice(0, 80),
    is_active: input.is_active,
    updated_at: serverTimestamp(),
  });

  if (staff.linked_uid) {
    batch.update(doc(db, 'users', staff.linked_uid), {
      display_name: displayName,
      position_id: input.position.id,
      position_name: input.position.name.slice(0, 80),
      role: input.position.role_level,
      team_id: input.team.id,
      team_name: input.team.name.slice(0, 80),
      is_active: input.is_active,
      updated_at: serverTimestamp(),
    });

    const adminRef = doc(db, 'admins', staff.linked_uid);
    const existingAdminSnap = await getDoc(adminRef).catch((err) =>
      handleFirestoreError(err, OperationType.GET, `admins/${staff.linked_uid}`)
    );

    if (input.position.role_level === 'admin' && input.is_active) {
      if (!existingAdminSnap.exists()) {
        batch.set(adminRef, {
          uid: staff.linked_uid,
          granted_by: currentUser.uid,
          granted_at: serverTimestamp(),
        });
      }
    } else if (staff.linked_uid !== currentUser.uid && existingAdminSnap.exists()) {
      batch.delete(adminRef);
    }
  }

  await batch
    .commit()
    .catch((err) => handleFirestoreError(err, OperationType.UPDATE, `staff_directory/${staff.id}`));
}

export async function deleteStaffMemberDoc(currentUser: UserPublic, staff: StaffEntry): Promise<void> {
  if (staff.linked_uid && staff.linked_uid === currentUser.uid) {
    throw new Error('ไม่สามารถลบบัญชีของตัวเองที่กำลังใช้งานอยู่ได้');
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, 'staff_directory', staff.id));
  if (staff.linked_uid) {
    batch.delete(doc(db, 'users', staff.linked_uid));
    batch.delete(doc(db, 'admins', staff.linked_uid));
  }
  await batch
    .commit()
    .catch((err) => handleFirestoreError(err, OperationType.DELETE, `staff_directory/${staff.id}`));
}

export async function createTeamDoc(
  input: { name: string; description: string },
  existingTeams: Team[]
): Promise<void> {
  const name = input.name.trim().slice(0, 80);
  const description = input.description.trim().slice(0, 300);
  if (!name) {
    throw new Error('กรุณาระบุชื่อทีม / แผนก');
  }
  if (existingTeams.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`ทีม "${name}" มีอยู่ในระบบแล้ว`);
  }

  const newRef = doc(collection(db, 'teams'));
  await setDoc(newRef, {
    id: newRef.id,
    name,
    description,
    is_archived: false,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `teams/${newRef.id}`));
}

export async function deleteTeamDoc(
  team: Team,
  staffList: StaffEntry[],
  cases: CaseItem[]
): Promise<void> {
  const userCnt = staffList.filter((s) => s.team_id === team.id).length;
  const caseCnt = cases.filter((c) => c.team_id === team.id).length;
  if (userCnt > 0 || caseCnt > 0) {
    throw new Error(`ไม่สามารถลบทีมได้ เนื่องจากยังมีสมาชิก (${userCnt}) หรือเคส (${caseCnt}) สังกัดอยู่`);
  }
  await deleteDoc(doc(db, 'teams', team.id)).catch((err) =>
    handleFirestoreError(err, OperationType.DELETE, `teams/${team.id}`)
  );
}

export async function createPositionDoc(
  input: { name: string; role_level: RoleLevel },
  existingPositions: Position[]
): Promise<void> {
  const name = input.name.trim().slice(0, 80);
  if (!name) {
    throw new Error('กรุณาระบุชื่อตำแหน่ง');
  }
  if (existingPositions.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`ตำแหน่ง "${name}" มีอยู่ในระบบแล้ว`);
  }

  const newRef = doc(collection(db, 'positions'));
  await setDoc(newRef, {
    id: newRef.id,
    name,
    role_level: input.role_level,
    is_system: false,
    is_archived: false,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `positions/${newRef.id}`));
}

export async function deletePositionDoc(pos: Position, staffList: StaffEntry[]): Promise<void> {
  if (pos.is_system) {
    throw new Error(`ไม่สามารถลบตำแหน่งหลัก "${pos.name}" ของระบบได้`);
  }
  const userCnt = staffList.filter((s) => s.position_id === pos.id).length;
  if (userCnt > 0) {
    throw new Error(`ไม่สามารถลบตำแหน่ง "${pos.name}" ได้ เนื่องจากมีผู้ใช้งานอยู่ ${userCnt} คน`);
  }
  await deleteDoc(doc(db, 'positions', pos.id)).catch((err) =>
    handleFirestoreError(err, OperationType.DELETE, `positions/${pos.id}`)
  );
}
