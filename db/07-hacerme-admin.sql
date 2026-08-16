-- 07 · Dar el mando a una cuenta
--
-- La pestana del catalogo -donde se decide que canciones son gratis- solo
-- aparece para las cuentas que estan en esta lista. La lista no se puede
-- tocar desde la app a proposito: si se pudiera, cualquiera se nombraria
-- administrador y regalaria las canciones de los demas. Se hace aqui, en el
-- editor SQL de Supabase, que es el unico sitio donde nadie se hace pasar
-- por otro.
--
-- Cambia el correo si hiciera falta. Se puede ejecutar las veces que sea.

insert into public.app_admins (uid)
select id from auth.users
 where lower(email) = lower('gabriellazzaro2018@gmail.com')
on conflict do nothing;

-- Para comprobar que quedo (tiene que devolver una fila):
--   select u.email
--     from public.app_admins a
--     join auth.users u on u.id = a.uid;
