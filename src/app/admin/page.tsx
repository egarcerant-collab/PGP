'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, UserPlus, Trash2, Edit2, Check, X, Shield,
  Users, ArrowLeft, ToggleLeft, ToggleRight, RefreshCw,
} from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  nombre: string;
  rol: 'superadmin' | 'auditor' | 'viewer';
  activo: boolean;
  created_at: string;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

const ROL_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  auditor: 'Auditor',
  viewer: 'Visualizador',
};

const ROL_COLORS: Record<string, string> = {
  superadmin: 'bg-red-100 text-red-700 border-red-200',
  auditor: 'bg-blue-100 text-blue-700 border-blue-200',
  viewer: 'bg-slate-100 text-slate-600 border-slate-200',
};

let toastId = 0;

export default function AdminPage() {
  const router = useRouter();

  // Password gate
  const [unlocked, setUnlocked] = useState(false);
  const [gatePw, setGatePw] = useState('');
  const [gateError, setGateError] = useState('');
  const [gateLoading, setGateLoading] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('admin_unlocked') === '1') setUnlocked(true);
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateLoading(true);
    setGateError('');
    try {
      const res = await fetch('/api/admin/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: gatePw }),
      });
      if (res.ok) {
        sessionStorage.setItem('admin_unlocked', '1');
        setUnlocked(true);
      } else {
        setGateError('Contraseña incorrecta.');
      }
    } catch {
      setGateError('Error de conexión.');
    } finally {
      setGateLoading(false);
    }
  };

  const [usuarios, setUsuarios] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Create user modal
  const [showModal, setShowModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [newRol, setNewRol] = useState<'superadmin' | 'auditor' | 'viewer'>('auditor');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRol, setEditRol] = useState<'superadmin' | 'auditor' | 'viewer'>('auditor');
  const [editNombre, setEditNombre] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Deleting
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/usuarios');
      if (!res.ok) throw new Error('Error al cargar usuarios');
      const data = await res.json();
      setUsuarios(data.usuarios || []);
    } catch {
      addToast('Error al cargar la lista de usuarios', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      setCurrentUserId(data.user?.id || null);
    }
  }, []);

  useEffect(() => {
    fetchUsuarios();
    fetchCurrentUser();
  }, [fetchUsuarios, fetchCurrentUser]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, nombre: newNombre, rol: newRol }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Error al crear usuario');
      } else {
        addToast(`Usuario ${newNombre} creado exitosamente`, 'success');
        setShowModal(false);
        setNewEmail(''); setNewPassword(''); setNewNombre(''); setNewRol('auditor');
        fetchUsuarios();
      }
    } catch {
      setCreateError('Error de conexión');
    } finally {
      setCreating(false);
    }
  };

  const handleStartEdit = (u: UserProfile) => {
    setEditingId(u.id);
    setEditRol(u.rol);
    setEditNombre(u.nombre);
    setConfirmDeleteId(null);
  };

  const handleSaveEdit = async (id: string) => {
    setSavingEdit(true);
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nombre: editNombre, rol: editRol }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Error al actualizar', 'error');
      } else {
        addToast('Usuario actualizado', 'success');
        setEditingId(null);
        fetchUsuarios();
      }
    } catch {
      addToast('Error de conexión', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActivo = async (u: UserProfile) => {
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, activo: !u.activo }),
      });
      if (!res.ok) {
        addToast('Error al actualizar estado', 'error');
      } else {
        addToast(`Usuario ${!u.activo ? 'activado' : 'desactivado'}`, 'success');
        fetchUsuarios();
      }
    } catch {
      addToast('Error de conexión', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/usuarios?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Error al eliminar', 'error');
      } else {
        addToast('Usuario eliminado', 'success');
        setConfirmDeleteId(null);
        fetchUsuarios();
      }
    } catch {
      addToast('Error de conexión', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="h-12 w-12 rounded-xl bg-red-600 flex items-center justify-center mx-auto">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Gestión de Usuarios</h2>
            <p className="text-sm text-slate-500">Ingresa la contraseña de administración para continuar.</p>
          </div>
          <form onSubmit={handleUnlock} className="space-y-4">
            <input
              type="password"
              value={gatePw}
              onChange={e => { setGatePw(e.target.value); setGateError(''); }}
              placeholder="Contraseña"
              autoFocus
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
            />
            {gateError && <p className="text-xs text-red-600 font-medium">{gateError}</p>}
            <button
              type="submit"
              disabled={gateLoading || !gatePw}
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              {gateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              Ingresar
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              Volver al inicio
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium pointer-events-auto transition-all ${
              t.type === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-red-600 flex items-center justify-center">
              <Shield className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-semibold text-slate-800 text-sm">Gestión de Usuarios</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={fetchUsuarios}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Actualizar
            </button>
            <button
              onClick={() => { setShowModal(true); setCreateError(''); }}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors shadow-sm"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Nuevo Usuario
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-600" />
            Usuarios del Sistema
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Administra los usuarios y sus roles de acceso al sistema de auditoría.
          </p>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="ml-2 text-slate-500 text-sm">Cargando usuarios...</span>
            </div>
          ) : usuarios.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay usuarios registrados</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuario</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rol</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Creado</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usuarios.map(u => {
                  const isMe = u.id === currentUserId;
                  const isEditing = editingId === u.id;
                  const isConfirmDelete = confirmDeleteId === u.id;

                  return (
                    <tr
                      key={u.id}
                      className={`transition-colors ${isEditing ? 'bg-blue-50/50' : 'hover:bg-slate-50/60'}`}
                    >
                      {/* User info */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 uppercase shrink-0">
                            {u.nombre.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            {isEditing ? (
                              <input
                                value={editNombre}
                                onChange={e => setEditNombre(e.target.value)}
                                className="text-sm font-medium border border-blue-300 rounded-md px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-full max-w-[160px]"
                              />
                            ) : (
                              <p className="text-sm font-medium text-slate-800 truncate">
                                {u.nombre}
                                {isMe && (
                                  <span className="ml-1.5 text-[10px] bg-slate-200 text-slate-500 rounded px-1 py-0.5 font-normal align-middle">
                                    Tú
                                  </span>
                                )}
                              </p>
                            )}
                            <p className="text-xs text-slate-400 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Rol */}
                      <td className="px-5 py-3.5">
                        {isEditing ? (
                          <select
                            value={editRol}
                            onChange={e => setEditRol(e.target.value as typeof editRol)}
                            className="text-xs border border-blue-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="superadmin">Super Admin</option>
                            <option value="auditor">Auditor</option>
                            <option value="viewer">Visualizador</option>
                          </select>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${ROL_COLORS[u.rol]}`}>
                            {ROL_LABELS[u.rol]}
                          </span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => !isMe && handleToggleActivo(u)}
                          disabled={isMe}
                          title={isMe ? 'No puedes cambiar tu propio estado' : u.activo ? 'Desactivar' : 'Activar'}
                          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                            isMe ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80 cursor-pointer'
                          } ${u.activo ? 'text-emerald-600' : 'text-slate-400'}`}
                        >
                          {u.activo
                            ? <ToggleRight className="h-4 w-4" />
                            : <ToggleLeft className="h-4 w-4" />
                          }
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>

                      {/* Fecha */}
                      <td className="px-5 py-3.5 text-xs text-slate-400">
                        {formatDate(u.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(u.id)}
                                disabled={savingEdit}
                                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors"
                              >
                                {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Guardar
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="flex items-center gap-1 border border-slate-200 text-slate-500 hover:text-slate-700 text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors"
                              >
                                <X className="h-3 w-3" />
                                Cancelar
                              </button>
                            </>
                          ) : isConfirmDelete ? (
                            <>
                              <span className="text-xs text-red-600 font-medium mr-1">¿Confirmar?</span>
                              <button
                                onClick={() => handleDelete(u.id)}
                                disabled={deletingId === u.id}
                                className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors"
                              >
                                {deletingId === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                Sí, eliminar
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="border border-slate-200 text-slate-500 hover:text-slate-700 text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors"
                              >
                                No
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleStartEdit(u)}
                                title="Editar"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              {!isMe && (
                                <button
                                  onClick={() => { setConfirmDeleteId(u.id); setEditingId(null); }}
                                  title="Eliminar"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-slate-400 mt-4 text-right">
          {usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} en total
        </p>
      </main>

      {/* Create User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-blue-600" />
                Nuevo Usuario
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nombre completo
                </label>
                <input
                  type="text"
                  required
                  value={newNombre}
                  onChange={e => setNewNombre(e.target.value)}
                  placeholder="Ej: María González"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="usuario@dusakawi.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Contraseña temporal
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Rol
                </label>
                <select
                  value={newRol}
                  onChange={e => setNewRol(e.target.value as typeof newRol)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  <option value="auditor">Auditor</option>
                  <option value="viewer">Visualizador</option>
                  <option value="superadmin">Super Admin</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  {newRol === 'superadmin' && 'Acceso total incluyendo gestión de usuarios.'}
                  {newRol === 'auditor' && 'Puede realizar auditorías y generar informes.'}
                  {newRol === 'viewer' && 'Solo puede visualizar datos y reportes.'}
                </p>
              </div>

              {createError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-red-700 text-sm">{createError}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-slate-200 text-slate-600 hover:text-slate-800 font-medium py-2 rounded-lg text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
                >
                  {creating ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Creando...</>
                  ) : (
                    <><UserPlus className="h-4 w-4" />Crear usuario</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
