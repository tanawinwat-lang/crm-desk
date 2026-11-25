import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMsg = error.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อข้อมูล';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; path?: string };
      if (parsed.error) {
        displayMsg = parsed.error.includes('Quota exceeded')
          ? 'ใช้งานเกินโควตาฟรีของวันนี้แล้ว กรุณาลองใหม่ในวันถัดไปหรืออัปเกรดแพ็กเกจ Firebase'
          : `ไม่สามารถเข้าถึงข้อมูล (${parsed.path ?? 'firestore'}): ${parsed.error}`;
      }
    } catch {
      // Non-JSON error message
    }
    return { hasError: true, message: displayMsg };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-700">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="text-base font-semibold text-slate-900">
                พบข้อขัดข้องในการเชื่อมต่อระบบ
              </h2>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-xs font-medium text-white cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>โหลดหน้าใหม่</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
