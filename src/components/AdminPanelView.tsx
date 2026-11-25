import React, { useState } from 'react';
import { KeyRound, Mail, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import {
  createPositionDoc,
  createStaffMemberDoc,
  createTeamDoc,
  deletePositionDoc,
  deleteStaffMemberDoc,
  deleteTeamDoc,
  updateStaffMemberDoc,
} from '../lib/firestoreService.ts';
import { getRoleLabel } from '../lib/sla.ts';
import type { CaseItem, Position, RoleLevel, StaffEntry, Team, UserPublic } from '../types.ts';

interface AdminPanelViewProps {
  currentUser: UserPublic;
  teams: Team[];
  positions: Position[];
  staffList: StaffEntry[];
  cases: CaseItem[];
}

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  currentUser,
  teams,
  positions,
  staffList,
  cases,
}) => {
  const [tab, setTab] = useState<'users' | 'teams' | 'positions'>('users');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create / Edit Staff User form state
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffEntry | null>(null);
  const [uEmail, setUEmail] = useState('');
  const [uDisplayName, setUDisplayName] = useState('');
  const [uPositionId, setUPositionId] = useState<string>(positions[0]?.id ?? '');
  const [uTeamId, setUTeamId] = useState<string>(teams[0]?.id ?? '');
  const [uActive, setUActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Add Team state
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');

  // Add Position state
  const [newPosName, setNewPosName] = useState('');
  const [newPosLevel, setNewPosLevel] = useState<RoleLevel>('agent');

  const openCreateUser = () => {
    setEditingStaff(null);
    setUEmail('');
    setUDisplayName('');
    setUPositionId(positions.find((p) => p.role_level === 'agent')?.id ?? positions[0]?.id ?? '');
    setUTeamId(teams[0]?.id ?? '');
    setUActive(true);
    setError(null);
    setSuccessMsg(null);
    setShowUserForm(true);
  };

  const openEditUser = (s: StaffEntry) => {
    setEditingStaff(s);
    setUEmail(s.email);
    setUDisplayName(s.display_name);
    setUPositionId(s.position_id);
    setUTeamId(s.team_id);
    setUActive(s.is_active);
    setError(null);
    setSuccessMsg(null);
    setShowUserForm(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const selectedPos = positions.find((p) => p.id === uPositionId);
      const selectedTeam = teams.find((t) => t.id === uTeamId);
      if (!selectedPos || !selectedTeam) {
        throw new Error('กรุณาเลือกตำแหน่งและทีม / แผนกให้ถูกต้อง');
      }

      if (editingStaff) {
        await updateStaffMemberDoc(
          currentUser,
          editingStaff,
          {
            display_name: uDisplayName,
            position: selectedPos,
            team: selectedTeam,
            is_active: uActive,
          },
          staffList
        );
        setSuccessMsg(`อัปเดตบัญชี "${editingStaff.email}" เรียบร้อยแล้ว`);
      } else {
        await createStaffMemberDoc({
          email: uEmail,
          display_name: uDisplayName,
          position: selectedPos,
          team: selectedTeam,
        });
        setSuccessMsg(`เพิ่มบัญชี "${uEmail.trim().toLowerCase()}" เรียบร้อยแล้ว (บันทึกลงฐานข้อมูลคลาวด์ถาวร)`);
      }
      setShowUserForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลผู้ใช้ได้');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (s: StaffEntry) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await deleteStaffMemberDoc(currentUser, s);
      setSuccessMsg(`ลบบัญชี "${s.email}" เรียบร้อยแล้ว`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถลบบัญชีผู้ใช้ได้');
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      await createTeamDoc({ name: newTeamName, description: newTeamDesc }, teams);
      setNewTeamName('');
      setNewTeamDesc('');
      setSuccessMsg('เพิ่มแผนก / ทีมใหม่เรียบร้อยแล้ว');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถเพิ่มทีมได้');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await deleteTeamDoc(team, staffList, cases);
      setSuccessMsg(`ลบทีม "${team.name}" เรียบร้อยแล้ว`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถลบทีมได้');
    }
  };

  const handleCreatePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      await createPositionDoc({ name: newPosName, role_level: newPosLevel }, positions);
      setNewPosName('');
      setNewPosLevel('agent');
      setSuccessMsg('เพิ่มตำแหน่งใหม่เรียบร้อยแล้ว');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถเพิ่มตำแหน่งได้');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePosition = async (pos: Position) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await deletePositionDoc(pos, staffList);
      setSuccessMsg(`ลบตำแหน่ง "${pos.name}" เรียบร้อยแล้ว`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถลบตำแหน่งได้');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">จัดการบัญชีผู้ใช้ ตำแหน่ง และแผนก</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            เพิ่มอีเมลพนักงาน กำหนดสิทธิ์ Admin, TL, Agent และจัดการทีมปฏิบัติงาน (เก็บข้อมูลถาวรบน Firestore)
          </p>
        </div>

        {tab === 'users' && (
          <button
            type="button"
            onClick={openCreateUser}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 hover:bg-blue-800 px-4 py-2 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            <span>เพิ่มผู้ใช้งานใหม่</span>
          </button>
        )}
      </div>

      {/* Sub-Navigation Segmented Tabs */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
        <button
          type="button"
          onClick={() => {
            setTab('users');
            setError(null);
            setSuccessMsg(null);
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            tab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>บัญชีผู้ใช้ ({staffList.length})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('teams');
            setError(null);
            setSuccessMsg(null);
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            tab === 'teams' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>ทีม / แผนก ({teams.length})</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('positions');
            setError(null);
            setSuccessMsg(null);
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            tab === 'positions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>ตำแหน่งและสิทธิ์ ({positions.length})</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMsg}
        </div>
      )}

      {/* USERS TAB */}
      {tab === 'users' && (
        <div className="space-y-5">
          {showUserForm && (
            <form
              onSubmit={handleSaveUser}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  {editingStaff ? `แก้ไขบัญชีผู้ใช้: ${editingStaff.email}` : 'เพิ่มบัญชีผู้ใช้งาน (Google Email)'}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowUserForm(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  ปิดฟอร์ม
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Google Email <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      disabled={Boolean(editingStaff)}
                      value={uEmail}
                      onChange={(e) => setUEmail(e.target.value)}
                      placeholder="เช่น somchai@gmail.com"
                      className="w-full rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ชื่อ-นามสกุล (ผู้รับเรื่อง) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={uDisplayName}
                    onChange={(e) => setUDisplayName(e.target.value)}
                    placeholder="เช่น สมชาย สายตรง"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ตำแหน่ง / สิทธิ์การใช้งาน
                  </label>
                  <select
                    value={uPositionId}
                    onChange={(e) => setUPositionId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {getRoleLabel(p.role_level)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    แผนก / ทีมที่สังกัด
                  </label>
                  <select
                    value={uTeamId}
                    onChange={(e) => setUTeamId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {editingStaff && (
                  <div className="sm:col-span-2 flex items-center pt-1">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={uActive}
                        onChange={(e) => setUActive(e.target.checked)}
                        className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                      <span>เปิดใช้งานบัญชีนี้</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUserForm(false)}
                  className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 px-5 py-2 text-xs font-medium text-white cursor-pointer"
                >
                  {submitting ? 'กำลังบันทึก...' : editingStaff ? 'บันทึกการแก้ไข' : 'เพิ่มบัญชีผู้ใช้'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-3 px-5">อีเมล Google</th>
                    <th className="py-3 px-4">ชื่อผู้รับเรื่อง</th>
                    <th className="py-3 px-4">ตำแหน่ง (สิทธิ์)</th>
                    <th className="py-3 px-4">ทีม / แผนก</th>
                    <th className="py-3 px-4">สถานะ</th>
                    <th className="py-3 px-5 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {staffList.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-5 font-mono text-xs font-medium text-slate-900">
                        {s.email}
                        {s.linked_uid === currentUser.uid && (
                          <span className="ml-1.5 font-sans text-blue-700">(คุณ)</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-900">{s.display_name}</td>
                      <td className="py-3.5 px-4 text-xs">
                        <span className="font-medium text-slate-900">{s.position_name}</span>
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="text-slate-500">{getRoleLabel(s.role)}</span>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-700">{s.team_name}</td>
                      <td className="py-3.5 px-4 text-xs space-x-2">
                        <span className={s.is_active ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                          {s.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                        </span>
                        {!s.linked_uid && (
                          <span className="text-slate-400">· รอเข้าสู่ระบบครั้งแรก</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditUser(s)}
                            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
                          >
                            แก้ไขสิทธิ์ / ทีม
                          </button>
                          {s.linked_uid !== currentUser.uid && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(s)}
                              aria-label={`ลบบัญชี ${s.email}`}
                              className="rounded-lg border border-red-200 bg-white hover:bg-red-50 p-1.5 text-red-700 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TEAMS TAB */}
      {tab === 'teams' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 h-fit">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">เพิ่มทีม / แผนกใหม่</h2>
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ชื่อทีม / แผนก <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="เช่น Live Chat / VIP Support"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">คำอธิบาย</label>
                <textarea
                  rows={3}
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="รายละเอียดขอบเขตงานของแผนก"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 px-4 py-2 text-xs font-medium text-white cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มทีมใหม่</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-3 px-5">ชื่อทีม / แผนก</th>
                  <th className="py-3 px-4">รายละเอียด</th>
                  <th className="py-3 px-4 text-right">สมาชิก</th>
                  <th className="py-3 px-4 text-right">เคส</th>
                  <th className="py-3 px-5 text-right">ลบ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {teams.map((t) => {
                  const memberCount = staffList.filter((s) => s.team_id === t.id).length;
                  const caseCount = cases.filter((c) => c.team_id === t.id).length;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-5 font-medium text-slate-900 whitespace-nowrap">{t.name}</td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">{t.description || '-'}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                        {memberCount}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                        {caseCount}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteTeam(t)}
                          aria-label={`ลบทีม ${t.name}`}
                          className="rounded-lg border border-red-200 bg-white hover:bg-red-50 p-1.5 text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* POSITIONS TAB */}
      {tab === 'positions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 h-fit">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">เพิ่มตำแหน่งงานใหม่</h2>
            <form onSubmit={handleCreatePosition} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ชื่อตำแหน่ง <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newPosName}
                  onChange={(e) => setNewPosName(e.target.value)}
                  placeholder="เช่น Senior Agent / Supervisor"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ระดับสิทธิ์ที่ผูกกับตำแหน่ง
                </label>
                <select
                  value={newPosLevel}
                  onChange={(e) => setNewPosLevel(e.target.value as RoleLevel)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="agent">Agent — เห็นและจัดการเฉพาะทีมตนเอง</option>
                  <option value="tl">TL — ตรวจสอบ แก้ไข และดูภาพรวมทุกทีม</option>
                  <option value="admin">Admin — สิทธิ์ผู้ดูแลระบบเต็มรูปแบบ</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 px-4 py-2 text-xs font-medium text-white cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มตำแหน่งใหม่</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-3 px-5">ชื่อตำแหน่ง</th>
                  <th className="py-3 px-4">ระดับสิทธิ์</th>
                  <th className="py-3 px-4 text-right">ผู้ใช้งาน</th>
                  <th className="py-3 px-5 text-right">ลบ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {positions.map((p) => {
                  const userCount = staffList.filter((s) => s.position_id === p.id).length;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-5 font-medium text-slate-900">{p.name}</td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">{getRoleLabel(p.role_level)}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                        {userCount}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        {p.is_system ? (
                          <span className="text-xs text-slate-400">ตำแหน่งหลัก</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDeletePosition(p)}
                            aria-label={`ลบตำแหน่ง ${p.name}`}
                            className="rounded-lg border border-red-200 bg-white hover:bg-red-50 p-1.5 text-red-700 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
