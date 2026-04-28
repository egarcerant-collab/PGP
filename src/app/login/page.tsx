'use client';

import { useState, useEffect } from 'react';
import { createSupabaseClient } from '@/lib/supabase/client';
import { Loader2, Eye, EyeOff, UserPlus, LogIn, KeyRound, ArrowLeft, CheckCircle } from 'lucide-react';

type Mode = 'login' | 'register' | 'reset' | 'new-password';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Detectar si viene del enlace de recuperación (hash con access_token)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery') || hash.includes('access_token')) {
      setMode('new-password');
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    const supabase = createSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      if (error.message.includes('Email not confirmed')) {
        setError('Debes confirmar tu correo antes de ingresar.');
      } else if (error.message.includes('Invalid login credentials')) {
        setError('Correo o contraseña incorrectos.');
      } else {
        setError('Error: ' + error.message);
      }
    } else {
      window.location.href = '/';
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!nombre.trim()) { setError('Escribe tu nombre completo.'); return; }
    setLoading(true);
    const supabase = createSupabaseClient();
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setLoading(false);
      setError('Error registro: ' + signUpError.message);
      return;
    }
    if (data.user) {
      const { error: rpcError } = await supabase.rpc('register_profile', {
        user_id: data.user.id,
        user_email: email,
        user_nombre: nombre.trim(),
      });
      if (rpcError) {
        setLoading(false);
        setError('Cuenta creada pero error al guardar perfil: ' + rpcError.message);
        return;
      }
    }
    setLoading(false);
    window.location.href = '/';
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!email.trim()) { setError('Escribe tu correo electrónico.'); return; }
    if (newPassword.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (newPassword !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, newPassword }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.message || 'Error al actualizar la contraseña.');
    } else {
      setSuccess('Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.');
    }
  };

  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (newPassword.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (newPassword !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    const supabase = createSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      setError('Error: ' + error.message);
    } else {
      setSuccess('¡Contraseña actualizada! Redirigiendo...');
      setTimeout(() => { window.location.href = '/'; }, 2000);
    }
  };

  const switchMode = (m: Mode) => { setMode(m); setError(''); setSuccess(''); };

  return (
    <div className="min-h-screen bg-[#f7faf5]">
      <header className="h-20 bg-[#62bf4f] shadow-sm flex items-center px-6">
        <div className="flex items-center gap-3 text-white">
          <div className="h-12 w-12 rounded-full border-2 border-[#f1e65a] flex items-center justify-center font-bold text-xl tracking-tight">
            ASO
          </div>
          <div>
            <p className="font-bold text-xl leading-tight">ASOCIACION DE CABILDOS INDIGENAS DEL CESAR Y LA GUAJIRA</p>
            <p className="text-white/85 text-xs font-medium">Sistema de Auditoria PGP - Dusakawi EPSI</p>
            <p className="text-white/90 text-[11px] font-medium mt-1">
              Desarrollado por Eduardo Garcerant Gonzalez - Auditor de la Direccion Nacional de Gestion del Riesgo en Salud Dusakawi
            </p>
          </div>
        </div>
      </header>
      <main className="relative min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-10 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute left-10 bottom-8 h-24 w-24 rounded-full border-2 border-[#62bf4f]/40" />
        <div className="absolute left-28 bottom-16 h-10 w-10 border-l-4 border-b-4 border-[#f1c84b]" />
        <div className="absolute right-12 top-10 h-36 w-36 rounded-full bg-[#37b8d6]/10" />
      </div>

      <div className="relative w-full max-w-xl">
        <div className="bg-white rounded-sm shadow-xl border border-[#62bf4f] border-t-4 overflow-hidden">
          <div className="px-8 pt-4 pb-2">
            <div className="flex items-center gap-4">
              <div className="relative h-14 w-28 rounded-sm border border-[#62bf4f]/40 bg-white flex items-center justify-center overflow-hidden px-2">
                <span className="text-[11px] font-bold leading-tight text-[#2f7f26] text-center">DUSAKAWI EPSI</span>
                <img src="/imagenes%20pdf/logo-dusakawi.png" alt="Dusakawi EPSI" className="absolute inset-0 h-full w-full object-contain p-1.5 bg-white" />
              </div>
              <div className="inline-flex bg-[#62bf4f] px-4 py-2 text-white font-bold text-lg">
                INGRESO AL SISTEMA
              </div>
            </div>
          </div>

          {(mode === 'login' || mode === 'register') && (
            <div className="flex border-b border-slate-200">
              <button onClick={() => switchMode('login')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mode === 'login' ? 'text-[#3f9f31] border-b-2 border-[#62bf4f] bg-[#eef9eb]' : 'text-slate-500 hover:text-slate-700'}`}>
                <LogIn className="h-4 w-4" /> Iniciar Sesión
              </button>
              <button onClick={() => switchMode('register')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mode === 'register' ? 'text-[#3f9f31] border-b-2 border-[#62bf4f] bg-[#eef9eb]' : 'text-slate-500 hover:text-slate-700'}`}>
                <UserPlus className="h-4 w-4" /> Registrarse
              </button>
            </div>
          )}

          <div className="px-8 py-7">
            <div className="mb-5 text-center">
              <h2 className="text-slate-800 font-semibold text-lg">
                {mode === 'login' ? 'Iniciar Sesión'
                  : mode === 'register' ? 'Crear Cuenta'
                  : mode === 'reset' ? 'Cambiar Contraseña'
                  : 'Nueva Contraseña'}
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                {mode === 'login' ? 'Sistema de Auditoría de Tecnologías en Salud'
                  : mode === 'register' ? 'Completa tus datos para registrarte'
                  : mode === 'reset' ? 'Ingresa tu correo y una nueva contraseña'
                  : 'Crea una nueva contraseña para tu cuenta'}
              </p>
            </div>

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Correo electrónico</label>
                  <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="usuario@dusakawi.com"
                    className="w-full px-4 py-2.5 rounded-sm border border-[#c9dec3] bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#62bf4f] focus:border-[#62bf4f] focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-slate-700">Contraseña</label>
                    <button type="button" onClick={() => switchMode('reset')}
                    className="text-xs text-[#3f9f31] hover:text-[#2f7f26] font-medium transition-colors">
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                      value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                      className="w-full px-4 py-2.5 pr-11 rounded-sm border border-[#c9dec3] bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#62bf4f] focus:border-[#62bf4f] focus:bg-white transition-all" />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-red-700 text-sm">{error}</p></div>}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-[#d9ecf7] hover:bg-[#c9e3f2] border border-[#9bcbe6] disabled:bg-slate-200 disabled:cursor-not-allowed text-[#146c8f] font-semibold py-2.5 rounded-full transition-colors text-sm mt-2">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Iniciando sesión...</> : 'Ingresar al sistema'}
                </button>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Nombre completo</label>
                  <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)}
                    placeholder="Eduardo Garcerant"
                    className="w-full px-4 py-2.5 rounded-sm border border-[#c9dec3] bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#62bf4f] focus:border-[#62bf4f] focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Correo electrónico</label>
                  <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="usuario@dusakawi.com"
                    className="w-full px-4 py-2.5 rounded-sm border border-[#c9dec3] bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#62bf4f] focus:border-[#62bf4f] focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Contraseña</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" required
                      value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                      className="w-full px-4 py-2.5 pr-11 rounded-sm border border-[#c9dec3] bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#62bf4f] focus:border-[#62bf4f] focus:bg-white transition-all" />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-red-700 text-sm">{error}</p></div>}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-[#62bf4f] hover:bg-[#54a944] disabled:bg-[#a7d69e] disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-full transition-colors text-sm mt-2">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Creando cuenta...</> : 'Crear cuenta'}
                </button>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Correo electrónico</label>
                  <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="usuario@dusakawi.com"
                    className="w-full px-4 py-2.5 rounded-sm border border-[#c9dec3] bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#62bf4f] focus:border-[#62bf4f] focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Nueva contraseña</label>
                  <div className="relative">
                    <input type={showNewPassword ? 'text' : 'password'} required
                      value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••"
                      className="w-full px-4 py-2.5 pr-11 rounded-sm border border-[#c9dec3] bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#62bf4f] focus:border-[#62bf4f] focus:bg-white transition-all" />
                    <button type="button" onClick={() => setShowNewPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Confirmar contraseña</label>
                  <input type={showNewPassword ? 'text' : 'password'} required
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••"
                    className="w-full px-4 py-2.5 rounded-sm border border-[#c9dec3] bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#62bf4f] focus:border-[#62bf4f] focus:bg-white transition-all" />
                </div>
                {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-red-700 text-sm">{error}</p></div>}
                {success && (
                  <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 flex gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <p className="text-green-700 text-sm">{success}</p>
                  </div>
                )}
                {!success && (
                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-[#62bf4f] hover:bg-[#54a944] disabled:bg-[#a7d69e] disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-full transition-colors text-sm">
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Actualizando...</> : <><KeyRound className="h-4 w-4" />Actualizar contraseña</>}
                  </button>
                )}
                {success && (
                  <button type="button" onClick={() => switchMode('login')}
                    className="w-full flex items-center justify-center gap-2 bg-[#62bf4f] hover:bg-[#54a944] text-white font-semibold py-2.5 rounded-full transition-colors text-sm">
                    <LogIn className="h-4 w-4" /> Ir a iniciar sesión
                  </button>
                )}
                <button type="button" onClick={() => switchMode('login')}
                  className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 text-sm py-2 transition-colors">
                  <ArrowLeft className="h-4 w-4" /> Volver al inicio de sesión
                </button>
              </form>
            )}

            {mode === 'new-password' && (
              <form onSubmit={handleNewPassword} className="space-y-4">
                <div className="rounded-lg bg-[#eef9eb] border border-[#b8e3ae] px-4 py-3">
                  <p className="text-[#3f9f31] text-sm">Escribe tu nueva contraseña a continuación.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Nueva contraseña</label>
                  <div className="relative">
                    <input type={showNewPassword ? 'text' : 'password'} required
                      value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••"
                      className="w-full px-4 py-2.5 pr-11 rounded-sm border border-[#c9dec3] bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#62bf4f] focus:border-[#62bf4f] focus:bg-white transition-all" />
                    <button type="button" onClick={() => setShowNewPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1}>
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Confirmar contraseña</label>
                  <input type={showNewPassword ? 'text' : 'password'} required
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••"
                    className="w-full px-4 py-2.5 rounded-sm border border-[#c9dec3] bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#62bf4f] focus:border-[#62bf4f] focus:bg-white transition-all" />
                </div>
                {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-red-700 text-sm">{error}</p></div>}
                {success && (
                  <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 flex gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <p className="text-green-700 text-sm">{success}</p>
                  </div>
                )}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-[#62bf4f] hover:bg-[#54a944] disabled:bg-[#a7d69e] disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-full transition-colors text-sm">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando...</> : <><CheckCircle className="h-4 w-4" />Guardar nueva contraseña</>}
                </button>
              </form>
            )}
          </div>

          <div className="px-8 py-4 bg-[#f7faf5] border-t border-[#d7ead2] text-center">
            <p className="text-xs text-slate-400">Acceso restringido - Solo personal autorizado</p>
          </div>
        </div>
        <p className="text-center text-[#4a9340] text-xs mt-6">Auditoria PGP - DUSAKAWI EPSI - DNR</p>
      </div>
      </main>
    </div>
  );
}
