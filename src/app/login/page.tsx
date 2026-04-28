'use client';

import { useState, useEffect } from 'react';
import { createSupabaseClient } from '@/lib/supabase/client';
import { Loader2, ShieldCheck, Eye, EyeOff, UserPlus, LogIn, KeyRound, ArrowLeft, CheckCircle } from 'lucide-react';

const GREEN = '#4CAF50';
const GREEN_DARK = '#2E7D32';
const GREEN_LIGHT = '#E8F5E9';

type Mode = 'login' | 'register' | 'reset' | 'new-password';

const inputCls = 'w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-gray-50 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:bg-white transition-all';

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
    if (signUpError) { setLoading(false); setError('Error registro: ' + signUpError.message); return; }
    if (data.user) {
      const { error: rpcError } = await supabase.rpc('register_profile', {
        user_id: data.user.id, user_email: email, user_nombre: nombre.trim(),
      });
      if (rpcError) { setLoading(false); setError('Cuenta creada pero error al guardar perfil: ' + rpcError.message); return; }
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, newPassword }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.message || 'Error al actualizar la contraseña.'); }
    else { setSuccess('Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.'); }
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
    if (error) { setError('Error: ' + error.message); }
    else { setSuccess('Contraseña actualizada. Redirigiendo...'); setTimeout(() => { window.location.href = '/'; }, 2000); }
  };

  const switchMode = (m: Mode) => { setMode(m); setError(''); setSuccess(''); };

  const btnGreen = (
    <button type="submit" disabled={loading}
      className="w-full flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-lg transition-opacity text-sm mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
      style={{ backgroundColor: GREEN }}>
      {loading
        ? <><Loader2 className="h-4 w-4 animate-spin" />Procesando...</>
        : mode === 'login' ? <><LogIn className="h-4 w-4" />Ingresar al sistema</>
        : mode === 'register' ? 'Crear cuenta'
        : mode === 'reset' ? <><KeyRound className="h-4 w-4" />Actualizar contraseña</>
        : <><CheckCircle className="h-4 w-4" />Guardar nueva contraseña</>}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f3f4f6' }}>
      {/* Barra institucional */}
      <div className="w-full py-3 px-6 flex items-center gap-3 shadow-md" style={{ backgroundColor: GREEN }}>
        <div className="h-9 w-9 rounded-full bg-white flex items-center justify-center font-bold text-sm shrink-0" style={{ color: GREEN_DARK }}>
          ASD
        </div>
        <span className="text-white font-semibold text-sm tracking-wide">
          ASOCIACIÓN DE CABILDOS INDÍGENAS DEL CESAR Y LA GUAJIRA
        </span>
      </div>

      {/* Contenido centrado */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Tarjeta */}
          <div className="bg-white rounded-xl shadow-xl overflow-hidden" style={{ border: `2px solid ${GREEN}` }}>
            {/* Cabecera tarjeta */}
            <div className="px-8 py-5 text-center" style={{ backgroundColor: GREEN_DARK }}>
              <div className="flex justify-center mb-2">
                <div className="h-12 w-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.4)' }}>
                  <ShieldCheck className="h-6 w-6 text-white" />
                </div>
              </div>
              <h1 className="text-white font-bold text-base tracking-widest uppercase">Ingreso al Sistema</h1>
              <p className="text-green-100 text-xs mt-1">Bienvenido, por favor ingrese al sistema</p>
            </div>

            {/* Tabs */}
            {(mode === 'login' || mode === 'register') && (
              <div className="flex border-b border-gray-200">
                <button onClick={() => switchMode('login')}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors"
                  style={mode === 'login'
                    ? { color: GREEN_DARK, borderBottom: `2px solid ${GREEN}`, backgroundColor: GREEN_LIGHT }
                    : { color: '#64748b' }}>
                  <LogIn className="h-4 w-4" /> Iniciar Sesión
                </button>
                <button onClick={() => switchMode('register')}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors"
                  style={mode === 'register'
                    ? { color: GREEN_DARK, borderBottom: `2px solid ${GREEN}`, backgroundColor: GREEN_LIGHT }
                    : { color: '#64748b' }}>
                  <UserPlus className="h-4 w-4" /> Registrarse
                </button>
              </div>
            )}

            {/* Formularios */}
            <div className="px-8 py-6">

              {mode === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Correo electrónico</label>
                    <input type="email" autoComplete="email" required value={email}
                      onChange={e => setEmail(e.target.value)} placeholder="usuario@dusakawi.com" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-700">Contraseña</label>
                      <button type="button" onClick={() => switchMode('reset')}
                        className="text-xs font-medium" style={{ color: GREEN_DARK }}>
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                        value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                        className={inputCls + ' pr-11'} />
                      <button type="button" onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-red-700 text-sm">{error}</p></div>}
                  {btnGreen}
                </form>
              )}

              {mode === 'register' && (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Nombre completo</label>
                    <input type="text" required value={nombre} onChange={e => setNombre(e.target.value)}
                      placeholder="Eduardo Garcerant" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Correo electrónico</label>
                    <input type="email" autoComplete="email" required value={email}
                      onChange={e => setEmail(e.target.value)} placeholder="usuario@dusakawi.com" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Contraseña</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" required
                        value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                        className={inputCls + ' pr-11'} />
                      <button type="button" onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-red-700 text-sm">{error}</p></div>}
                  {btnGreen}
                </form>
              )}

              {mode === 'reset' && (
                <form onSubmit={handleReset} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Correo electrónico</label>
                    <input type="email" autoComplete="email" required value={email}
                      onChange={e => setEmail(e.target.value)} placeholder="usuario@dusakawi.com" className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Nueva contraseña</label>
                    <div className="relative">
                      <input type={showNewPassword ? 'text' : 'password'} required
                        value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••"
                        className={inputCls + ' pr-11'} />
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
                      className={inputCls} />
                  </div>
                  {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-red-700 text-sm">{error}</p></div>}
                  {success && (
                    <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 flex gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      <p className="text-green-700 text-sm">{success}</p>
                    </div>
                  )}
                  {!success && btnGreen}
                  {success && (
                    <button type="button" onClick={() => switchMode('login')}
                      className="w-full flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-lg text-sm"
                      style={{ backgroundColor: GREEN }}>
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
                  <div className="rounded-lg px-4 py-3 border text-sm" style={{ backgroundColor: GREEN_LIGHT, borderColor: GREEN, color: GREEN_DARK }}>
                    Escribe tu nueva contraseña a continuación.
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Nueva contraseña</label>
                    <div className="relative">
                      <input type={showNewPassword ? 'text' : 'password'} required
                        value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••"
                        className={inputCls + ' pr-11'} />
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
                      className={inputCls} />
                  </div>
                  {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-red-700 text-sm">{error}</p></div>}
                  {success && (
                    <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 flex gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      <p className="text-green-700 text-sm">{success}</p>
                    </div>
                  )}
                  {btnGreen}
                </form>
              )}

            </div>

            {/* Pie de tarjeta */}
            <div className="px-8 py-3 border-t text-center text-xs text-slate-500"
              style={{ backgroundColor: GREEN_LIGHT, borderColor: '#C8E6C9' }}>
              Acceso restringido · Solo personal autorizado
            </div>
          </div>

          {/* Firma institucional */}
          <div className="mt-5 text-center space-y-0.5 pb-4">
            <p className="text-xs font-semibold text-slate-600">Creado y soportado por Eduardo Luis Garcerant González</p>
            <p className="text-xs text-slate-500">Auditor · Dirección Nacional de Gestión del Riesgo en Salud · Dusakawi EPSI</p>
            <p className="text-xs text-slate-400">Odontólogo General · Esp. Sistemas de Calidad y Auditoría en Salud · Mg. Epidemiología</p>
          </div>
        </div>
      </div>
    </div>
  );
}
