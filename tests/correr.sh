#!/usr/bin/env bash
# Corre todas las pruebas.
#
#   ./tests/correr.sh          todo
#   ./tests/correr.sh rapido   solo lo que no necesita internet
#
# Node no hace falta tenerlo instalado en el sistema: si no aparece, se baja
# una copia suelta a una carpeta temporal y se usa desde ahi.

set -u
cd "$(dirname "$0")/.."

VERDE=$'\033[32m'; ROJO=$'\033[31m'; GRIS=$'\033[2m'; NEGRITA=$'\033[1m'; FIN=$'\033[0m'

# ------------------------------------------------------------------ node
NODE=$(command -v node || true)
if [ -z "$NODE" ]; then
  VER=v22.14.0
  CARPETA="${TMPDIR:-/tmp}/node-contador"
  ARCO=$(uname -m); case "$ARCO" in aarch64) ARCO=arm64;; x86_64) ARCO=x64;; esac
  PAQ="node-$VER-linux-$ARCO"
  NODE="$CARPETA/$PAQ/bin/node"
  if [ ! -x "$NODE" ]; then
    echo "${GRIS}bajando node (solo la primera vez)...${FIN}"
    mkdir -p "$CARPETA" && cd "$CARPETA"
    curl -sfL -O "https://nodejs.org/dist/$VER/$PAQ.tar.xz" || { echo "${ROJO}no pude bajar node${FIN}"; exit 1; }
    curl -sfL -O "https://nodejs.org/dist/$VER/SHASUMS256.txt"
    grep "$PAQ.tar.xz" SHASUMS256.txt | sha256sum -c - >/dev/null \
      || { echo "${ROJO}la descarga de node no coincide con la firma oficial${FIN}"; exit 1; }
    tar xf "$PAQ.tar.xz"
    cd - >/dev/null
  fi
fi

fallos=0

echo "${NEGRITA}══ El algoritmo y la cuenta ══${FIN}"
for archivo in tests/*.test.mjs; do
  "$NODE" "$archivo" || fallos=$((fallos + 1))
done

if [ "${1:-}" != "rapido" ]; then
  echo
  echo "${NEGRITA}══ El servidor ══${FIN}"
  python3 tests/servidor.py || fallos=$((fallos + 1))
else
  echo
  echo "${GRIS}(las del servidor no se corrieron: modo rapido)${FIN}"
fi

echo
if [ "$fallos" -eq 0 ]; then
  echo "${VERDE}${NEGRITA}Todo en orden.${FIN}"
  exit 0
fi
echo "${ROJO}${NEGRITA}Hay $fallos grupo(s) con fallos.${FIN}"
exit 1
