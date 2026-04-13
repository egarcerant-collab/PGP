'use client';

import { useState, useEffect } from 'react';
import { createSupabaseClient } from '@/lib/supabase/client';
import { Loader2, ShieldCheck, Eye, EyeOff, UserPlus, LogIn, KeyRound, ArrowLeft, CheckCircle } from 'lucide-react';

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
    setLoading(true);
    const supabase = createSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setLoading(false);
    if (error) {
      setError('Error: ' + error.message);
    } else {
      setSuccess('Correo enviado. Revisa tu bandeja de entrada y haz clic en el enlace para crear una nueva contraseña.');
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-slate-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 text-center">
            <div className="flex justify-center mb-3">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/30 flex items-center justify-center shadow-inner">
                <ShieldCheck className="h-7 w-7 text-white" />
              </div>
            </div>
            <h1 className="text-white font-bold text-xl tracking-tight">Auditoría PGP</h1>
            <p className="text-blue-100 text-sm mt-1 font-medium">DUSAKAWI EPSI</p>
          </div>

          {/* Tabs — solo en login y registro */}
          {(mode === 'login' || mode === 'register') && (
            <div className="flex border-b border-slate-200">
              <button onClick={() => switchMode('login')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mode === 'login' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:text-slate-700'}`}>
                <LogIn className="h-4 w-4" /> Iniciar Sesión
              </button>
              <button onClick={() => switchMode('register')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mode === 'register' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:text-slate-700'}`}>
                <UserPlus className="h-4 w-4" /> Registrarse
              </button>
            </div>
          )}

          <div className="px-8 py-7">
            <div className="mb-5 text-center">
              <h2 className="text-slate-800 font-semibold text-lg">
                {mode === 'login' ? 'Iniciar Sesión'
                  : mode === 'register' ? 'Crear Cuenta'
                  : mode === 'reset' ? 'Recuperar Contraseña'
                  : 'Nueva Contraseña'}
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                {mode === 'login' ? 'Sistema de Auditoría de Tecnologías en Salud'
                  : mode === 'register' ? 'Completa tus datos para registrarte'
                  : mode === 'reset' ? 'Te enviaremos un enlace a tu correo'
                  : 'Crea una nueva contraseña para tu cuenta'}
              </p>
            </div>

            {/* LOGIN */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Correo electrónico</label>
                  <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="usuario@dusakawi.com"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-slate-700">Contraseña</label>
                    <button type="button" onClick={() => switchMode('reset')}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                      value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                      className="w-full px-4 py-2.5 pr-11 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all" />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-red-700 text-sm">{error}</p></div>}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm mt-2">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Iniciando sesión...</> : 'Ingresar al sistema'}
                </button>
              </form>
            )}

            {/* REGISTRO */}
            {mode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Nombre completo</label>
                  <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)}
                    placeholder="Eduardo Garcerant"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Correo electrónico</label>
                  <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="usuario@dusakawi.com"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Contraseña</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" required
                      value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                      className="w-full px-4 py-2.5 pr-11 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all" />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-red-700 text-sm">{error}</p></div>}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm mt-2">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Creando cuenta...</> : 'Crear cuenta'}
                </button>
              </form>
            )}

            {/* RECUPERAR CONTRASEÑA */}
            {mode === 'reset' && (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Correo electrónico</label>
                  <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="usuario@dusakawi.com"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all" />
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
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm">
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Enviando...</> : <><KeyRound className="h-4 w-4" />Enviar enlace de recuperación</>}
                  </button>
                )}
                <button type="button" onClick={() => switchMode('login')}
                  className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 text-sm py-2 transition-colors">
                  <ArrowLeft className="h-4 w-4" /> Volver al inicio de sesión
                </button>
              </form>
            )}

            {/* NUEVA CONTRASEÑA (viene del enlace del correo) */}
            {mode === 'new-password' && (
              <form onSubmit={handleNewPassword} className="space-y-4">
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
                  <p className="text-blue-700 text-sm">Escribe tu nueva contraseña a continuación.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700">Nueva contraseña</label>
                  <div className="relative">
                    <input type={showNewPassword ? 'text' : 'password'} required
                      value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••"
                      className="w-full px-4 py-2.5 pr-11 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all" />
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
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all" />
                </div>
                {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-red-700 text-sm">{error}</p></div>}
                {success && (
                  <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 flex gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <p className="text-green-700 text-sm">{success}</p>
                  </div>
                )}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando...</> : <><CheckCircle className="h-4 w-4" />Guardar nueva contraseña</>}
                </button>
              </form>
            )}
          </div>

          <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">Acceso restringido · Solo personal autorizado</p>
          </div>
        </div>
        <p className="text-center text-slate-400/60 text-xs mt-6">Auditoría PGP · DUSAKAWI EPSI · DNR</p>
      </div>
    </div>
  );
}
