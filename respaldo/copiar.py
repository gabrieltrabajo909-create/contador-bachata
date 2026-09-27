#!/usr/bin/env python3
"""Copia de seguridad de la base de Feel The One.

Baja todo lo que hay en Supabase y lo guarda en un archivo con la fecha, en
~/Respaldos Feel The One/. Se queda con los ultimos 30 dias.

POR QUE EXISTE. El 28 de septiembre de 2026 Supabase pauso el proyecto por
llevar un mes sin uso. Se pudo reactivar y no se perdio nada, pero si en vez
de pausarlo lo hubiera borrado, se perdian todas las canciones: no habia
ninguna copia en ningun lado. Esto es esa copia.

POR QUE LOCAL Y NO EN GITHUB. El repositorio es publico. Las canciones llevan
la huella y las marcas del uno, que es justamente lo que se paga: subirlas
alli seria regalarlas. Se quedan en esta maquina.

Y DE PASO LATE. Cada copia es una consulta real a la base, asi que esto
tambien la mantiene despierta. Son dos cosas independientes haciendo lo mismo
-esto y el trabajo de GitHub- para que si una falla, la otra alcance.

LA CLAVE. Necesita la clave de servicio de Supabase, que ve todo sin mirar
permisos. Vive FUERA del proyecto, en ~/.config/feeltheone/clave-servicio,
para que no pueda subirse al repositorio por accidente. La pega Gabriel; este
programa solo la lee.
"""

import datetime
import json
import os
import pathlib
import re
import sys
import urllib.request
import urllib.error

AQUI = pathlib.Path(__file__).resolve().parent
PROYECTO = AQUI.parent
CLAVE = pathlib.Path.home() / ".config" / "feeltheone" / "clave-servicio"
DESTINO = pathlib.Path.home() / "Respaldos Feel The One"
DIAS = 30

# Las tablas, en el orden en que habria que devolverlas si algun dia hay que
# restaurar: primero de quien es cada cosa, luego las cosas.
TABLAS = ["profiles", "app_admins", "songs", "scores", "ratings"]

# De a cuantas filas se piden. El servidor corta en 1000 si no se le dice
# nada, y una copia que se queda en la fila 1000 sin avisar es peor que no
# tener copia: parece completa.
TANDA = 500


def direccion():
    """La direccion de la base, sacada de la propia app para no tener dos."""
    html = (PROYECTO / "index.html").read_text(encoding="utf-8")
    m = re.search(r'const SB_URL = "([^"]+)"', html)
    if not m:
        sys.exit("no encuentro la direccion de la base en index.html")
    return m.group(1)


def clave():
    if not CLAVE.exists():
        sys.exit(
            f"Falta la clave de servicio.\n"
            f"Pegala en: {CLAVE}\n"
            f"(Supabase -> Project Settings -> API -> service_role)"
        )
    k = CLAVE.read_text().strip()
    # Dos formatos: el nuevo de Supabase ("sb_secret_...") y el de antes, una
    # cadena larga que empieza por "eyJ" (se llama service_role). Sirven los
    # dos. La que NO sirve es la publica, "sb_publishable_...": con esa solo
    # se ve lo que ve cualquiera, y la copia saldria casi vacia sin avisar.
    if k.startswith("sb_publishable_"):
        sys.exit(f"En {CLAVE} esta la clave PUBLICA. Hace falta la secreta "
                 f"(sb_secret_... o service_role).")
    if not (k.startswith("sb_secret_") or k.startswith("eyJ")):
        sys.exit(f"Lo que hay en {CLAVE} no parece una clave de Supabase.")
    return k


def pedir(url, k):
    req = urllib.request.Request(url, headers={
        "apikey": k,
        "Authorization": "Bearer " + k,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def bajar_tabla(base, tabla, k):
    filas = []
    desde = 0
    while True:
        # Ordenado por algo fijo: sin orden, dos tandas seguidas pueden
        # devolver filas repetidas o saltarse alguna.
        url = f"{base}/rest/v1/{tabla}?select=*&order=id&limit={TANDA}&offset={desde}"
        try:
            tanda = pedir(url, k)
        except urllib.error.HTTPError as e:
            # ratings no tiene columna id: se reintenta sin ordenar por ella
            if e.code == 400 and desde == 0:
                url = f"{base}/rest/v1/{tabla}?select=*&limit={TANDA}&offset={desde}"
                tanda = pedir(url, k)
                if len(tanda) < TANDA:
                    return tanda
                sys.exit(f"{tabla}: sin columna para ordenar y con mas de {TANDA} filas")
            raise
        filas.extend(tanda)
        if len(tanda) < TANDA:
            return filas
        desde += TANDA


def main():
    base = direccion()
    k = clave()
    DESTINO.mkdir(parents=True, exist_ok=True)

    hoy = datetime.date.today().isoformat()
    copia = {
        "hecha": datetime.datetime.now().isoformat(timespec="seconds"),
        "base": base,
        "tablas": {},
    }
    for tabla in TABLAS:
        try:
            copia["tablas"][tabla] = bajar_tabla(base, tabla, k)
        except urllib.error.HTTPError as e:
            cuerpo = e.read().decode("utf-8", "replace")[:200]
            sys.exit(f"{tabla}: el servidor dijo {e.code} {cuerpo}")
        except urllib.error.URLError as e:
            sys.exit(f"No llego a la base ({e.reason}). ¿Estara pausada otra vez?")

    # Se escribe primero en un archivo aparte y se renombra al final. Si se
    # corta a medias -luz, disco lleno- queda la copia de ayer intacta, y no
    # una de hoy rota con el nombre bueno.
    final = DESTINO / f"{hoy}.json"
    temporal = DESTINO / f".{hoy}.json.parcial"
    temporal.write_text(json.dumps(copia, ensure_ascii=False), encoding="utf-8")
    temporal.replace(final)

    # Las viejas se van. Solo las que tienen nombre de fecha: nunca se toca
    # algo que no puso este programa.
    limite = datetime.date.today() - datetime.timedelta(days=DIAS)
    for f in DESTINO.glob("????-??-??.json"):
        try:
            if datetime.date.fromisoformat(f.stem) < limite:
                f.unlink()
        except ValueError:
            pass

    resumen = ", ".join(f"{t}: {len(v)}" for t, v in copia["tablas"].items())
    print(f"Copia hecha en {final}")
    print(resumen)


if __name__ == "__main__":
    main()
