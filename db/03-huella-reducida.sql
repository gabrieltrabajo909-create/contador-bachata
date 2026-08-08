-- ============================================================
--  Huella reducida para identificar canciones bloqueadas
--  Pegar entero en: Supabase > SQL Editor > Run
-- ============================================================
-- Permite decirle al alumno "esta cancion esta bloqueada" en vez de un
-- generico "no la encuentro". Es una de cada seis marcas: alcanza para
-- identificar la cancion y no para nada mas.
--
-- Lo que NO viaja son los tiempos del profesor (downbeats), que son los
-- que permiten mostrar la cuenta. Ese es el trabajo que se vende y el que
-- queda protegido.

alter table public.songs add column if not exists fpl_keys  text;
alter table public.songs add column if not exists fpl_times text;

drop view if exists public.songs_catalog;
create view public.songs_catalog as
  select id, owner, title, artist, teacher, rhythm, duration, free, created_at,
         fpl_keys, fpl_times
  from public.songs where shared;

-- Al recrear la vista se pierden los permisos: hay que ponerlos de nuevo.
grant  select on public.songs_catalog to authenticated;
revoke all    on public.songs_catalog from anon;
