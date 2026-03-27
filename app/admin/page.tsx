'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useDashboard } from '@/app/lib/context';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

interface UserRow {
  id: string;
  username: string;
  name: string;
  role: 'TOTAL' | 'NORMAL';
  createdAt: string;
}

function AdminPanel() {
  const { authToken, userRole } = useDashboard();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ username: '', password: '', name: '', role: 'NORMAL' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetPwd, setResetPwd] = useState<{ id: string; pwd: string } | null>(null);

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
      // Optimistic update — add directly to list without relying on GET from another instance
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
    // Optimistic removal
    setUsers(prev => prev.filter(u => u.id !== id));
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers });
    if (!res.ok) {
      // Rollback on failure
      load();
    }
  };

  const resetPassword = async () => {
    if (!resetPwd || !resetPwd.pwd) return;
    await fetch(`/api/admin/users/${resetPwd.id}`, { method: 'PATCH', headers, body: JSON.stringify({ password: resetPwd.pwd }) });
    setResetPwd(null);
    setSuccess('Senha alterada com sucesso!');
  };

  if (userRole !== 'TOTAL') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500 font-black text-xl">Acesso negado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f3f3] pt-[100px] px-6 pb-20 max-w-[900px] mx-auto">
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
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500" />
            <p className="font-black text-sm text-slate-900 uppercase tracking-wider">Acesso Total</p>
          </div>
          <p className="text-xs text-slate-500 font-bold">Meta Ads + Hotmart + Histórico + Admin</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <p className="font-black text-sm text-slate-900 uppercase tracking-wider">Acesso Normal</p>
          </div>
          <p className="text-xs text-slate-500 font-bold">Meta Ads apenas (Resumo + Campanhas)</p>
        </div>
      </div>

      {/* Create form */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mb-8">
        <h2 className="font-black text-sm uppercase tracking-widest text-slate-700 mb-5">Novo Usuário</h2>
        <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Nome</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm outline-none focus:border-violet-400 transition-all"
              placeholder="Nome completo" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Usuário (login)</label>
            <input required value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm outline-none focus:border-violet-400 transition-all"
              placeholder="nome_usuario" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Senha</label>
            <input required type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm outline-none focus:border-violet-400 transition-all"
              placeholder="••••••••" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Permissão</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm outline-none focus:border-violet-400 transition-all">
              <option value="NORMAL">Acesso Normal (só Meta)</option>
              <option value="TOTAL">Acesso Total (Meta + Hotmart)</option>
            </select>
          </div>
          <div className="col-span-2 flex items-center justify-between">
            <div>
              {error && <p className="text-red-500 text-xs font-black">{error}</p>}
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
                      <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                        u.role === 'TOTAL'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-blue-50 text-blue-700 border-blue-100'
                      }`}>
                        {u.role === 'TOTAL' ? 'Total' : 'Normal'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 font-bold">
                      {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => setResetPwd({ id: u.id, pwd: '' })}
                          className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all">
                          Senha
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

      {/* Reset password modal */}
      {resetPwd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 shadow-2xl w-[360px]">
            <h3 className="font-black text-lg text-slate-900 mb-4">Alterar Senha</h3>
            <input type="password" placeholder="Nova senha" value={resetPwd.pwd}
              onChange={e => setResetPwd(r => r ? { ...r, pwd: e.target.value } : null)}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm outline-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setResetPwd(null)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-black text-xs uppercase">Cancelar</button>
              <button onClick={resetPassword} className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-black text-xs uppercase">Salvar</button>
            </div>
          </div>
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
