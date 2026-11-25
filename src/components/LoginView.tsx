import React, { useState } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import { signInWithGooglePopup } from '../lib/firestoreService.ts';
import { BrandLogo } from './BrandLogo.tsx';

interface LoginViewProps {
  checkingAuth: boolean;
  authError: string | null;
  onClearError: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  checkingAuth,
  authError,
  onClearError,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = authError || localError;

  const handleGoogleLogin = async () => {
    onClearError();
    setLocalError(null);
    setSubmitting(true);
    try {
      await signInWithGooglePopup();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้';
      if (message.includes('popup-closed-by-user')) {
        setLocalError('ยกเลิกการเข้าสู่ระบบ กรุณากดปุ่มเข้าสู่ระบบด้วย Google อีกครั้ง');
      } else {
        setLocalError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Brand & Operations Context Panel */}
      <div className="lg:w-5/12 bg-slate-900 text-slate-100 p-8 lg:p-14 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BrandLogo size="lg" />
            <div className="text-xl font-bold tracking-tight text-white">CRM Desk</div>
          </div>
          <p className="mt-2.5 text-sm text-slate-400">
            ระบบบริหารจัดการเคส To-Do List และติดตามกำหนด SLA แบบเรียลไทม์
          </p>
        </div>

        <div className="my-12 lg:my-0 space-y-8">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-white text-balance leading-snug">
              ติดตามทุกเคสค้างและกำหนด SLA ของแต่ละแผนกได้ในหน้าเดียว
            </h1>
            <p className="mt-4 text-sm text-slate-300 leading-relaxed max-w-md">
              บันทึกเลขเคส, ID SHOP และรายละเอียดปัญหา พร้อมซิงก์ข้อมูลถาวรแบบเรียลไทม์บน Firebase Firestore
            </p>
          </div>

          <div className="border-t border-slate-800 pt-6 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
            <div>
              <div className="font-semibold text-white">Admin</div>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                เพิ่มอีเมลบัญชีพนักงาน กำหนดสิทธิ์ ตำแหน่ง และจัดการแผนก
              </p>
            </div>
            <div>
              <div className="font-semibold text-white">TL (หัวหน้าทีม)</div>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                ตรวจสอบ แก้ไขข้อมูล และดูแดชบอร์ดภาพรวมทุกแผนก
              </p>
            </div>
            <div>
              <div className="font-semibold text-white">Agent</div>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                ติดตามและจัดการเคสเฉพาะภายในทีม/แผนกของตนเอง
              </p>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          รองรับแผนก Line OA · Call · Email · Social Media และทีมเพิ่มเติมที่กำหนดเอง
        </div>
      </div>

      {/* Right Authentication Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          {checkingAuth ? (
            <div className="space-y-4 py-8">
              <div className="h-6 bg-slate-100 rounded w-1/2 animate-pulse" />
              <div className="h-4 bg-slate-100 rounded w-3/4 animate-pulse" />
              <div className="h-11 bg-slate-100 rounded mt-6 animate-pulse" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-blue-700 text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>ยืนยันตัวตนผ่านบัญชี Google</span>
                </div>
                <h2 className="text-xl font-semibold text-slate-900">เข้าสู่ระบบปฏิบัติงาน</h2>
                <p className="text-sm text-slate-500 leading-relaxed">
                  ใช้อีเมล Google ที่ได้รับสิทธิ์จากผู้ดูแลระบบเพื่อเข้าใช้งาน ข้อมูลทั้งหมดจะถูกเก็บถาวรบนคลาวด์
                </p>
              </div>

              {displayError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {displayError}
                </div>
              )}

              <button
                type="button"
                disabled={submitting}
                onClick={handleGoogleLogin}
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 px-4 py-3 text-sm font-medium text-white transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4 shrink-0" />
                <span>{submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google'}</span>
              </button>

              <p className="text-xs text-slate-400 leading-relaxed">
                สำหรับทีมงานใหม่ กรุณาแจ้งอีเมล Google ของคุณให้ Admin เพิ่มสิทธิ์เข้าสู่ระบบก่อนเข้าสู่ระบบครั้งแรก
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
