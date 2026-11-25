import type { AlertStage, CaseItem, CaseStatus, RoleLevel, SlaState } from '../types.ts';

export const PRE_ALERT_WINDOW_MS = 30 * 60 * 1000;

export function computeLiveSlaState(slaDueAtIso: string, status: CaseStatus, nowMs: number): SlaState {
  if (status === 'done') return 'resolved';
  const dueMs = new Date(slaDueAtIso).getTime();
  if (Number.isNaN(dueMs)) return 'normal';
  const diff = dueMs - nowMs;
  if (diff < 0) return 'overdue';

  const nowDate = new Date(nowMs);
  const dueDate = new Date(dueMs);
  const sameDay =
    nowDate.getFullYear() === dueDate.getFullYear() &&
    nowDate.getMonth() === dueDate.getMonth() &&
    nowDate.getDate() === dueDate.getDate();

  if (diff <= 24 * 60 * 60 * 1000 || sameDay) {
    return 'due_today';
  }
  return 'normal';
}

export function computeAlertStage(
  slaDueAtIso: string,
  status: CaseStatus,
  nowMs: number
): AlertStage | null {
  if (status === 'done') return null;
  const dueMs = new Date(slaDueAtIso).getTime();
  if (Number.isNaN(dueMs)) return null;
  const diff = dueMs - nowMs;
  if (diff <= 0) return 'due_reached';
  if (diff <= PRE_ALERT_WINDOW_MS) return 'pre_30m';
  return null;
}

export function needsUserAck(item: CaseItem, nowMs: number): boolean {
  const stage = computeAlertStage(item.sla_due_at, item.status, nowMs);
  if (!stage) return false;
  const acked = item.my_ack_stages ?? [];
  if (stage === 'pre_30m') {
    return !acked.includes('pre_30m') && !acked.includes('due_reached');
  }
  return !acked.includes('due_reached');
}

export function formatThaiDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDurationThai(msAbs: number): string {
  const totalMinutes = Math.max(1, Math.floor(msAbs / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days} วัน ${hours} ชม.` : `${days} วัน`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours} ชม. ${minutes} น.` : `${hours} ชม.`;
  }
  return `${minutes} นาที`;
}

export function formatSlaCountdown(slaDueAtIso: string, status: CaseStatus, nowMs: number): string {
  if (status === 'done') return 'ปิดเคสแล้ว';
  const dueMs = new Date(slaDueAtIso).getTime();
  if (Number.isNaN(dueMs)) return '-';
  const diff = dueMs - nowMs;
  if (diff < 0) {
    return `เกิน SLA ${formatDurationThai(Math.abs(diff))}`;
  }
  return `เหลือ ${formatDurationThai(diff)}`;
}

export function getStatusLabel(status: CaseStatus): string {
  switch (status) {
    case 'todo':
      return 'รอดำเนินการ';
    case 'in_progress':
      return 'กำลังดำเนินการ';
    case 'done':
      return 'ปิดเคสแล้ว';
  }
}

export function getSlaLabel(state: SlaState): string {
  switch (state) {
    case 'overdue':
      return 'เกินกำหนด SLA';
    case 'due_today':
      return 'ถึงกำหนด SLA';
    case 'normal':
      return 'อยู่ในเกณฑ์ปกติ';
    case 'resolved':
      return 'เสร็จสิ้น';
  }
}

export function getRoleLabel(role: RoleLevel): string {
  switch (role) {
    case 'admin':
      return 'Admin (ผู้ดูแลระบบ)';
    case 'tl':
      return 'TL (หัวหน้าทีม)';
    case 'agent':
      return 'Agent (เจ้าหน้าที่)';
  }
}

export function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
