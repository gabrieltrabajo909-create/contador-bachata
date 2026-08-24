-- 11 · Consejos de baile
--
-- Hasta ahora el profesor decia DONDE esta el uno. Con esto puede decir ademas
-- COMO recomienda bailar cada parte: si subir la energia o quedarse suave, y
-- que tipo de movimiento va bien ahi. Seis botones, nada mas.
--
-- Se ejecuta entero en el editor SQL de Supabase. Es idempotente.

-- --------------------------------------------------------------- 1 · COLUMNA
--
-- Van DENTRO de la cancion y no en una tabla aparte. Puede sonar a atajo, asi
-- que conviene dejar escrito por que es lo correcto:
--
--   · Una fila de `songs` ya es de UN profesor. Si dos profesores preparan el
--     mismo tema, hoy ya son dos filas, cada una con su huella y sus marcas del
--     uno. "Varios mapas para la misma cancion" no hay que inventarlo: es lo
--     que pasa solo. El nombre que ve el alumno sale de `teacher`, que ya esta.
--
--   · La regla de acceso que protege los tiempos del uno protege estos igual,
--     sin escribir una sola politica nueva. Una tabla aparte habria significado
--     RLS nueva -y por tanto, una forma nueva de equivocarse- para repetir un
--     permiso que ya existe y ya esta probado.
--
--   · Se sincronizan, se exportan y se borran con la cancion, sin codigo extra
--     y sin poder quedarse huerfanos.
--
-- jsonb y no un array de numeros porque cada consejo son dos cosas: cuando y
-- cual. La forma es [{"t": 18.4, "k": "soft"}, ...], siempre ordenada por "t".
-- Las claves validas las decide la app; la base solo guarda.
alter table public.songs add column if not exists tips jsonb;

-- ------------------------------------------------------------------ 2 · VISTA
--
-- Al catalogo va UN SI O NO, nunca los tiempos.
--
-- Esto es la parte que hay que mirar dos veces. El catalogo lo ve todo el
-- mundo, tenga o no acceso a la cancion: es lo que permite ensenar con candado
-- lo que no se puede usar. Los consejos son contenido preparado por el
-- profesor, igual que las marcas del uno, y por tanto NO pueden salir de aqui.
-- Lo que si puede salir es que existan, que es un dato de la portada, como el
-- titulo.
--
-- Los tiempos viven solo en `songs`, cuya politica ya decide quien puede leer
-- la fila: propia, gratis, o con suscripcion. No hay nada que anadir.
drop view if exists public.songs_catalog;
create view public.songs_catalog as
  select id, owner, title, artist, teacher, rhythm, duration, free,
         link,
         -- jsonb_typeof antes de contar: si algun dia entra en la columna algo
         -- que no sea una lista, esto devuelve false en vez de reventar la
         -- vista entera y dejar a todo el mundo sin catalogo.
         case when jsonb_typeof(tips) = 'array' then jsonb_array_length(tips) > 0
              else false end as has_tips,
         fpl_keys, fpl_times, created_at
  from public.songs
  where shared and deleted_at is null;

grant select on public.songs_catalog to authenticated;
revoke all on public.songs_catalog from anon;
