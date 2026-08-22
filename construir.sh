#!/usr/bin/env bash
#
# Arma la carpeta que se publica.
#
# El repositorio tiene mas cosas que la app: las pruebas, el esquema de la base
# de datos, notas, el mensaje para los probadores. Nada de eso es secreto, pero
# tampoco tiene por que estar colgado en internet, y la lista de lo que SI se
# publica tiene que ser una lista corta que se pueda leer de un vistazo.
#
# Asi que se copia lo que se nombra aqui y nada mas. Si manana alguien anade un
# archivo con algo delicado al repositorio, no se publica solo por estar ahi:
# hay que venir a escribirlo en esta lista, que es justo el momento de pensarlo.
#
# En Cloudflare Pages:
#   Comando de construccion : bash construir.sh
#   Carpeta de salida       : public

set -euo pipefail
cd "$(dirname "$0")"

DESTINO=public

# Lo unico que necesita la app para funcionar
ARCHIVOS=(
  index.html
  sw.js
  manifest.webmanifest
  icono-64.png
  icono-192.png
  icono-512.png
  icono-512-recortable.png
  _headers          # como se guarda cada cosa en cache
)

rm -rf "$DESTINO"
mkdir -p "$DESTINO"

for a in "${ARCHIVOS[@]}"; do
  if [ ! -f "$a" ]; then
    echo "falta un archivo que la app necesita: $a" >&2
    exit 1
  fi
  cp "$a" "$DESTINO/"
done

echo "publicando ${#ARCHIVOS[@]} archivos:"
ls -1 "$DESTINO"
