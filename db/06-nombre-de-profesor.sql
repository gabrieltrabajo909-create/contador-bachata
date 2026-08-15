-- 06 · El nombre del profesor, único y de la cuenta
--
-- El problema: el nombre se escribía a mano en cada canción. Dos profesores
-- llamados "Gabriel" dan dos "La Bachata · Gabriel" y no hay forma de saber
-- cuál es la de quién. Para un catálogo compartido eso no sirve.
--
-- A partir de aquí el nombre vive en la cuenta, es único, y las canciones lo
-- heredan. Cambiarlo se puede, mientras nadie más lo esté usando.
--
-- Se ejecuta entero en el editor SQL de Supabase. Es idempotente.

alter table public.profiles
  add column if not exists display_name text;

/* Único sin distinguir mayúsculas ni espacios de sobra: "Gabriel", "gabriel"
   y "Gabriel " son la misma persona a ojos de un alumno, y permitir las tres
   seria dejar la puerta abierta a que alguien se haga pasar por otro. */
create unique index if not exists profiles_display_name_unico
  on public.profiles (lower(btrim(display_name)))
  where display_name is not null and btrim(display_name) <> '';

/* Saber si un nombre está libre SIN poder leer los perfiles ajenos.
   Sin esto habría que abrir la tabla entera para comprobar un nombre, y
   entonces cualquiera podría listar a todos los profesores. Esta función
   contesta únicamente sí o no. */
create or replace function public.nombre_libre(candidato text)
returns boolean
language sql stable security definer set search_path = public as $$
  select btrim(coalesce(candidato,'')) <> ''
     and not exists (
       select 1 from profiles
       where lower(btrim(display_name)) = lower(btrim(candidato))
         and id <> auth.uid()
     );
$$;

revoke all on function public.nombre_libre(text) from public, anon;
grant execute on function public.nombre_libre(text) to authenticated;

/* Al cambiar de nombre hay que renombrar también las canciones ya subidas, o
   el catálogo quedaría mostrando el nombre viejo para siempre. Se hace aquí y
   no desde la app para que sea una sola operación: si se hiciera en dos
   pasos, quedarse a medias dejaría el nombre partido entre los dos. */
create or replace function public.cambiar_nombre(nuevo text)
returns text
language plpgsql security definer set search_path = public as $$
declare limpio text;
begin
  limpio := btrim(coalesce(nuevo, ''));
  if limpio = '' then
    raise exception 'vacio';
  end if;
  if length(limpio) > 40 then
    raise exception 'largo';
  end if;
  if not public.nombre_libre(limpio) then
    raise exception 'ocupado';
  end if;

  update public.profiles set display_name = limpio where id = auth.uid();
  update public.songs      set teacher     = limpio where owner = auth.uid();
  return limpio;
end;
$$;

revoke all on function public.cambiar_nombre(text) from public, anon;
grant execute on function public.cambiar_nombre(text) to authenticated;

/* Los nombres que ya estaban escritos a mano en las canciones se pasan a la
   cuenta de quien las grabó, para no perder lo que ya se veía en el catálogo.
   Si dos personas usaron el mismo, se queda quien lo haya usado primero y el
   otro tendrá que elegir uno nuevo la próxima vez que entre. */
with primeros as (
  select distinct on (lower(btrim(s.teacher)))
         s.owner, btrim(s.teacher) as nombre
  from public.songs s
  where coalesce(btrim(s.teacher), '') <> ''
  order by lower(btrim(s.teacher)), s.created_at
)
update public.profiles p
   set display_name = f.nombre
  from primeros f
 where p.id = f.owner
   and p.display_name is null;
