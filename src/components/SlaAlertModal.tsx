import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bell, Check, Clock, ExternalLink, Volume2, VolumeX, X } from 'lucide-react';
import { playBellChime, unlockAudio } from '../lib/bell.ts';
import { computeAlertStage, formatSlaCountdown, formatThaiDateTime } from '../lib/sla.ts';
import type { CaseItem } from '../types.ts';

interface SlaAlertModalProps {
  open: boolean;
  alerts: CaseItem[];
  nowMs: number;
  alertNonce: number;
  onAcknowledgeOne: (item: CaseItem, note?: string) => Promise<void>;
  onAcknowledgeAll: (items: CaseItem[]) => Promise<void>;
  onInspectCase: (item: CaseItem) => void;
  onClose: () => void;
}

export const SlaAlertModal: React.FC<SlaAlertModalProps> = ({
  open,
  alerts,
  nowMs,
  alertNonce,
  onAcknowledgeOne,
  onAcknowledgeAll,
  onInspectCase,
  onClose,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const dueReachedList = alerts.filter(
    (c) => computeAlertStage(c.sla_due_at, c.status, nowMs) === 'due_reached'
  );
  const pre30mList = alerts.filter(
    (c) => computeAlertStage(c.sla_due_at, c.status, nowMs) === 'pre_30m'
  );
  const hasDueReached = dueReachedList.length > 0;

  // Unmute automatically whenever the popup opens or a repeat notification fires
  useEffect(() => {
    if (open && alerts.length > 0) {
      setMuted(false);
    }
  }, [open, alerts.length, alertNonce]);

  // Play bell chime on a continuous loop while popup is open & unacknowledged
  useEffect(() => {
    if (!open || alerts.length === 0 || muted) {
      return;
    }

    let cancelled = false;

    const ringOnce = async () => {
      if (cancelled) return;
      const played = await playBellChime(hasDueReached);
      if (!cancelled) {
        setAudioBlocked(!played);
      }
    };

    void ringOnce();
    const intervalId = setInterval(() => {
      void ringOnce();
    }, 2600);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [open, alerts.length, muted, hasDueReached]);

  if (!open || alerts.length === 0) return null;

  const handleToggleSound = async () => {
    if (audioBlocked) {
      const ok = await unlockAudio();
      setAudioBlocked(!ok);
      setMuted(false);
      if (ok) {
        void playBellChime(hasDueReached);
      }
      return;
    }
    setMuted((prev) => !prev);
  };

  const handleAckOne = async (item: CaseItem) => {
    setBusyId(item.id);
    try {
      await onAcknowledgeOne(item, notes[item.id] || '');
      setNotes((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleAckAll = async () => {
    setBusyId('__all__');
    try {
      await onAcknowledgeAll(alerts);
      setNotes({});
    } finally {
      setBusyId(null);
    }
  };

  const renderGroup = (title: string, items: CaseItem[], isDueReached: boolean) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className={`flex items-center gap-2 text-sm font-semibold ${isDueReached ? 'text-red-700' : 'text-amber-700'}`}>
            {isDueReached ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Clock className="w-4 h-4 shrink-0" />}
            <span>{title}</span>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">{items.length} เคส</span>
        </div>

        <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
          {items.map((item) => (
            <div key={item.id} className="p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">{item.case_no}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-700 tabular-nums">SHOP {item.shop_id}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-700">{item.team_name}</span>
                    <span aria-hidden="true">·</span>
                    <span>ผู้รับเรื่อง: {item.assignee_name}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900">{item.issue_summary}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className={`font-medium tabular-nums ${isDueReached ? 'text-red-700' : 'text-amber-700'}`}>
                      {formatSlaCountdown(item.sla_due_at, item.status, nowMs)}
                    </span>
                    <span className="text-slate-400" aria-hidden="true">·</span>
                    <span className="text-slate-500 tabular-nums">
                      ครบกำหนด: {formatThaiDateTime(item.sla_due_at)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onInspectCase(item);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>ดูเคส</span>
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => handleAckOne(item)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                      isDueReached ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{busyId === item.id ? 'กำลังบันทึก...' : 'กดรับทราบ'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={notes[item.id] ?? ''}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="บันทึกหมายเหตุการรับทราบเพิ่มเติม (ไม่บังคับ)..."
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sla-popup-title"
    >
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col bg-slate-50 border border-slate-200 rounded-xl shadow-xl overflow-hidden">
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-700 shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="sla-popup-title" className="text-base font-semibold text-slate-900">
                แจ้งเตือน SLA ({alerts.length} รายการ)
              </h2>
              <p className="text-xs text-slate-500">
                แจ้งเตือนก่อนครบกำหนด 30 นาที และเมื่อถึงกำหนด — หยุดแจ้งเตือนเฉพาะผู้ที่กดรับทราบแล้ว
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleSound}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                audioBlocked
                  ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  : muted
                    ? 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    : 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'
              }`}
            >
              {muted || audioBlocked ? (
                <VolumeX className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {audioBlocked
                  ? 'กดเปิดเสียงกระดิ่ง'
                  : muted
                    ? 'ปิดเสียงอยู่'
                    : 'เสียงกระดิ่งกำลังดัง'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่างชั่วคราว"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {renderGroup('ถึงกำหนด / เกินเวลา SLA แล้ว (แจ้งเตือนครั้งที่ 2)', dueReachedList, true)}
          {renderGroup('ใกล้ถึงกำหนด SLA ภายใน 30 นาที (แจ้งเตือนล่วงหน้า)', pre30mList, false)}
        </div>

        <div className="bg-white border-t border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            หากยังไม่กดรับทราบ ระบบจะแจ้งเตือนซ้ำอัตโนมัติทุก 30 วินาที จนกว่าคุณจะกดรับทราบ
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              ซ่อนชั่วคราว (แจ้งเตือนซ้ำใน 30 วิ)
            </button>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={handleAckAll}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 px-4 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{busyId === '__all__' ? 'กำลังบันทึก...' : `กดรับทราบทั้งหมด (${alerts.length} เคส)`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
