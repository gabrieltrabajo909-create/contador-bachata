-- 08 · Borrar la cuenta de verdad
--
-- Google Play exige que una app con cuentas ofrezca borrarlas desde dentro.
-- Pero el motivo de fondo es mas simple: si alguien te da su correo y su voz
-- pasando por el microfono, tiene derecho a irse sin escribirle un correo a
-- nadie y sin esperar a que un humano se acuerde.
--
-- OJO CON LA DIFERENCIA. En este proyecto "borrar" ya significa otra cosa:
-- borrar una CANCION la esconde 30 dias y se puede recuperar (archivo 04).
-- Borrar la CUENTA no. Esto es definitivo, no hay papelera y no hay vuelta
-- atras. Por eso la app lo hace escribir a mano antes de llamar aqui.
--
-- Se ejecuta entero en el editor SQL de Supabase. Es idempotente.

-- Por que security definer: la app no puede -ni debe- tocar la tabla de
-- usuarios. Esta funcion si, porque la ejecuta el dueno de la base, pero solo
-- puede borrar UNA fila: la de quien la llama. auth.uid() lo pone el servidor
-- al validar el token, no viaja como parametro, asi que no hay forma de pedir
-- que borre a otro.
create or replace function public.borrar_mi_cuenta()
returns void
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  yo uuid := auth.uid();
begin
  if yo is null then
    raise exception 'sin sesion';
  end if;

  /* Se borra explicitamente tabla por tabla en vez de confiar en que el
     borrado en cascada este puesto en todas. Si manana alguien anade una
     tabla y se olvida de la cascada, el fallo seria dejar datos de una
     persona que pidio irse: el silencio mas caro que hay. Aqui al menos esta
     la lista a la vista, y anadir una linea es obvio. */
  delete from public.ratings  where owner = yo;
  delete from public.scores   where owner = yo;
  delete from public.songs    where owner = yo;
  delete from public.profiles where id    = yo;

  /* Y al final el usuario. Al irse esta fila caen por cascada app_admins y lo
     que Supabase guarda de la sesion, asi que el token deja de valer en el
     acto aunque el telefono todavia lo tenga guardado. */
  delete from auth.users where id = yo;
end;
$$;

-- Nadie sin sesion tiene nada que hacer aqui.
revoke all on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;
