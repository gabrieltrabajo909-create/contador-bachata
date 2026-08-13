-- 05 · Administrador y votaciones
--
-- Dos cosas:
--   1. Una cuenta con permiso para decidir qué canciones son gratis
--   2. Que los alumnos puedan puntuar las canciones de 1 a 5 estrellas
--
-- Se ejecuta entero en el editor SQL de Supabase. Es idempotente.

-- ========================================================== 1 · ADMINISTRADOR

-- Se guarda en su propia tabla y no como una casilla en el perfil, porque el
-- perfil lo edita su dueño: una casilla ahí seria un boton de "hacerme
-- administrador" para cualquiera.
create table if not exists public.app_admins (
  uid uuid primary key references auth.users on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
-- Nadie la lee ni la escribe desde la app. Solo se toca desde este panel.
revoke all on public.app_admins from anon, authenticated;

-- Dar de alta al administrador por correo. Si esa cuenta todavia no existe,
-- no pasa nada: se vuelve a correr este archivo despues de crearla.
insert into public.app_admins (uid)
select id from auth.users where email = 'gabriellazzaro2018@gmail.com'
on conflict (uid) do nothing;

-- Security definer para poder mirar una tabla que la app no puede leer.
create or replace function public.is_admin(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where uid = u);
$$;

grant execute on function public.is_admin(uuid) to authenticated;

-- El administrador puede tocar cualquier cancion: para eso esta. Lo usa para
-- marcar cuales son gratis, que es la palanca del negocio.
drop policy if exists songs_update on public.songs;
create policy songs_update on public.songs for update to authenticated
  using (owner = auth.uid() or public.is_admin(auth.uid()))
  with check (owner = auth.uid() or public.is_admin(auth.uid()));

-- Y necesita VER todas para poder elegir, incluso las que no son suyas y no
-- tiene desbloqueadas.
drop policy if exists songs_select on public.songs;
create policy songs_select on public.songs for select to authenticated
  using (
    owner = auth.uid()
    or public.is_admin(auth.uid())
    or (deleted_at is null and (free or public.is_subscriber(auth.uid())))
  );

-- Para que la app sepa si tiene que ensenar los controles de administrador.
create or replace function public.soy_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where uid = auth.uid());
$$;

grant execute on function public.soy_admin() to authenticated;
revoke all on function public.soy_admin() from anon;

-- ============================================================= 2 · VOTACIONES

create table if not exists public.ratings (
  song_id    text not null references public.songs(id) on delete cascade,
  owner      uuid not null references auth.users on delete cascade,
  stars      smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  -- Un voto por persona y cancion: votar diez veces no vale
  primary key (song_id, owner)
);

alter table public.ratings enable row level security;

-- Cada quien ve y cambia SOLO su voto. Los votos de los demas no se leen de
-- aqui: para eso esta el resumen de abajo, que da el promedio sin decir quien
-- puso que. Saber que un alumno le puso dos estrellas a su profesor no le
-- hace bien a nadie.
drop policy if exists ratings_self on public.ratings;
create policy ratings_self on public.ratings for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

revoke all on public.ratings from anon;
grant select, insert, update, delete on public.ratings to authenticated;

-- El resumen: promedio y cuantos votaron, por cancion.
-- Sin security_invoker a proposito, para que pueda contar votos que quien
-- pregunta no tiene permiso de leer uno por uno.
drop view if exists public.song_ratings;
create view public.song_ratings as
  select song_id,
         round(avg(stars)::numeric, 2) as promedio,
         count(*)::int                 as votos
  from public.ratings
  group by song_id;

grant select on public.song_ratings to authenticated;
revoke all on public.song_ratings from anon;
