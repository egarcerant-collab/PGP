'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Edit2,
  Loader2,
  RefreshCw,
  Shield,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserPlus,
  Users,
  X,
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

const ROL_LABELS: Record<UserProfile['rol'], string> = {
  superadmin: 'Super Admin',
  auditor: 'Auditor',
  viewer: 'Visualizador',
};

const ROL_COLORS: Record<UserProfile['rol'], string> = {
  superadmin: 'bg-red-50 text-red-700 border-red-200',
  auditor: 'bg-[#eaf6e7] text-[#287a1f] border-[#b9dfb0]',
  viewer: 'bg-slate-100 text-slate-600 border-slate-200',
};

let toastId = 0;

export default function AdminPage() {
  const router = useRouter();
  const [accessGranted, setAccessGranted] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [accessError, setAccessError] = useState('');
  const [usuarios, setUsuarios] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [newRol, setNewRol] = useState<UserProfile['rol']>('auditor');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRol, setEditRol] = useState<UserProfile['rol']>('auditor');
  const [editNombre, setEditNombre] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const addToast = (message: string, type: Toast['type']) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 4000);
  };

  const adminHeaders = useCallback(
    (extra?: HeadersInit) => ({
      ...(extra || {}),
      'x-user-management-password': adminPassword,
    }),
    [adminPassword]
  );

  const fetchCurrentUser = useCallback(async () => {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      setCurrentUserId(data.user?.id || null);
    }
  }, []);

  const fetchUsuarios = useCallback(async () => {
    if (!accessGranted) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/usuarios', { headers: adminHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cargar usuarios');
      setUsuarios(data.usuarios || []);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Error al cargar usuarios', 'error');
    } finally {
      setLoading(false);
    }
  }, [accessGranted, adminHeaders]);

  useEffect(() => {
    if (accessGranted) {
      fetchUsuarios();
      fetchCurrentUser();
    }
  }, [accessGranted, fetchUsuarios, fetchCurrentUser]);

  const handleAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    setAccessError('');
    const password = adminPassword.trim();

    if (!password) {
      setAccessError('Ingresa la contrasena de gestion.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/usuarios', {
        headers: { 'x-user-management-password': password },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Contrasena incorrecta.');
      setAdminPassword(password);
      setUsuarios(data.usuarios || []);
      setAccessGranted(true);
      fetchCurrentUser();
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'No se pudo validar el acceso.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email: newEmail, password: newPassword, nombre: newNombre, rol: newRol }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Error al crear usuario');
        return;
      }

      addToast('Usuario creado exitosamente', 'success');
      setShowModal(false);
      setNewEmail('');
      setNewPassword('');
      setNewNombre('');
      setNewRol('auditor');
      fetchUsuarios();
    } catch {
      setCreateError('Error de conexion');
    } finally {
      setCreating(false);
    }
  };

  const handleStartEdit = (usuario: UserProfile) => {
    setEditingId(usuario.id);
    setEditRol(usuario.rol);
    setEditNombre(usuario.nombre);
    setEditPassword('');
    setConfirmDeleteId(null);
  };

  const handleSaveEdit = async (id: string) => {
    setSavingEdit(true);
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'PUT',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id,
          nombre: editNombre,
          rol: editRol,
          ...(editPassword ? { password: editPassword } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Error al actualizar', 'error');
        return;
      }

      addToast('Usuario actualizado', 'success');
      setEditingId(null);
      setEditPassword('');
      fetchUsuarios();
    } catch {
      addToast('Error de conexion', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActivo = async (usuario: UserProfile) => {
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'PUT',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: usuario.id, activo: !usuario.activo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast(data.error || 'Error al actualizar estado', 'error');
        return;
      }
      addToast(!usuario.activo ? 'Usuario activado' : 'Usuario desactivado', 'success');
      fetchUsuarios();
    } catch {
      addToast('Error de conexion', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/usuarios?id=${id}`, {
        method: 'DELETE',
        headers: adminHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Error al eliminar', 'error');
        return;
      }
      addToast('Usuario eliminado', 'success');
      setConfirmDeleteId(null);
      fetchUsuarios();
    } catch {
      addToast('Error de conexion', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

  if (!accessGranted) {
    return (
      <div className="min-h-screen bg-[#f7faf5] flex items-center justify-center px-4">
        <form onSubmit={handleAccess} className="w-full max-w-md bg-white border border-[#62bf4f] border-t-4 shadow-xl rounded-sm p-6 space-y-4">
          <button type="button" onClick={() => router.push('/')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="space-y-2">
            <div className="inline-flex bg-[#62bf4f] px-4 py-2 text-sm font-bold text-white">GESTION DE USUARIOS</div>
            <h1 className="text-2xl font-bold text-slate-900">Acceso protegido</h1>
            <p className="text-sm text-slate-600">
              Ingresa la contrasena de gestion para administrar usuarios, roles y cambios de contrasena.
            </p>
          </div>
          <label className="block text-sm font-semibold text-slate-700">
            Contrasena
            <input
              type="password"
              value={adminPassword}
              onChange={(event) => {
                setAdminPassword(event.target.value);
                setAccessError('');
              }}
              className="mt-1 w-full rounded-sm border border-[#c9dec3] bg-slate-50 px-3 py-2 text-slate-900 outline-none focus:border-[#62bf4f] focus:ring-2 focus:ring-[#62bf4f]"
              autoFocus
            />
          </label>
          {accessError && <p className="text-sm text-red-600">{accessError}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-full bg-[#62bf4f] py-2.5 text-sm font-semibold text-white hover:bg-[#54a944] disabled:opacity-60">
            {loading ? 'Validando...' : 'Entrar a gestion'}
          </button>
          <p className="text-xs text-slate-400">
            Por seguridad no se muestran contrasenas actuales de Supabase; solo se pueden crear o reemplazar.
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="fixed right-4 top-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className={`rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === 'success' ? 'bg-[#287a1f]' : 'bg-red-600'}`}>
            {toast.message}
          </div>
        ))}
      </div>

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
          <button onClick={() => router.push('/')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#62bf4f]">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-800">Gestion de Usuarios</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={fetchUsuarios} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800">
              <RefreshCw className="h-3.5 w-3.5" />
              Actualizar
            </button>
            <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 rounded-lg bg-[#62bf4f] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#54a944]">
              <UserPlus className="h-3.5 w-3.5" />
              Nuevo Usuario
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Users className="h-5 w-5 text-[#287a1f]" />
            Usuarios del Sistema
          </h1>
          <p className="mt-1 text-sm text-slate-500">Administra usuarios registrados, roles, estado y contrasenas de acceso.</p>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-[#62bf4f]" />
              Cargando usuarios...
            </div>
          ) : usuarios.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              <Users className="mx-auto mb-3 h-10 w-10 opacity-30" />
              No hay usuarios registrados
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px]">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Usuario</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Rol</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Estado</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Creado</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-slate-500">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usuarios.map((usuario) => {
                    const isMe = usuario.id === currentUserId;
                    const isEditing = editingId === usuario.id;
                    const isConfirmDelete = confirmDeleteId === usuario.id;

                    return (
                      <tr key={usuario.id} className={isEditing ? 'bg-[#f3fbf1]' : 'hover:bg-slate-50'}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eaf6e7] text-xs font-bold uppercase text-[#287a1f]">
                              {usuario.nombre.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              {isEditing ? (
                                <input value={editNombre} onChange={(event) => setEditNombre(event.target.value)} className="w-full max-w-[220px] rounded-md border border-[#b9dfb0] bg-white px-2 py-1 text-sm font-medium outline-none focus:ring-1 focus:ring-[#62bf4f]" />
                              ) : (
                                <p className="truncate text-sm font-semibold text-slate-800">
                                  {usuario.nombre}
                                  {isMe && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-normal text-slate-500">Tu</span>}
                                </p>
                              )}
                              <p className="truncate text-xs text-slate-400">{usuario.email}</p>
                              {isEditing && (
                                <input
                                  type="password"
                                  value={editPassword}
                                  onChange={(event) => setEditPassword(event.target.value)}
                                  placeholder="Nueva contrasena opcional"
                                  className="mt-2 w-full max-w-[240px] rounded-md border border-amber-300 bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-500"
                                />
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {isEditing ? (
                            <select value={editRol} onChange={(event) => setEditRol(event.target.value as UserProfile['rol'])} className="rounded-md border border-[#b9dfb0] bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#62bf4f]">
                              <option value="superadmin">Super Admin</option>
                              <option value="auditor">Auditor</option>
                              <option value="viewer">Visualizador</option>
                            </select>
                          ) : (
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${ROL_COLORS[usuario.rol]}`}>{ROL_LABELS[usuario.rol]}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <button onClick={() => !isMe && handleToggleActivo(usuario)} disabled={isMe} className={`flex items-center gap-1.5 text-xs font-medium ${usuario.activo ? 'text-[#287a1f]' : 'text-slate-400'} ${isMe ? 'cursor-not-allowed opacity-50' : 'hover:opacity-80'}`}>
                            {usuario.activo ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                            {usuario.activo ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-400">{formatDate(usuario.created_at)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end gap-1.5">
                            {isEditing ? (
                              <>
                                <button onClick={() => handleSaveEdit(usuario.id)} disabled={savingEdit} className="flex items-center gap-1 rounded-lg bg-[#62bf4f] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#54a944] disabled:opacity-60">
                                  {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                  Guardar
                                </button>
                                <button onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
                                  <X className="h-3 w-3" />
                                  Cancelar
                                </button>
                              </>
                            ) : isConfirmDelete ? (
                              <>
                                <button onClick={() => handleDelete(usuario.id)} disabled={deletingId === usuario.id} className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">
                                  {deletingId === usuario.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                  Si, eliminar
                                </button>
                                <button onClick={() => setConfirmDeleteId(null)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">No</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => handleStartEdit(usuario)} title="Editar" className="rounded-lg p-1.5 text-slate-400 hover:bg-[#eaf6e7] hover:text-[#287a1f]">
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                {!isMe && (
                                  <button onClick={() => { setConfirmDeleteId(usuario.id); setEditingId(null); }} title="Eliminar" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
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
            </div>
          )}
        </div>

        <p className="mt-4 text-right text-xs text-slate-400">{usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} en total</p>
      </main>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="flex items-center gap-2 font-semibold text-slate-800">
                <UserPlus className="h-4 w-4 text-[#287a1f]" />
                Nuevo Usuario
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 p-6">
              <label className="block text-sm font-medium text-slate-700">
                Nombre completo
                <input required value={newNombre} onChange={(event) => setNewNombre(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#62bf4f] focus:bg-white focus:ring-2 focus:ring-[#62bf4f]" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Correo electronico
                <input type="email" required value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#62bf4f] focus:bg-white focus:ring-2 focus:ring-[#62bf4f]" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Contrasena temporal
                <input type="password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#62bf4f] focus:bg-white focus:ring-2 focus:ring-[#62bf4f]" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Rol
                <select value={newRol} onChange={(event) => setNewRol(event.target.value as UserProfile['rol'])} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#62bf4f] focus:bg-white focus:ring-2 focus:ring-[#62bf4f]">
                  <option value="auditor">Auditor</option>
                  <option value="viewer">Visualizador</option>
                  <option value="superadmin">Super Admin</option>
                </select>
              </label>
              {createError && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{createError}</p>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancelar</button>
                <button type="submit" disabled={creating} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#62bf4f] py-2 text-sm font-semibold text-white hover:bg-[#54a944] disabled:opacity-60">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Crear usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
