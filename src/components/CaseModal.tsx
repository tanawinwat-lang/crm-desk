import React, { useEffect, useState } from 'react';
import { Clock, Lock, Trash2, X } from 'lucide-react';
import {
  createCaseDoc,
  deleteCaseDoc,
  fetchCaseAckHistory,
  updateCaseDoc,
} from '../lib/firestoreService.ts';
import { formatThaiDateTime, toLocalDateTimeInput } from '../lib/sla.ts';
import type { AckHistoryEntry, CaseItem, CaseStatus, Team, UserPublic } from '../types.ts';

interface CaseModalProps {
  open: boolean;
  editingCase: CaseItem | null;
  currentUser: UserPublic;
  teams: Team[];
  assignableUsers: UserPublic[];
  existingCases: CaseItem[];
  onClose: () => void;
}

function generateCaseNo(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(100 + Math.random() * 900));
  return `CS-${y}${m}${d}-${rand}`;
}

function getDefaultSlaInput(hoursAhead = 4): string {
  const d = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  return toLocalDateTimeInput(d.toISOString());
}

export const CaseModal: React.FC<CaseModalProps> = ({
  open,
  editingCase,
  currentUser,
  teams,
  assignableUsers,
  existingCases,
  onClose,
}) => {
  const isNew = !editingCase;
  const canReassign = !isNew && (currentUser.role === 'admin' || currentUser.role === 'tl');
  const canDelete = !isNew && (currentUser.role === 'admin' || currentUser.role === 'tl');

  const [caseNo, setCaseNo] = useState('');
  const [shopId, setShopId] = useState('');
  const [issueSummary, setIssueSummary] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<CaseStatus>('todo');
  const [slaDueInput, setSlaDueInput] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>(currentUser.uid);
  const [teamId, setTeamId] = useState<string>(currentUser.team_id);

  const [history, setHistory] = useState<AckHistoryEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    if (editingCase) {
      setCaseNo(editingCase.case_no);
      setShopId(editingCase.shop_id);
      setIssueSummary(editingCase.issue_summary);
      setDetails(editingCase.details);
      setStatus(editingCase.status);
      setSlaDueInput(toLocalDateTimeInput(editingCase.sla_due_at));
      setAssigneeId(editingCase.assignee_id);
      setTeamId(editingCase.team_id);
      fetchCaseAckHistory(editingCase.id)
        .then((res) => setHistory(res))
        .catch(() => setHistory([]));
    } else {
      setCaseNo(generateCaseNo());
      setShopId('');
      setIssueSummary('');
      setDetails('');
      setStatus('todo');
      setSlaDueInput(getDefaultSlaInput(4));
      setAssigneeId(currentUser.uid);
      setTeamId(currentUser.team_id);
      setHistory([]);
    }
  }, [open, editingCase, currentUser]);

  if (!open) return null;

  const setQuickSla = (mode: '2h' | 'today18' | 'tomorrow12' | '2d') => {
    const now = new Date();
    const target = new Date(now);
    if (mode === '2h') {
      target.setHours(target.getHours() + 2);
    } else if (mode === 'today18') {
      target.setHours(18, 0, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
    } else if (mode === 'tomorrow12') {
      target.setDate(target.getDate() + 1);
      target.setHours(12, 0, 0, 0);
    } else {
      target.setDate(target.getDate() + 2);
    }
    setSlaDueInput(toLocalDateTimeInput(target.toISOString()));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const slaDate = new Date(slaDueInput);
      if (Number.isNaN(slaDate.getTime())) {
        setError('กรุณาระบุวันและเวลาครบกำหนด SLA ให้ถูกต้อง');
        setSubmitting(false);
        return;
      }

      if (isNew) {
        await createCaseDoc(
          currentUser,
          {
            case_no: caseNo,
            shop_id: shopId,
            issue_summary: issueSummary,
            details,
            status,
            sla_due_at: slaDate.toISOString(),
          },
          existingCases
        );
      } else {
        const selectedTeam = teams.find((t) => t.id === teamId);
        const selectedAssignee = assignableUsers.find((u) => u.uid === assigneeId);

        await updateCaseDoc(
          currentUser,
          editingCase,
          {
            case_no: caseNo,
            shop_id: shopId,
            issue_summary: issueSummary,
            details,
            status,
            sla_due_at: slaDate.toISOString(),
            ...(canReassign && selectedTeam
              ? { team_id: selectedTeam.id, team_name: selectedTeam.name }
              : {}),
            ...(canReassign && selectedAssignee
              ? { assignee_id: selectedAssignee.uid, assignee_name: selectedAssignee.display_name }
              : {}),
          },
          existingCases
        );
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลเคสได้');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingCase) return;
    setSubmitting(true);
    try {
      await deleteCaseDoc(editingCase.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถลบเคสได้');
    } finally {
      setSubmitting(false);
    }
  };

  const displayTeamName = isNew ? currentUser.team_name : editingCase.team_name;
  const displayAssigneeName = isNew ? currentUser.display_name : editingCase.assignee_name;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="case-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 id="case-modal-title" className="text-base font-semibold text-slate-900">
              {isNew ? 'เปิดเคสใหม่ (To-Do Case)' : `ตรวจสอบ / แก้ไขเคส ${editingCase.case_no}`}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isNew
                ? 'ทีมและผู้รับเรื่องถูกผูกอัตโนมัติตามบัญชีที่เข้าสู่ระบบ'
                : `อัปเดตล่าสุด ${formatThaiDateTime(editingCase.updated_at)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Account-bound Team & Assignee Info */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-700">ข้อมูลผู้รับผิดชอบเคส</span>
              {!canReassign && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Lock className="w-3 h-3" />
                  <span>อ้างอิงจากบัญชีที่เข้าสู่ระบบ</span>
                </span>
              )}
            </div>

            {canReassign ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">ทีม / แผนก</label>
                  <select
                    value={teamId}
                    onChange={(e) => {
                      const nextTeam = e.target.value;
                      setTeamId(nextTeam);
                      const firstMember = assignableUsers.find((u) => u.team_id === nextTeam);
                      if (firstMember) setAssigneeId(firstMember.uid);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">ผู้รับเรื่อง</label>
                  <select
                    value={assigneeId}
                    onChange={(e) => {
                      const nextUserId = e.target.value;
                      setAssigneeId(nextUserId);
                      const found = assignableUsers.find((u) => u.uid === nextUserId);
                      if (found) setTeamId(found.team_id);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    {assignableUsers.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.display_name} ({u.team_name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-slate-500">ทีม / แผนก</div>
                  <div className="mt-0.5 font-medium text-slate-900">{displayTeamName}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">ผู้รับเรื่อง</div>
                  <div className="mt-0.5 font-medium text-slate-900">{displayAssigneeName}</div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="case-no" className="block text-sm font-medium text-slate-700 mb-1.5">
                เลขเคส <span className="text-red-600">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="case-no"
                  type="text"
                  required
                  value={caseNo}
                  onChange={(e) => setCaseNo(e.target.value)}
                  placeholder="เช่น CS-261125-001"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                {isNew && (
                  <button
                    type="button"
                    onClick={() => setCaseNo(generateCaseNo())}
                    className="rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    สุ่มใหม่
                  </button>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="shop-id" className="block text-sm font-medium text-slate-700 mb-1.5">
                ID SHOP <span className="text-red-600">*</span>
              </label>
              <input
                id="shop-id"
                type="text"
                required
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
                placeholder="เช่น SHP-10492"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="issue-summary" className="block text-sm font-medium text-slate-700 mb-1.5">
              รายละเอียดปัญหา (หัวข้อเคส) <span className="text-red-600">*</span>
            </label>
            <input
              id="issue-summary"
              type="text"
              required
              value={issueSummary}
              onChange={(e) => setIssueSummary(e.target.value)}
              placeholder="สรุปปัญหาที่พบ เช่น ร้านค้าไม่สามารถอัปเดตเมนูได้ / ระบบชำระเงินค้าง"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sla-due" className="block text-sm font-medium text-slate-700 mb-1.5">
                SLA (วันและเวลาครบกำหนด) <span className="text-red-600">*</span>
              </label>
              <input
                id="sla-due"
                type="datetime-local"
                required
                value={slaDueInput}
                onChange={(e) => setSlaDueInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setQuickSla('2h')}
                  className="rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2 py-1 text-xs text-slate-600 whitespace-nowrap cursor-pointer"
                >
                  +2 ชม.
                </button>
                <button
                  type="button"
                  onClick={() => setQuickSla('today18')}
                  className="rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2 py-1 text-xs text-slate-600 whitespace-nowrap cursor-pointer"
                >
                  วันนี้ 18:00
                </button>
                <button
                  type="button"
                  onClick={() => setQuickSla('tomorrow12')}
                  className="rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2 py-1 text-xs text-slate-600 whitespace-nowrap cursor-pointer"
                >
                  พรุ่งนี้ 12:00
                </button>
                <button
                  type="button"
                  onClick={() => setQuickSla('2d')}
                  className="rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2 py-1 text-xs text-slate-600 whitespace-nowrap cursor-pointer"
                >
                  +2 วัน
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="case-status" className="block text-sm font-medium text-slate-700 mb-1.5">
                สถานะงาน
              </label>
              <select
                id="case-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as CaseStatus)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="todo">รอดำเนินการ (To Do)</option>
                <option value="in_progress">กำลังดำเนินการ (In Progress)</option>
                <option value="done">ปิดเคสแล้ว (Done)</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="case-details" className="block text-sm font-medium text-slate-700 mb-1.5">
              รายละเอียดเพิ่มเติม / บันทึกการแก้ไข
            </label>
            <textarea
              id="case-details"
              rows={4}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="บันทึกรายละเอียดเพิ่มเติม ขั้นตอนการตรวจสอบ หรือผลการประสานงาน..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          {!isNew && history.length > 0 && (
            <div className="border-t border-slate-200 pt-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>ประวัติการกดรับทราบ SLA</span>
              </div>
              <div className="space-y-1.5">
                {history.map((h) => (
                  <div key={h.id} className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-slate-500 tabular-nums">{formatThaiDateTime(h.ack_at)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-slate-800">{h.user_name}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        h.ack_level === 'overdue' || h.ack_level === 'due_reached'
                          ? 'text-red-700'
                          : 'text-amber-700'
                      }
                    >
                      {h.ack_level === 'pre_30m'
                        ? 'รับทราบแจ้งเตือนก่อนกำหนด 30 นาที'
                        : h.ack_level === 'due_reached'
                          ? 'รับทราบเมื่อถึง/เกินกำหนด SLA'
                          : h.ack_level === 'overdue'
                            ? 'รับทราบเกิน SLA'
                            : 'รับทราบถึงกำหนด SLA'}
                    </span>
                    {h.note && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-600">{h.note}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 pt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              {canDelete && !confirmDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>ลบเคสนี้</span>
                </button>
              )}
              {canDelete && confirmDelete && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleDelete}
                    className="rounded-lg bg-red-600 hover:bg-red-700 px-3 py-2 text-xs font-medium text-white whitespace-nowrap cursor-pointer"
                  >
                    ยืนยันการลบ
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 px-5 py-2 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {submitting ? 'กำลังบันทึก...' : isNew ? 'บันทึกเปิดเคส' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
