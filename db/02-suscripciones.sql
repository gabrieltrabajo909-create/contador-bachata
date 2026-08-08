-- ============================================================
--  Suscripciones: 10 canciones gratis, el resto de pago
--  Pegar entero en: Supabase > SQL Editor > Run
--  Se puede reejecutar sin romper nada.
-- ============================================================

-- ---------- Perfiles: quien es cada uno y si paga ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  subscribed   boolean not null default false,
  sub_source   text    not null default 'none',   -- none | test | play
  sub_until    timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Cada quien ve y edita solo su perfil.
-- OJO: 'test' permite auto-suscribirse. Es a proposito para poder probar
-- el mecanismo, y HAY QUE QUITARLO antes de cobrar dinero de verdad.
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and sub_source in ('none','test'));

-- El perfil lo crea la propia app la primera vez que entras.
-- No se usa un disparador sobre auth.users porque esa tabla es del sistema
-- y Supabase no deja colgarle nada: intentarlo hace fallar todo el script.

-- ---------- Canciones gratis ----------
alter table public.songs add column if not exists free boolean not null default false;

-- ---------- Quien tiene suscripcion vigente ----------
create or replace function public.is_subscriber(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = u and subscribed
      and (sub_until is null or sub_until > now())
  );
$$;

-- ---------- La regla que manda: tuya, gratis, o pagas ----------
drop policy if exists songs_select on public.songs;
create policy songs_select on public.songs for select to authenticated
  using ( owner = auth.uid() or free or public.is_subscriber(auth.uid()) );

-- ---------- El escaparate: titulos sin huella ----------
-- Sin security_invoker a proposito: se salta la regla de songs para poder
-- mostrar los titulos bloqueados. Es seguro porque NO incluye fp_keys ni
-- fp_times, que es lo unico valioso.
drop view if exists public.songs_catalog;
create view public.songs_catalog as
  select id, owner, title, artist, teacher, rhythm, duration, free, created_at
  from public.songs where shared;

grant select on public.songs_catalog to authenticated;

-- ---------- IMPORTANTE: cerrar el catalogo a los anonimos ----------
-- Supabase concede lectura al rol anonimo por defecto sobre lo nuevo del
-- esquema publico. Sin este revoke, cualquiera en internet lee los titulos
-- y el nombre del profesor sin tener cuenta.
revoke all on public.songs_catalog from anon;
