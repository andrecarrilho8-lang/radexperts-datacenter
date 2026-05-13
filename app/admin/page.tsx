'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useDashboard } from '@/app/lib/context';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

interface UserRow {
  id: string;
  username: string;
  name: string;
  role: 'TOTAL' | 'NORMAL' | 'TRAFEGO' | 'COMERCIAL';
  createdAt: string;
}

const ROLE_COLORS: Record<string, string> = {
  TOTAL:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  NORMAL:   'bg-blue-50 text-blue-700 border-blue-100',
  TRAFEGO:  'bg-violet-50 text-violet-700 border-violet-200',
  COMERCIAL:'bg-orange-50 text-orange-700 border-orange-200',
};
const ROLE_LABELS: Record<string, string> = {
  TOTAL: 'Total', NORMAL: 'Normal', TRAFEGO: 'Tráfego', COMERCIAL: 'Comercial',
};

function AdminPanel() {
  const { authToken, userRole } = useDashboard();
  const [users, setUsers]       = useState<UserRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState({ username: '', password: '', name: '', role: 'NORMAL' });
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  // Edit modal state (senha + role)
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editPwd,  setEditPwd]  = useState('');
  const [editRole, setEditRole] = useState('');
  const [saving,   setSaving]   = useState(false);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` };

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/users', { headers });
    const data = await res.json();
    setUsers(data.users || []);
    setLoading(false);
  };

  useEffect(() => { if (authToken) load(); }, [authToken]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true); setError(''); setSuccess('');
    try {
      const res = await fetch('/api/admin/users', { method: 'POST', headers, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Erro ${res.status}`); setCreating(false); return; }
      setUsers(prev => [...prev, data.user]);
      setSuccess(`Usuário "${form.username}" criado com sucesso!`);
      setForm({ username: '', password: '', name: '', role: 'NORMAL' });
      setCreating(false);
    } catch (err: any) {
      setError(`Erro de conexão: ${err.message}`);
      setCreating(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Remover usuário "${name}"?`)) return;
    setUsers(prev => prev.filter(u => u.id !== id));
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers });
    if (!res.ok) load();
  };

  const openEdit = (u: UserRow) => {
    setEditUser(u);
    setEditPwd('');
    setEditRole(u.role);
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    setError(''); setSuccess('');

    const body: any = {};
    if (editPwd)              body.password = editPwd;
    if (editRole !== editUser.role) body.role = editRole;

    if (!body.password && !body.role) {
      // nothing changed
      setEditUser(null);
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH', headers, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Erro ${res.status}`); setSaving(false); return; }

      // Update local list
      setUsers(prev => prev.map(u =>
        u.id === editUser.id ? { ...u, role: (body.role || u.role) as UserRow['role'] } : u
      ));
      setSuccess('Usuário atualizado com sucesso!');
      setEditUser(null);
    } catch (err: any) {
      setError(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (userRole !== 'TOTAL') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500 font-black text-xl">Acesso negado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f3f3] pt-[80px] sm:pt-[100px] px-3 sm:px-6 pb-20 max-w-[900px] mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/resumo" className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 shadow-sm transition-all">
          <span className="material-symbols-outlined text-xl">arrow_back</span>
        </Link>
        <div>
          <h1 className="font-black text-2xl text-slate-900 leading-none">Gestão de Usuários</h1>
          <p className="text-xs text-slate-500 font-bold mt-1">Cadastre e gerencie acessos ao Data Center</p>
        </div>
      </div>

      {/* Permissões info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { color: 'bg-emerald-500', label: 'Acesso Total',     desc: 'Tudo — Meta, Hotmart, Cursos, Financeiro, ERP, Admin' },
          { color: 'bg-blue-500',    label: 'Acesso Normal',    desc: 'Resumo + Vendas + Tráfego + Cursos + Alunos + Leads (sem Financeiro/ERP)' },
          { color: 'bg-violet-500',  label: 'Acesso Tráfego',   desc: 'Resumo + área de Tráfego Pago apenas' },
          { color: 'bg-orange-500',  label: 'Acesso Comercial', desc: 'Vendas + Financeiro + ERP + Cursos + Alunos + Leads' },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <span className={`w-3 h-3 rounded-full ${item.color}`} />
              <p className="font-black text-sm text-slate-900 uppercase tracking-wider">{item.label}</p>
            </div>
            <p className="text-xs text-slate-500 font-bold">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mb-8">
        <h2 className="font-black text-sm uppercase tracking-widest text-slate-700 mb-5">Novo Usuário</h2>
        <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Nome</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-violet-400 transition-all"
              placeholder="Nome completo" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Usuário (login)</label>
            <input required value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-violet-400 transition-all"
              placeholder="nome_usuario" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Senha</label>
            <input required type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-violet-400 transition-all"
              placeholder="••••••••" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Permissão</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm text-slate-900 outline-none focus:border-violet-400 transition-all">
              <option value="COMERCIAL">Acesso Comercial</option>
              <option value="TRAFEGO">Acesso Tráfego</option>
              <option value="NORMAL">Acesso Normal</option>
              <option value="TOTAL">Acesso Total</option>
            </select>
          </div>
          <div className="col-span-2 flex items-center justify-between">
            <div>
              {error   && <p className="text-red-500 text-xs font-black">{error}</p>}
              {success && <p className="text-emerald-600 text-xs font-black">{success}</p>}
            </div>
            <button type="submit" disabled={creating}
              className="px-8 py-3 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-black transition-all shadow-lg disabled:opacity-50">
              {creating ? 'Criando...' : '+ Criar Usuário'}
            </button>
          </div>
        </form>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <h2 className="font-black text-sm uppercase tracking-widest text-slate-700">Usuários Cadastrados</h2>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 border-4 border-violet-500 border-t-white rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  {['Nome', 'Usuário', 'Permissão', 'Criado em', 'Ações'].map(h => (
                    <th key={h} className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-6 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-black text-sm text-slate-900">{u.name}</td>
                    <td className="px-6 py-4 font-bold text-sm text-slate-500 font-mono">{u.username}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${ROLE_COLORS[u.role] || ROLE_COLORS.NORMAL}`}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 font-bold">
                      {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(u)}
                          className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 transition-all flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">edit</span>
                          Editar
                        </button>
                        {u.username !== 'adv10x' && (
                          <button onClick={() => remove(u.id, u.name)}
                            className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-all">
                            Remover
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Edit modal (senha + role) */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[420px]">

            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-lg text-slate-900">Editar Usuário</h3>
                <p className="text-xs text-slate-500 font-bold mt-0.5">{editUser.name} · <span className="font-mono">{editUser.username}</span></p>
              </div>
              <button onClick={() => setEditUser(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-all">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-4">
              {/* Role selector */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">
                  Tipo de Acesso
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['TOTAL', 'NORMAL', 'TRAFEGO', 'COMERCIAL'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setEditRole(r)}
                      className={`px-4 py-3 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                        editRole === r
                          ? r === 'TOTAL'     ? 'bg-emerald-500 text-white border-emerald-500'
                          : r === 'NORMAL'    ? 'bg-blue-500 text-white border-blue-500'
                          : r === 'TRAFEGO'   ? 'bg-violet-500 text-white border-violet-500'
                          : 'bg-orange-500 text-white border-orange-500'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        editRole === r ? 'bg-white'
                        : r === 'TOTAL' ? 'bg-emerald-500'
                        : r === 'NORMAL' ? 'bg-blue-500'
                        : r === 'TRAFEGO' ? 'bg-violet-500'
                        : 'bg-orange-500'
                      }`} />
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
                {editRole !== editUser.role && (
                  <p className="text-[10px] font-bold text-orange-500 mt-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">info</span>
                    Alterando de <strong>{ROLE_LABELS[editUser.role]}</strong> para <strong>{ROLE_LABELS[editRole]}</strong>
                  </p>
                )}
              </div>

              {/* New password (optional) */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">
                  Nova Senha <span className="text-slate-300 normal-case">(deixe vazio para manter a atual)</span>
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={editPwd}
                  onChange={e => setEditPwd(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm outline-none focus:border-violet-400 transition-all"
                />
              </div>

              {error && <p className="text-red-500 text-xs font-black">{error}</p>}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setEditUser(null)}
                className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">
                Cancelar
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {saving
                  ? <span className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin" />
                  : <span className="material-symbols-outlined text-[14px]">save</span>
                }
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {success && !editUser && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl font-black text-sm flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          {success}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <LoginWrapper>
      <AdminPanel />
    </LoginWrapper>
  );
}
