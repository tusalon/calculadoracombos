-- Calculadora de Combos — usuarios, niveles y datos en la nube
-- Pega esto entero en Supabase → SQL Editor → Run. Es idempotente: puedes volver a correrlo.
--
-- Qué crea:
--   profiles  — una fila por usuario: si es admin, si está activo y qué pestañas puede ver
--   app_data  — una fila por usuario con TODOS sus datos (combos, remesas, trading) en un JSON
--
-- Quién manda: las reglas viven aquí (Row Level Security), no en JavaScript.
-- Aunque alguien abra la consola del navegador y trastee, la base no le deja
-- leer datos ajenos ni subirse el rango a admin.

-- ============================================================
-- 1. Tablas
-- ============================================================

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  nombre     text,
  is_admin   boolean not null default false,
  activo     boolean not null default true,
  -- Qué pestañas ve. Los que entran nuevos empiezan con lo básico;
  -- el admin les abre Remesas y Compra/Venta cuando toque.
  perms      jsonb   not null default
             '{"combo":true,"historial":true,"remesas":false,"trading":false,"planner":true}'::jsonb,
  created_at timestamptz not null default now()
);

-- ponytail: todos los datos del usuario en un solo JSON, no una tabla por entidad.
-- Techo: no se puede consultar "todas las remesas pendientes de todos" desde SQL,
-- y si el mismo usuario edita en dos teléfonos a la vez, gana el último que guarda.
-- Cuando necesites informes cruzados o edición simultánea, parte este blob en
-- tablas combos/remesas/trades. Mientras sea una persona por cuenta, esto sobra.
create table if not exists public.app_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. ¿Quién es admin?
-- ============================================================

-- Necesita ser SECURITY DEFINER: una política de profiles que consulte profiles
-- directamente se llama a sí misma y Postgres corta por recursión infinita.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin and p.activo from public.profiles p where p.id = auth.uid()), false);
$$;

-- ============================================================
-- 3. Alta automática al registrarse
-- ============================================================

-- El PRIMER usuario que se registre queda como admin — así no tienes que venir
-- a la consola de Supabase a coronarte a mano. Del segundo en adelante, usuarios
-- normales esperando a que les abras permisos.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  primero boolean;
begin
  select not exists (select 1 from public.profiles) into primero;

  insert into public.profiles (id, email, nombre, is_admin, perms)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'nombre'), ''), split_part(new.email, '@', 1)),
    primero,
    case when primero
      then '{"combo":true,"historial":true,"remesas":true,"trading":true,"planner":true}'::jsonb
      else '{"combo":true,"historial":true,"remesas":false,"trading":false,"planner":true}'::jsonb
    end
  )
  on conflict (id) do nothing;

  insert into public.app_data (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Marca de tiempo del último guardado, para saber qué copia es más nueva.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_data_touch on public.app_data;
create trigger app_data_touch
  before update on public.app_data
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 4. Reglas de acceso (RLS)
-- ============================================================

alter table public.profiles enable row level security;
alter table public.app_data enable row level security;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
drop policy if exists app_data_select on public.app_data;
drop policy if exists app_data_insert on public.app_data;
drop policy if exists app_data_update on public.app_data;
drop policy if exists app_data_delete on public.app_data;

-- Cada uno se ve a sí mismo. El admin ve a todos (lo necesita para el panel).
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- Solo el admin cambia permisos. Nadie puede editar su propia fila:
-- si pudiera, cualquiera se pondría is_admin = true desde la consola del navegador.
create policy profiles_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

create policy profiles_delete on public.profiles
  for delete using (public.is_admin());

-- Sin política de INSERT a propósito: las filas las crea el trigger de arriba.

-- Los datos: cada quien los suyos. El admin puede mirarlos, pero no escribirlos.
create policy app_data_select on public.app_data
  for select using (user_id = auth.uid() or public.is_admin());

create policy app_data_insert on public.app_data
  for insert with check (user_id = auth.uid());

create policy app_data_update on public.app_data
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy app_data_delete on public.app_data
  for delete using (user_id = auth.uid() or public.is_admin());

-- ============================================================
-- 5. Red de seguridad: que no te quedes sin ningún admin
-- ============================================================

create or replace function public.guard_last_admin()
returns trigger
language plpgsql
as $$
begin
  if old.is_admin and (not new.is_admin or not new.activo) then
    if not exists (
      select 1 from public.profiles
      where is_admin and activo and id <> old.id
    ) then
      raise exception 'No puedes quitar al único administrador que queda';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_last_admin on public.profiles;
create trigger profiles_guard_last_admin
  before update on public.profiles
  for each row execute function public.guard_last_admin();
