-- 12 · El latido: que Supabase no vuelva a pausar el proyecto
--
-- El 28 de septiembre de 2026 la app dejo de funcionar. No fue un fallo del
-- codigo: Supabase habia PAUSADO el proyecto. En el plan gratis, una base que
-- nadie toca durante una semana se apaga, y al apagarse desaparece hasta su
-- nombre en internet. La app decia "Couldn't connect: Failed to fetch" y no
-- habia forma de saber por que desde dentro.
--
-- Los datos no se perdieron -pausado no es borrado- pero el susto fue real, y
-- la siguiente parada podria no tener vuelta: un proyecto que se queda
-- pausado el tiempo suficiente se borra de verdad.
--
-- La solucion es tonta: darle algo que hacer cada dia. Esta funcion es eso y
-- nada mas.

-- ---------------------------------------------------------------- LA FUNCION
--
-- Devuelve la hora del servidor. Eso es todo lo que hace.
--
-- Por que una funcion y no llamar a cualquier tabla: hace falta que la
-- peticion llegue de verdad a la base de datos. Pedir algo que no se tiene
-- permiso de ver se rechaza en la puerta, y una peticion rechazada en la
-- puerta podria no contar como actividad. Esto entra, pregunta la hora y
-- sale.
--
-- Que puede sacarle alguien que la llame sin cuenta: la hora. Ni lee tablas,
-- ni escribe, ni sabe quien la llamo. `security invoker` es a proposito: no
-- se le prestan a nadie los permisos del dueno, justamente porque no los
-- necesita.
create or replace function public.latido()
returns timestamptz
language sql
security invoker
stable
as $$ select now() $$;

-- Primero se le quita a todo el mundo y luego se da a quien tiene que usarla.
-- Al reves -dar sin quitar- deja puesto lo que hubiera de antes.
revoke all on function public.latido() from public;
grant execute on function public.latido() to anon, authenticated;

comment on function public.latido() is
  'Devuelve la hora. Existe para que el proyecto no se pause por inactividad.';
