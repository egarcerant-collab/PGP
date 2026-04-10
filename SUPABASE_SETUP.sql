-- ============================================
-- SISTEMA DE USUARIOS Y ROLES - PGP AUDITORÍA
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================

-- 1. Tabla de perfiles (vinculada a auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'auditor' CHECK (rol IN ('superadmin', 'auditor', 'viewer')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS

-- Cada usuario puede ver su propio perfil
CREATE POLICY "Ver propio perfil" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Superadmin ve todos los perfiles
CREATE POLICY "Superadmin ve todos" ON public.profiles
  FOR SELECT USING (
    (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

-- Superadmin puede insertar perfiles (usado por service role vía admin client)
CREATE POLICY "Superadmin crea perfiles" ON public.profiles
  FOR INSERT WITH CHECK (
    (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

-- Superadmin puede actualizar perfiles
CREATE POLICY "Superadmin edita perfiles" ON public.profiles
  FOR UPDATE USING (
    (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

-- Superadmin puede borrar perfiles
CREATE POLICY "Superadmin borra perfiles" ON public.profiles
  FOR DELETE USING (
    (SELECT rol FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

-- 4. Función y trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- INSTRUCCIONES POST-SETUP
-- ============================================
-- Después de ejecutar este SQL:
--
-- 1. Ve a Supabase Dashboard > Authentication > Users
-- 2. Crea el primer usuario superadmin con email y contraseña
-- 3. Copia su UUID desde la lista de usuarios
-- 4. Ejecuta este INSERT reemplazando los valores:
--
-- INSERT INTO public.profiles (id, email, nombre, rol, activo)
-- VALUES (
--   'UUID-DEL-USUARIO-AQUI',
--   'admin@dusakawi.com',
--   'Administrador Principal',
--   'superadmin',
--   true
-- );
--
-- 5. Ya puedes iniciar sesión en la app con ese usuario.
-- ============================================
