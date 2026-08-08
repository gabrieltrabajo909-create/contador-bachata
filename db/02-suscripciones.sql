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

-- El perfil se crea solo al registrarse
create or replace function public.on_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_new_user on auth.users;
create trigger trg_new_user after insert on auth.users
  for each row execute function public.on_new_user();

-- Perfiles para las cuentas que ya existian
insert into public.profiles (id) select id from auth.users on conflict do nothing;

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
