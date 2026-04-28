'use client';

import { useEffect, useState } from 'react';
import { createSupabaseClient } from '@/lib/supabase/client';
import { ArrowLeft, CheckCircle, Eye, EyeOff, KeyRound, Loader2, LogIn, UserPlus } from 'lucide-react';

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

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery') || hash.includes('access_token')) {
      setMode('new-password');
    }
  }, []);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    clearMessages();
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    clearMessages();
    setLoading(true);
    const supabase = createSupabaseClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (loginError) {
      if (loginError.message.includes('Email not confirmed')) {
        setError('Debes confirmar tu correo antes de ingresar.');
      } else if (loginError.message.includes('Invalid login credentials')) {
        setError('Correo o contrasena incorrectos.');
      } else {
        setError('Error: ' + loginError.message);
      }
      return;
    }

    window.location.href = '/';
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    clearMessages();
    if (!nombre.trim()) {
      setError('Escribe tu nombre completo.');
      return;
    }

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

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    clearMessages();
    if (!email.trim()) {
      setError('Escribe tu correo electronico.');
      return;
    }
    if (newPassword.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contrasenas no coinciden.');
      return;
    }

    setLoading(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, newPassword }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.message || 'Error al actualizar la contrasena.');
      return;
    }

    setSuccess('Contrasena actualizada. Ya puedes iniciar sesion con tu nueva contrasena.');
  };

  const handleNewPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    clearMessages();
    if (newPassword.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contrasenas no coinciden.');
      return;
    }

    setLoading(true);
    const supabase = createSupabaseClient();
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateError) {
      setError('Error: ' + updateError.message);
      return;
    }

    setSuccess('Contrasena actualizada. Redirigiendo...');
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
  };

  const title = mode === 'login' ? 'Iniciar Sesion' : mode === 'register' ? 'Crear Cuenta' : mode === 'reset' ? 'Cambiar Contrasena' : 'Nueva Contrasena';
  const subtitle = mode === 'login'
    ? 'Sistema de Auditoria PGP - Dusakawi EPSI'
    : mode === 'register'
      ? 'Completa tus datos para registrarte'
      : mode === 'reset'
        ? 'Ingresa tu correo y una nueva contrasena'
        : 'Crea una nueva contrasena para tu cuenta';

  return (
    <div className="min-h-screen bg-[#f7faf5]">
      <header className="min-h-20 bg-[#62bf4f] shadow-sm flex items-center px-6 py-4">
        <div className="flex items-center gap-3 text-white">
          <div className="h-12 w-12 rounded-full border-2 border-[#f1e65a] flex items-center justify-center font-bold text-xl tracking-tight">
            ASO
          </div>
          <div>
            <p className="font-bold text-xl leading-tight">ASOCIACION DE CABILDOS INDIGENAS DEL CESAR Y LA GUAJIRA</p>
            <p className="text-white/90 text-xs font-semibold">Sistema de Auditoria PGP - Dusakawi EPSI</p>
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
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-full border border-[#62bf4f]/40 bg-white flex items-center justify-center overflow-hidden">
                  <img src="/imagenes pdf/logo-dusakawi.png" alt="Dusakawi EPSI" className="h-12 w-12 object-contain" />
                </div>
                <div className="inline-flex bg-[#62bf4f] px-4 py-2 text-white font-bold text-lg">
                  INGRESO AL SISTEMA
                </div>
              </div>
            </div>

            {(mode === 'login' || mode === 'register') && (
              <div className="flex border-b border-[#d7ead2]">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mode === 'login' ? 'text-[#3f9f31] border-b-2 border-[#62bf4f] bg-[#eef9eb]' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <LogIn className="h-4 w-4" /> Iniciar Sesion
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${mode === 'register' ? 'text-[#3f9f31] border-b-2 border-[#62bf4f] bg-[#eef9eb]' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <UserPlus className="h-4 w-4" /> Registrarse
                </button>
              </div>
            )}

            <div className="px-8 py-7">
              <div className="mb-5 text-center">
                <h2 className="text-slate-800 font-semibold text-lg">{title}</h2>
                <p className="text-slate-500 text-sm mt-1">{subtitle}</p>
              </div>

              {mode === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <Field label="Correo electronico">
                    <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario@dusakawi.com" className="institutional-input" />
                  </Field>
                  <Field label="Contrasena" action={<button type="button" onClick={() => switchMode('reset')} className="text-xs text-[#3f9f31] hover:text-[#2f7f26] font-medium">Olvidaste tu contrasena?</button>}>
                    <PasswordInput value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="current-password" />
                  </Field>
                  <Messages error={error} success={success} />
                  <PrimaryButton loading={loading} loadingText="Iniciando sesion...">Ingresar al sistema</PrimaryButton>
                </form>
              )}

              {mode === 'register' && (
                <form onSubmit={handleRegister} className="space-y-4">
                  <Field label="Nombre completo">
                    <input type="text" required value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Eduardo Garcerant" className="institutional-input" />
                  </Field>
                  <Field label="Correo electronico">
                    <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario@dusakawi.com" className="institutional-input" />
                  </Field>
                  <Field label="Contrasena">
                    <PasswordInput value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="new-password" />
                  </Field>
                  <Messages error={error} success={success} />
                  <PrimaryButton loading={loading} loadingText="Creando cuenta...">Crear cuenta</PrimaryButton>
                </form>
              )}

              {mode === 'reset' && (
                <form onSubmit={handleReset} className="space-y-4">
                  <Field label="Correo electronico">
                    <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario@dusakawi.com" className="institutional-input" />
                  </Field>
                  <Field label="Nueva contrasena">
                    <PasswordInput value={newPassword} onChange={setNewPassword} show={showNewPassword} onToggle={() => setShowNewPassword((value) => !value)} />
                  </Field>
                  <Field label="Confirmar contrasena">
                    <input type={showNewPassword ? 'text' : 'password'} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="********" className="institutional-input" />
                  </Field>
                  <Messages error={error} success={success} />
                  {!success && <PrimaryButton loading={loading} loadingText="Actualizando..."><KeyRound className="h-4 w-4" />Actualizar contrasena</PrimaryButton>}
                  {success && <PrimaryButton type="button" onClick={() => switchMode('login')} loading={false}><LogIn className="h-4 w-4" />Ir a iniciar sesion</PrimaryButton>}
                  <BackButton onClick={() => switchMode('login')} />
                </form>
              )}

              {mode === 'new-password' && (
                <form onSubmit={handleNewPassword} className="space-y-4">
                  <div className="rounded-lg bg-[#eef9eb] border border-[#b8e3ae] px-4 py-3 text-[#3f9f31] text-sm">Escribe tu nueva contrasena a continuacion.</div>
                  <Field label="Nueva contrasena">
                    <PasswordInput value={newPassword} onChange={setNewPassword} show={showNewPassword} onToggle={() => setShowNewPassword((value) => !value)} />
                  </Field>
                  <Field label="Confirmar contrasena">
                    <input type={showNewPassword ? 'text' : 'password'} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="********" className="institutional-input" />
                  </Field>
                  <Messages error={error} success={success} />
                  <PrimaryButton loading={loading} loadingText="Guardando..."><CheckCircle className="h-4 w-4" />Guardar nueva contrasena</PrimaryButton>
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

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-700">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}

function PasswordInput({ value, onChange, show, onToggle, autoComplete }: { value: string; onChange: (value: string) => void; show: boolean; onToggle: () => void; autoComplete?: string }) {
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} autoComplete={autoComplete} required value={value} onChange={(event) => onChange(event.target.value)} placeholder="********" className="institutional-input pr-11" />
      <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Messages({ error, success }: { error: string; success: string }) {
  return (
    <>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"><p className="text-red-700 text-sm">{error}</p></div>}
      {success && <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 flex gap-2"><CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" /><p className="text-green-700 text-sm">{success}</p></div>}
    </>
  );
}

function PrimaryButton({ children, loading, loadingText, type = 'submit', onClick }: { children: React.ReactNode; loading: boolean; loadingText?: string; type?: 'button' | 'submit'; onClick?: () => void }) {
  return (
    <button type={type} onClick={onClick} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-[#d9ecf7] hover:bg-[#c9e3f2] border border-[#9bcbe6] disabled:bg-slate-200 disabled:cursor-not-allowed text-[#146c8f] font-semibold py-2.5 rounded-full transition-colors text-sm mt-2">
      {loading ? <><Loader2 className="h-4 w-4 animate-spin" />{loadingText}</> : children}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 text-sm py-2 transition-colors">
      <ArrowLeft className="h-4 w-4" /> Volver al inicio de sesion
    </button>
  );
}
