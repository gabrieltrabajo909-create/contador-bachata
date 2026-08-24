-- 10 · El link a la cancion en Spotify (o donde sea)
--
-- Hasta ahora el catalogo decia "Propuesta Indecente, de Romeo Santos" y ahi
-- se acababa la ayuda: el alumno tenia que ir a buscarla por su cuenta, y si
-- no la encontraba, la cancion grabada no le servia de nada.
--
-- Se guarda el link que PEGA EL PROFESOR, no uno buscado por nombre. La
-- diferencia no es comodidad, es que funcione: la app reconoce esa grabacion
-- exacta, y una busqueda por titulo devuelve tan facil el remix, el directo o
-- la del recopilatorio. El alumno le daria play, sonaria parecido, y la app
-- diria "no la encuentro". El profesor tiene abierta la version que grabo;
-- ese link es el unico que se sabe correcto.
--
-- Se ejecuta entero en el editor SQL de Supabase. Es idempotente.

-- --------------------------------------------------------------- 1 · COLUMNA
--
-- Sin restriccion de formato a proposito. Hoy es Spotify porque es lo que usa
-- la gente que tenemos cerca, pero manana es YouTube o Apple Music, y una
-- columna que solo acepte un dominio obliga a una migracion para nada. Lo que
-- se puede pegar lo decide la app, que es donde se puede cambiar sin permiso
-- de nadie.
alter table public.songs add column if not exists link text;

-- ------------------------------------------------------------------ 2 · VISTA
--
-- Se recrea entera porque una vista no admite anadirle una columna por partes.
-- Es la misma de siempre con "link" al final.
drop view if exists public.songs_catalog;
create view public.songs_catalog as
  select id, owner, title, artist, teacher, rhythm, duration, free,
         link, fpl_keys, fpl_times, created_at
  from public.songs
  where shared and deleted_at is null;

-- El link va en el catalogo aunque la cancion este bloqueada, y es correcto:
-- lo que se paga es la huella -poder reconocerla-, no saber que existe. El
-- titulo ya se ensena; esconder el link no protegeria nada y dejaria a media
-- app sin sentido.
grant select on public.songs_catalog to authenticated;
revoke all on public.songs_catalog from anon;
