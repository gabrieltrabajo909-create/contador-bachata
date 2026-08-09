-- 04 · Borrado reversible
--
-- El riesgo real no es que se caiga el servidor: es que alguien apriete borrar
-- sin querer y pierda el trabajo de marcar el "uno" de una cancion entera.
--
-- A partir de aqui, borrar no borra. Marca la fila con la fecha y la esconde
-- de todo el mundo menos de su dueno, que puede recuperarla durante 30 dias.
-- Pasado ese plazo se elimina de verdad.
--
-- Se ejecuta entero en el editor SQL de Supabase. Es idempotente: se puede
-- correr dos veces sin romper nada.

-- ---------------------------------------------------------------- la columna
alter table public.songs
  add column if not exists deleted_at timestamptz;

-- Buscar lo borrado tiene que ser barato, porque se hace en cada sincronizada.
create index if not exists songs_deleted_at_idx
  on public.songs (deleted_at) where deleted_at is not null;

-- ------------------------------------------------------------------- lectura
-- El dueno ve TODO lo suyo, incluido lo que borro, porque si no no podria
-- recuperarlo. Los demas no ven lo borrado bajo ningun concepto, ni siquiera
-- estando suscritos.
drop policy if exists songs_select on public.songs;
create policy songs_select on public.songs for select to authenticated
  using (
    owner = auth.uid()
    or (deleted_at is null and (free or public.is_subscriber(auth.uid())))
  );

-- ------------------------------------------------------- escritura y borrado
-- Se redeclaran las tres para dejarlas en un estado conocido: parte se creo
-- en su dia desde el panel y no estaba escrita en ningun archivo.
drop policy if exists songs_insert on public.songs;
create policy songs_insert on public.songs for insert to authenticated
  with check (owner = auth.uid());

-- Actualizar es tambien como se borra y como se recupera: mover deleted_at.
-- El dueno no puede regalarle una cancion a otro, de ahi el with check.
drop policy if exists songs_update on public.songs;
create policy songs_update on public.songs for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- El borrado de verdad se le deja al dueno igualmente: hace falta para vaciar
-- la papelera a mano y para que la limpieza automatica de abajo funcione.
drop policy if exists songs_delete on public.songs;
create policy songs_delete on public.songs for delete to authenticated
  using (owner = auth.uid());

-- ---------------------------------------------------------------- escaparate
-- El catalogo es lo que ve todo el mundo, asi que lo borrado desaparece de
-- ahi al instante. Se recrea entero porque una vista no admite anadirle un
-- filtro por partes.
drop view if exists public.songs_catalog;
create view public.songs_catalog as
  select id, owner, title, artist, teacher, rhythm, duration, free,
         fpl_keys, fpl_times, created_at
  from public.songs
  where shared and deleted_at is null;

-- La vista se crea SIN security_invoker a proposito: se salta la regla de
-- songs para poder ensenar los titulos de lo bloqueado. Es seguro porque no
-- incluye fp_keys ni fp_times, que es lo unico que se paga.
grant select on public.songs_catalog to authenticated;
revoke all on public.songs_catalog from anon;

-- ------------------------------------------------------------------ limpieza
-- Pasados los 30 dias se elimina de verdad. Se hace como funcion y no como
-- tarea programada para no depender de extensiones del plan de pago: la app
-- la llama al sincronizar y con eso alcanza.
--
-- Es segura aunque la llame cualquiera: solo toca filas que ya estaban
-- borradas y que ya pasaron el plazo. No hay parametros que manipular.
create or replace function public.purge_deleted_songs()
returns integer
language sql
security definer
set search_path = public
as $$
  with ido as (
    delete from public.songs
    where deleted_at is not null
      and deleted_at < now() - interval '30 days'
    returning 1
  )
  select count(*)::int from ido;
$$;

revoke all on function public.purge_deleted_songs() from public, anon;
grant execute on function public.purge_deleted_songs() to authenticated;
