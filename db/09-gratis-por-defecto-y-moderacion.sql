-- 09 · Gratis por defecto, y poder limpiar el catalogo
--
-- Dos cambios que van juntos porque salen de la misma decision: el catalogo
-- deja de ser un escaparate con la mercancia detras del cristal y pasa a ser
-- un sitio comun. Y un sitio comun hay que poder barrerlo.
--
-- Se ejecuta entero en el editor SQL de Supabase. Es idempotente.

-- ------------------------------------------------------- 1 · GRATIS DE SALIDA
--
-- Antes una cancion nueva nacia de pago y habia que ir a marcarla gratis a
-- mano, una por una. Con seis canciones se aguanta; con doscientas, no, y
-- mientras tanto nadie las puede usar. El valor por defecto se da vuelta.
--
-- Ojo con lo que NO hace esta linea: las canciones que ya existen se quedan
-- como estan. Cambiar de golpe lo que alguien ya decidio es justo lo que uno
-- no espera de una migracion.
alter table public.songs alter column free set default true;

-- --------------------------------------------------- 2 · BARRER EL CATALOGO
--
-- Hasta aqui solo el dueno podia borrar su cancion. Eso deja el catalogo sin
-- nadie que responda por el: una cancion mal marcada, repetida o subida por
-- error se queda ahi para siempre, y el unico que puede quitarla es
-- precisamente quien no se dio cuenta.
--
-- El administrador ya podia MODIFICAR cualquier cancion (archivo 05). Poder
-- modificarla pero no quitarla era una linea rara de defender.
drop policy if exists songs_delete on public.songs;
create policy songs_delete on public.songs for delete to authenticated
  using (owner = auth.uid() or public.is_admin(auth.uid()));

-- Por que borrado de verdad y no el reversible de 30 dias que usa el dueno
-- (archivo 04): porque de aquel el dueno puede sacarla otra vez de la
-- papelera. Para el dueno eso es una red de seguridad; para alguien que
-- modera, seria deshacerle la decision. Son dos cosas distintas y conviene
-- que se llamen distinto.
