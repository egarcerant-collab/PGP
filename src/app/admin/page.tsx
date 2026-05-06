'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, UserPlus, Trash2, Edit2, Check, X, Shield,
  Users, ArrowLeft, ToggleLeft, ToggleRight, RefreshCw,
  Download, Upload, HardDrive,
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

  // Control de acceso por sesión (solo superadmin)
  const [unlocked, setUnlocked] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        const rol = data.profile?.rol || '';
        if (rol === 'superadmin') {
          setUnlocked(true);
        } else {
          router.replace('/');
        }
      })
      .catch(() => router.replace('/'))
      .finally(() => setAuthChecking(false));
  }, [router]);

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
    if (!unlocked || authChecking) return;
    fetchUsuarios();
    fetchCurrentUser();
  }, [unlocked, authChecking, fetchUsuarios, fetchCurrentUser]);

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

  // ── Backup / Restore ──
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);

  // ── Sincronización notas informe → auditoría ──
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{ resumen: any; detalles: string[] } | null>(null);

  const handleDownloadBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await fetch('/api/admin/backup');
      if (!res.ok) {
        const d = await res.json();
        addToast(d.message || 'Error al generar backup', 'error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fecha = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `backup_dsk_${fecha}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Backup descargado exitosamente', 'success');
    } catch {
      addToast('Error de conexión al generar backup', 'error');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.name.endsWith('.json')) {
      addToast('Solo se aceptan archivos .json', 'error');
      return;
    }

    const confirmRestore = window.confirm(
      `¿Restaurar backup desde "${file.name}"?\n\nEsta acción actualizará/insertará los registros existentes. Los registros no incluidos en el backup NO serán eliminados.`
    );
    if (!confirmRestore) return;

    setRestoreLoading(true);
    setRestoreResult(null);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const msg = `Restaurado: ${data.auditorias} auditoría(s), ${data.informes} informe(s)`;
        setRestoreResult(msg);
        addToast(msg, 'success');
      } else {
        const errMsg = data.errores?.join(' | ') || data.message || 'Error al restaurar';
        setRestoreResult(`Error: ${errMsg}`);
        addToast(errMsg, 'error');
      }
    } catch (err: any) {
      const msg = `Error: ${err?.message || 'Archivo inválido'}`;
      setRestoreResult(msg);
      addToast(msg, 'error');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleSyncNotas = async () => {
    const ok = window.confirm(
      'Esta acción copiará las notas de cada informe guardado hacia la auditoría correspondiente.\n\n' +
      '¿Confirmar sincronización?'
    );
    if (!ok) return;
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/admin/sync-notas', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSyncResult({ resumen: data.resumen, detalles: data.detalles });
        addToast(`Sincronización completa: ${data.resumen.actualizadas} auditoría(s) actualizadas`, 'success');
      } else {
        addToast(data.message || 'Error al sincronizar', 'error');
      }
    } catch (err: any) {
      addToast(`Error: ${err?.message || 'Error de conexión'}`, 'error');
    } finally {
      setSyncLoading(false);
    }
  };

  if (authChecking || !unlocked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
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

        {/* ── Backup y Restauración ── */}
        <div className="mt-10">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-1">
            <HardDrive className="h-4 w-4 text-slate-500" />
            Backup y Restauración
          </h2>
          <p className="text-slate-500 text-sm mb-4">
            Descarga un respaldo completo de auditorías e informes, o restaura uno anterior.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Descargar */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Download className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Descargar Backup</p>
                  <p className="text-xs text-slate-400">Exporta auditorías e informes en JSON</p>
                </div>
              </div>
              <button
                onClick={handleDownloadBackup}
                disabled={backupLoading}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
              >
                {backupLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Generando...</>
                  : <><Download className="h-4 w-4" />Descargar</>
                }
              </button>
            </div>

            {/* Restaurar */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Upload className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Restaurar Backup</p>
                  <p className="text-xs text-slate-400">Importa un archivo .json generado anteriormente</p>
                </div>
              </div>
              <label className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-2 text-sm font-semibold cursor-pointer transition-colors ${
                restoreLoading
                  ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'border-blue-300 text-blue-600 hover:bg-blue-50'
              }`}>
                {restoreLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Restaurando...</>
                  : <><Upload className="h-4 w-4" />Seleccionar archivo</>
                }
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  disabled={restoreLoading}
                  onChange={handleRestoreBackup}
                />
              </label>
              {restoreResult && (
                <p className={`text-xs font-medium rounded-lg px-3 py-2 ${
                  restoreResult.startsWith('Error')
                    ? 'bg-red-50 text-red-600 border border-red-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  {restoreResult}
                </p>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-3">
            El backup incluye todos los registros de auditorías e informes. La restauración hace upsert (inserta o actualiza) sin eliminar registros existentes.
          </p>
        </div>

        {/* ── Sincronización Notas Informe → Auditoría ── */}
        <div className="mt-10">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-1">
            <RefreshCw className="h-4 w-4 text-slate-500" />
            Sincronizar Notas de Informes
          </h2>
          <p className="text-slate-500 text-sm mb-4">
            Copia las notas (financiera y adicional) de cada informe guardado hacia la auditoría correspondiente.
            Útil para recuperar notas de informes creados antes de que las auditorías las persistieran.
          </p>
          <div className="bg-white border border-amber-200 rounded-xl p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="bg-amber-100 rounded-lg p-2 shrink-0">
                <RefreshCw className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Copiar notas de informes a auditorías</p>
                <p className="text-xs text-slate-400">
                  Busca por prestador y mes el informe vinculado y transfiere sus notas a la auditoría.
                  No sobreescribe notas que ya estén guardadas.
                </p>
              </div>
            </div>
            <button
              onClick={handleSyncNotas}
              disabled={syncLoading}
              className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
            >
              {syncLoading
                ? <><Loader2 className="h-4 w-4 animate-spin" />Sincronizando...</>
                : <><RefreshCw className="h-4 w-4" />Ejecutar sincronización</>
              }
            </button>
            {syncResult && (
              <div className="text-xs rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
                <p className="font-semibold text-amber-800">
                  Resultado: {syncResult.resumen.actualizadas} actualizada(s) /
                  {syncResult.resumen.sinInforme} sin informe /
                  {syncResult.resumen.sinNotas} sin notas /
                  {syncResult.resumen.total} total
                </p>
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {syncResult.detalles.map((d, i) => (
                    <p key={i} className={d.startsWith('✅') ? 'text-emerald-700' : 'text-red-600'}>{d}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
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
