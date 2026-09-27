# Copia de seguridad de la base

Cada 3 horas la Raspberry baja **toda** la base de Supabase y la guarda en:

    ~/Respaldos Feel The One/AAAA-MM-DD.json

Una por día (la de hoy se va pisando con la más nueva). Se guardan los
**últimos 30 días**; las más viejas se borran solas.

## ¿Anda?

Mirá el registro:

    tail ~/Respaldos Feel The One/registro.txt

Cada línea de fecha tiene que ir seguida de "Copia hecha en…". Si dice otra
cosa, algo falló.

## Qué hace falta para que funcione

- La Raspberry prendida (con que esté 3 horas al día alcanza).
- La clave **secreta** de Supabase en `~/.config/feeltheone/clave-servicio`.
  Vive fuera del proyecto a propósito: así no se puede subir a GitHub por
  error. Si la cambiás en Supabase, hay que pegarla de nuevo ahí.

## Por qué existe

El 28 de septiembre de 2026 Supabase **pausó** el proyecto por un mes sin
uso. Se pudo reactivar y no se perdió nada, pero no había ni una copia: si lo
hubiera borrado, se perdían todas las canciones.

Desde entonces hay dos cosas cuidando la base:

1. **El latido** (`.github/workflows/latido.yml`): GitHub le pregunta la hora
   a la base una vez al día para que no se duerma. Gratis, no usa Claude.
2. **Esta copia**, que además cuenta como otro latido.

## Para restaurar

Pedíselo a Claude con el archivo del día que quieras. Tiene las cinco tablas
enteras —cuentas, canciones con su huella, marcas y consejos, puntajes y
votos— tal como estaban en la base.
