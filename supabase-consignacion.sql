-- CONSIGNACIÓN — corre cada PARTE por separado en Supabase → SQL Editor → Run.
-- (El editor corta los scripts largos y deja las políticas sin crear: por eso van en 3 partes.)
-- Al terminar, corre la VERIFICACIÓN del final: debe dar 2, 2 y 4.
-- Es idempotente: puedes volver a correrla.

-- ============================================================
-- PARTE 1 de 3 — tablas
-- ============================================================

create table if not exists public.consignees (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  telefono   text not null default '',
  -- El enlace secreto de quien recibe: 64 caracteres al azar, imposible de adivinar.
  token      text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.consign_lines (
  id           uuid primary key default gen_random_uuid(),
  consignee_id uuid not null references public.consignees(id) on delete cascade,
  producto     text not null,
  enviado      int not null default 0,   -- lo que tú le mandaste
  recibido     int not null default 0,   -- lo que él confirmó que le llegó
  vendido      int not null default 0,   -- lo que él marcó como vendido (sin pagarte aún)
  pagado       int not null default 0,   -- lo que tú marcaste como cobrado
  created_at   timestamptz not null default now(),
  -- Los contadores no se pueden contradecir ni por error ni a propósito.
  constraint consign_orden check (pagado >= 0 and pagado <= vendido and vendido <= recibido and recibido <= enviado)
);

create index if not exists consign_lines_consignee on public.consign_lines(consignee_id);

alter table public.consignees enable row level security;
alter table public.consign_lines enable row level security;

-- ============================================================
-- PARTE 2 de 3 — reglas: solo el admin toca las tablas
-- ============================================================

drop policy if exists consignees_admin on public.consignees;
drop policy if exists consign_lines_admin on public.consign_lines;

create policy consignees_admin on public.consignees
  for all using (public.is_admin()) with check (public.is_admin());

create policy consign_lines_admin on public.consign_lines
  for all using (public.is_admin()) with check (public.is_admin());

-- Sumar de forma atómica (así dos teléfonos a la vez no se pisan).
-- Sin SECURITY DEFINER: corre con los permisos de quien llama, o sea, solo admin.
create or replace function public.consign_admin_sumar(p_line uuid, p_enviado int default 0, p_pagado int default 0)
returns void
language sql
as $$
  update public.consign_lines
     set enviado = enviado + p_enviado, pagado = pagado + p_pagado
   where id = p_line;
$$;

revoke all on function public.consign_admin_sumar(uuid, int, int) from public;
grant execute on function public.consign_admin_sumar(uuid, int, int) to authenticated;

-- ============================================================
-- PARTE 3 de 3 — lo que puede hacer quien recibe (sin cuenta, solo con su enlace)
-- ============================================================

-- Ver sus productos. Devuelve null si el enlace no existe o está desactivado.
create or replace function public.consign_ver(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'nombre', c.nombre,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'producto', l.producto, 'enviado', l.enviado,
                                          'recibido', l.recibido, 'vendido', l.vendido, 'pagado', l.pagado)
                       order by l.created_at)
        from public.consign_lines l where l.consignee_id = c.id), '[]'::jsonb))
  from public.consignees c
  where c.token = p_token and c.activo;
$$;

-- Confirmar que le llegó lo enviado (una línea, o todas si p_line es null).
create or replace function public.consign_recibir(p_token text, p_line uuid default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.consign_lines l set recibido = enviado
    from public.consignees c
   where c.id = l.consignee_id and c.token = p_token and c.activo
     and (p_line is null or l.id = p_line);
$$;

-- Marcar vendidos (p_n positivo) o deshacer (negativo). Nunca más de lo que tiene
-- en la mano ni menos de lo que tú ya cobraste.
create or replace function public.consign_vender(p_token text, p_line uuid, p_n int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.consign_lines l set vendido = vendido + p_n
    from public.consignees c
   where l.id = p_line and c.id = l.consignee_id and c.token = p_token and c.activo
     and vendido + p_n between pagado and recibido;
  if not found then raise exception 'cantidad no valida'; end if;
end;
$$;

revoke all on function public.consign_ver(text) from public;
revoke all on function public.consign_recibir(text, uuid) from public;
revoke all on function public.consign_vender(text, uuid, int) from public;
grant execute on function public.consign_ver(text) to anon, authenticated;
grant execute on function public.consign_recibir(text, uuid) to anon, authenticated;
grant execute on function public.consign_vender(text, uuid, int) to anon, authenticated;

-- ============================================================
-- VERIFICACIÓN — corre esto al final. Debe dar: tablas 2, politicas 2, funciones 4
-- ============================================================

select (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('consignees', 'consign_lines')) as tablas,
       (select count(*) from pg_policies where tablename in ('consignees', 'consign_lines')) as politicas,
       (select count(*) from pg_proc where proname like 'consign\_%') as funciones;
