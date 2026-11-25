import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FolderKanban,
  Plus,
} from 'lucide-react';
import {
  computeLiveSlaState,
  formatSlaCountdown,
  formatThaiDateTime,
  getSlaLabel,
  getStatusLabel,
  needsUserAck,
} from '../lib/sla.ts';
import type { CaseItem, CaseStatus, DashboardSummary, UserPublic } from '../types.ts';

interface DashboardViewProps {
  currentUser: UserPublic;
  summary: DashboardSummary | null;
  cases: CaseItem[];
  nowMs: number;
  loading: boolean;
  onCreateCase: () => void;
  onInspectCase: (item: CaseItem) => void;
  onQuickStatus: (item: CaseItem, nextStatus: CaseStatus) => Promise<void>;
  onOpenAlertModal: () => void;
  onFilterByTeam: (teamId: string | null) => void;
  onGoToCases: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  summary,
  cases,
  nowMs,
  loading,
  onCreateCase,
  onInspectCase,
  onQuickStatus,
  onOpenAlertModal,
  onFilterByTeam,
  onGoToCases,
}) => {
  const isAgent = currentUser.role === 'agent';

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl p-5 animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-xl p-6 animate-pulse" />
      </div>
    );
  }

  // Recompute live counts from cases array so dashboard updates every tick even before next API poll
  const activeCases = cases.filter((c) => c.status !== 'done');
  const resolvedCount = cases.filter((c) => c.status === 'done').length;
  const dueTodayCases = activeCases.filter(
    (c) => computeLiveSlaState(c.sla_due_at, c.status, nowMs) === 'due_today'
  );
  const overdueCases = activeCases.filter(
    (c) => computeLiveSlaState(c.sla_due_at, c.status, nowMs) === 'overdue'
  );
  const unackCount = activeCases.filter((c) => needsUserAck(c, nowMs)).length;

  const urgentQueue = [...activeCases]
    .sort((a, b) => new Date(a.sla_due_at).getTime() - new Date(b.sla_due_at).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Scope Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {isAgent ? `แดชบอร์ดติดตามเคส — ทีม ${currentUser.team_name}` : 'แดชบอร์ดภาพรวมเคสและ SLA ทุกแผนก'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isAgent
              ? `แสดงเฉพาะรายการเคสและสถานะ SLA ภายใต้แผนก ${currentUser.team_name} แบบเรียลไทม์`
              : 'ติดตามปริมาณงานค้าง สถานะถึงกำหนดและเกิน SLA แบบเรียลไทม์ทุกแผนก'}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {unackCount > 0 && (
            <button
              type="button"
              onClick={onOpenAlertModal}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 px-3.5 py-2 text-xs font-semibold text-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="tabular-nums">รอรับทราบ SLA ({unackCount})</span>
            </button>
          )}
          <button
            type="button"
            onClick={onCreateCase}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 px-4 py-2 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>เปิดเคสใหม่</span>
          </button>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>เคสค้างดำเนินการทั้งหมด</span>
            <FolderKanban className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-3 text-3xl font-semibold text-slate-900 font-mono tabular-nums">
            {activeCases.length}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            รอดำเนินการ {activeCases.filter((c) => c.status === 'todo').length} · กำลังทำ{' '}
            {activeCases.filter((c) => c.status === 'in_progress').length}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-amber-700">
            <span>ถึงกำหนด SLA (วันนี้ / 24 ชม.)</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-3 text-3xl font-semibold text-amber-700 font-mono tabular-nums">
            {dueTodayCases.length}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            เคสที่กำลังจะครบกำหนดในรอบวัน
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-red-700">
            <span>เกินกำหนด SLA (Overdue)</span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-3 text-3xl font-semibold text-red-700 font-mono tabular-nums">
            {overdueCases.length}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            ต้องเร่งแก้ไขและกดรับทราบสถานะ
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-emerald-700">
            <span>ปิดเคสสำเร็จแล้ว</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-3 text-3xl font-semibold text-emerald-700 font-mono tabular-nums">
            {resolvedCount}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            จากทั้งหมด {cases.length} เคสในขอบเขต
          </div>
        </div>
      </div>

      {/* Main Content Split: Team Overview + Urgent Queue */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Team / Assignee Breakdown */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {isAgent ? `ปริมาณงานภายในทีม ${currentUser.team_name}` : 'สรุปภาระงานแยกตามทีม / แผนก'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAgent ? 'รายชื่อผู้รับเรื่องในแผนกเดียวกัน' : 'คลิกชื่อทีมเพื่อกรองรายการเคส'}
              </p>
            </div>
          </div>

          {!isAgent && summary ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">แผนก / ทีม</th>
                    <th className="py-2.5 px-3 text-right">ค้าง</th>
                    <th className="py-2.5 px-3 text-right text-amber-700">ถึง SLA</th>
                    <th className="py-2.5 px-3 text-right text-red-700">เกิน SLA</th>
                    <th className="py-2.5 px-4 text-right text-emerald-700">ปิดแล้ว</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.team_stats.map((ts) => (
                    <tr
                      key={ts.team_id}
                      onClick={() => onFilterByTeam(ts.team_id)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 font-medium text-slate-900">{ts.team_name}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800">
                        {ts.total_open}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-700 font-medium">
                        {ts.due_today_count}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-red-700 font-semibold">
                        {ts.overdue_count}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                        {ts.done_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">ผู้รับเรื่อง</th>
                    <th className="py-2.5 px-3 text-right">ค้าง</th>
                    <th className="py-2.5 px-3 text-right text-amber-700">ถึง SLA</th>
                    <th className="py-2.5 px-3 text-right text-red-700">เกิน SLA</th>
                    <th className="py-2.5 px-4 text-right text-emerald-700">ปิดแล้ว</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary && summary.assignee_stats.length > 0 ? (
                    summary.assignee_stats.map((asg) => (
                      <tr key={asg.user_id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {asg.display_name}
                          {asg.user_id === currentUser.uid && (
                            <span className="ml-1.5 text-xs text-blue-700 font-normal">(คุณ)</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800">
                          {asg.total_open}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-700 font-medium">
                          {asg.due_today_count}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-red-700 font-semibold">
                          {asg.overdue_count}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                          {asg.done_count}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                        ยังไม่มีเคสในแผนก {currentUser.team_name}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Real-Time Active SLA Queue */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">คิวงานค้างเรียงตามกำหนด SLA แบบเรียลไทม์</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                อัปเดตตัวนับเวลาถอยหลังอัตโนมัติทุกวินาทีที่ค้างอยู่
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToCases}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>ดู To-Do ทั้งหมด</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {urgentQueue.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-3" />
              <div className="text-sm font-medium text-slate-900">ไม่มีเคสค้างดำเนินการในขณะนี้</div>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                คุณสามารถกดปุ่ม &ldquo;เปิดเคสใหม่&rdquo; เพื่อเพิ่มงาน To-Do และกำหนด SLA ได้ทันที
              </p>
              <button
                type="button"
                onClick={onCreateCase}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 px-4 py-2 text-xs font-medium text-white transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เปิดเคสแรก</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {urgentQueue.map((item) => {
                const liveSla = computeLiveSlaState(item.sla_due_at, item.status, nowMs);
                const countdown = formatSlaCountdown(item.sla_due_at, item.status, nowMs);
                return (
                  <div
                    key={item.id}
                    className="px-5 py-3.5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {item.case_no}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-700 tabular-nums">SHOP {item.shop_id}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-700">{item.team_name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.assignee_name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onInspectCase(item)}
                        className="text-left text-sm font-medium text-slate-900 hover:text-blue-700 transition-colors truncate block max-w-full cursor-pointer"
                      >
                        {item.issue_summary}
                      </button>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                        <span
                          className={`font-medium tabular-nums ${
                            liveSla === 'overdue'
                              ? 'text-red-700'
                              : liveSla === 'due_today'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                          }`}
                        >
                          {getSlaLabel(liveSla)} ({countdown})
                        </span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="text-slate-500 tabular-nums">
                          กำหนด {formatThaiDateTime(item.sla_due_at)}
                        </span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="text-slate-600">{getStatusLabel(item.status)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onQuickStatus(item, item.status === 'todo' ? 'in_progress' : 'done')
                        }
                        className="rounded-lg border border-slate-300 bg-white hover:bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {item.status === 'todo' ? 'เริ่มดำเนินการ' : 'ปิดเคส'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onInspectCase(item)}
                        className="rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        รายละเอียด
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
