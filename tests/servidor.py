#!/usr/bin/env python3
"""Pruebas del servidor: el candado, la privacidad y la papelera.

Se ejecutan contra la base de datos de verdad, porque las reglas de acceso
solo existen alli: no hay forma honesta de probarlas sin preguntarle al
servidor. Todo lo que crean lo borran al terminar.

Se usan dos cuentas de prueba FIJAS y reutilizables, en vez de una nueva cada
vez, para no ir dejando usuarios sueltos en la base.

    python3 tests/servidor.py
"""

import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HTML = (RAIZ / "index.html").read_text(encoding="utf-8")

def _sacar(patron):
    m = re.search(patron, HTML)
    if not m:
        sys.exit("no encuentro la configuracion del servidor en index.html")
    return m.group(1)

# Se leen del propio index.html para que no se puedan quedar viejas
URL = _sacar(r'const SB_URL = "([^"]+)"')
CLAVE = _sacar(r'const SB_KEY = "([^"]+)"')

CUENTAS = {
    "A": ("prueba.autor.contador@example.com", "PruebaContador-A-2026"),
    "B": ("prueba.alumno.contador@example.com", "PruebaContador-B-2026"),
}

# ---------------------------------------------------------------- utilidades

class Respuesta:
    def __init__(self, codigo, cuerpo):
        self.codigo = codigo
        self.texto = cuerpo
        try:
            self.datos = json.loads(cuerpo) if cuerpo.strip() else None
        except json.JSONDecodeError:
            self.datos = None

def pedir(ruta, metodo="GET", cuerpo=None, token=None, cabeceras=None):
    url = URL + ruta
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, method=metodo)
    req.add_header("apikey", CLAVE)
    req.add_header("Authorization", "Bearer " + (token or CLAVE))
    req.add_header("Content-Type", "application/json")
    for k, v in (cabeceras or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return Respuesta(r.status, r.read().decode())
    except urllib.error.HTTPError as e:
        return Respuesta(e.code, e.read().decode())
    except urllib.error.URLError as e:
        sys.exit(f"no hay conexion con el servidor: {e.reason}")

def rest(ruta, metodo="GET", cuerpo=None, **kw):
    return pedir("/rest/v1/" + ruta, metodo, cuerpo, **kw)

def entrar(cual):
    """Entra con una cuenta de prueba; la crea la primera vez."""
    correo, clave = CUENTAS[cual]
    r = pedir("/auth/v1/token?grant_type=password",
              "POST", {"email": correo, "password": clave})
    if r.codigo != 200:
        r = pedir("/auth/v1/signup", "POST", {"email": correo, "password": clave})
        if r.codigo not in (200, 201) or not r.datos:
            sys.exit(f"no pude crear la cuenta de prueba {cual}: {r.codigo} {r.texto[:200]}")
        if not r.datos.get("access_token"):
            sys.exit("la base pide confirmar el correo: no puedo crear cuentas de prueba")
    return r.datos["access_token"], r.datos["user"]["id"]

# ------------------------------------------------------------------- informe

_fallos, _corridas, _grupo = [], 0, ""
VERDE, ROJO, GRIS, FIN = "\033[32m", "\033[31m", "\033[2m", "\033[0m"

def seccion(n):
    global _grupo
    _grupo = n
    print(f"\n\033[1m{n}{FIN}")

def prueba(nombre):
    def deco(fn):
        global _corridas
        _corridas += 1
        try:
            fn()
            print(f"  {VERDE}✓{FIN} {nombre}")
        except AssertionError as e:
            print(f"  {ROJO}✗ {nombre}{FIN}")
            for linea in str(e).split("\n"):
                print(f"      {linea}")
            _fallos.append(f"{_grupo} › {nombre}")
        except Exception as e:
            print(f"  {ROJO}✗ {nombre}{FIN}  (reventó)")
            print(f"      {type(e).__name__}: {e}")
            _fallos.append(f"{_grupo} › {nombre}")
        return fn
    return deco

# --------------------------------------------------------------------- datos

def cancion(id_, titulo, dueno, gratis=False):
    return {
        "id": id_, "owner": dueno, "title": titulo, "artist": "Pruebas",
        "teacher": "Suite automatica", "rhythm": "bachata", "duration": 100,
        "fpv": 1, "downbeats": [0, 2, 4, 6], "shared": True, "free": gratis,
        "fp_keys": "AAAA", "fp_times": "AAAA",
        "fpl_keys": "AAAA", "fpl_times": "AAAA",
    }

MARCA = "zzz-prueba-" + str(int(time.time()))
ID_LIBRE = MARCA + "-libre"
ID_PAGA = MARCA + "-paga"

# ===========================================================================

print(f"{GRIS}servidor: {URL}{FIN}")
tokenA, uidA = entrar("A")
tokenB, uidB = entrar("B")
print(f"{GRIS}cuenta A (autora)  {uidA}{FIN}")
print(f"{GRIS}cuenta B (alumna)  {uidB}{FIN}")

# Se pregunta por la columna: si la base aun no tiene la migracion aplicada,
# PostgREST contesta con un error en vez de con filas.
hay_papelera = rest("songs?select=deleted_at&limit=1", token=tokenA).codigo == 200

def limpiar():
    for id_ in (ID_LIBRE, ID_PAGA):
        rest(f"songs?id=eq.{id_}", "DELETE", token=tokenA)
    rest(f"scores?song_id=eq.{ID_LIBRE}", "DELETE", token=tokenB)
    for t in (tokenA, tokenB):
        rest("profiles?id=eq." + (uidA if t is tokenA else uidB), "PATCH",
             {"subscribed": False, "sub_source": "none"}, token=t)

limpiar()

# --------------------------------------------------------------------------
seccion("Sin cuenta no se ve nada")

@prueba("un desconocido no puede leer las canciones")
def _():
    r = rest("songs?select=id")
    assert r.codigo != 200 or r.datos == [], \
        f"la lista de canciones es publica ({r.codigo}): {r.texto[:120]}"

@prueba("un desconocido no puede leer ni el catalogo")
def _():
    r = rest("songs_catalog?select=title")
    assert r.codigo != 200 or r.datos == [], \
        f"el catalogo es publico ({r.codigo}): {r.texto[:120]}"

@prueba("un desconocido no puede leer los perfiles")
def _():
    r = rest("profiles?select=id")
    assert r.codigo != 200 or r.datos == [], \
        f"los perfiles son publicos ({r.codigo}): {r.texto[:120]}"

@prueba("un desconocido no puede escribir")
def _():
    r = rest("songs", "POST", [cancion(MARCA + "-cuela", "Colada", uidA)])
    assert r.codigo >= 400, f"un desconocido pudo insertar ({r.codigo})"

# --------------------------------------------------------------------------
seccion("Subir y ser dueno")

@prueba("la autora puede subir sus canciones")
def _():
    r = rest("songs", "POST", [cancion(ID_LIBRE, "Prueba libre", uidA, gratis=True),
                               cancion(ID_PAGA, "Prueba de pago", uidA, gratis=False)],
             token=tokenA, cabeceras={"Prefer": "resolution=merge-duplicates"})
    assert r.codigo in (200, 201, 204), f"no pudo subir: {r.codigo} {r.texto[:200]}"

@prueba("nadie puede subir una cancion a nombre de otro")
def _():
    r = rest("songs", "POST", [cancion(MARCA + "-robo", "Robada", uidA)], token=tokenB)
    assert r.codigo >= 400, f"la cuenta B se hizo pasar por la A ({r.codigo})"

@prueba("la autora ve lo suyo aunque no este suscrita")
def _():
    r = rest(f"songs?select=id&id=eq.{ID_PAGA}", token=tokenA)
    assert r.datos, "la autora perdio acceso a su propia cancion"

# --------------------------------------------------------------------------
seccion("El candado")

@prueba("sin suscripcion se ven las gratis y no las de pago")
def _():
    r = rest(f"songs?select=id&id=in.({ID_LIBRE},{ID_PAGA})", token=tokenB)
    ids = {x["id"] for x in (r.datos or [])}
    assert ID_LIBRE in ids, "no llega ni la cancion gratis"
    assert ID_PAGA not in ids, "SE FILTRA la cancion de pago sin suscripcion"

@prueba("la huella de una cancion de pago no se entrega")
def _():
    r = rest(f"songs?select=fp_keys&id=eq.{ID_PAGA}", token=tokenB)
    assert not r.datos, "entrego la huella de una cancion bloqueada"

@prueba("el catalogo ensena el titulo pero nunca la huella que se paga")
def _():
    r = rest("songs_catalog?select=*&id=eq." + ID_PAGA, token=tokenB)
    assert r.datos, "el catalogo no ensena la bloqueada: no hay forma de venderla"
    fila = r.datos[0]
    assert "fp_keys" not in fila, "EL CATALOGO REGALA LA HUELLA ENTERA"
    assert "fp_times" not in fila, "EL CATALOGO REGALA LOS TIEMPOS"
    assert "downbeats" not in fila, "EL CATALOGO REGALA LAS MARCAS DEL PROFESOR"
    assert fila.get("title"), "el catalogo no trae ni el titulo"

@prueba("con suscripcion se abren todas")
def _():
    rest("profiles", "POST", [{"id": uidB, "subscribed": True, "sub_source": "test"}],
         token=tokenB, cabeceras={"Prefer": "resolution=merge-duplicates"})
    r = rest(f"songs?select=id&id=eq.{ID_PAGA}", token=tokenB)
    assert r.datos, "con suscripcion sigue sin poder verla"

@prueba("al cancelar la suscripcion se vuelve a cerrar")
def _():
    rest(f"profiles?id=eq.{uidB}", "PATCH",
         {"subscribed": False, "sub_source": "none"}, token=tokenB)
    r = rest(f"songs?select=id&id=eq.{ID_PAGA}", token=tokenB)
    assert not r.datos, "tras cancelar sigue teniendo acceso"

@prueba("nadie se puede regalar la suscripcion de pago a si mismo")
def _():
    r = rest(f"profiles?id=eq.{uidB}", "PATCH",
             {"subscribed": True, "sub_source": "play"}, token=tokenB)
    ok = r.codigo >= 400
    if not ok:
        v = rest(f"profiles?select=sub_source&id=eq.{uidB}", token=tokenB)
        ok = not v.datos or v.datos[0]["sub_source"] != "play"
    assert ok, "cualquiera puede declararse cliente de pago sin pagar"

@prueba("nadie puede tocar el perfil de otro")
def _():
    r = rest(f"profiles?id=eq.{uidA}", "PATCH", {"subscribed": True}, token=tokenB)
    v = rest(f"profiles?select=subscribed&id=eq.{uidA}", token=tokenA)
    if v.datos:
        assert not v.datos[0]["subscribed"], "la cuenta B suscribio a la A"

# --------------------------------------------------------------------------
seccion("Borrar")

@prueba("quien no la creo no la puede borrar")
def _():
    rest(f"songs?id=eq.{ID_LIBRE}", "DELETE", token=tokenB)
    r = rest(f"songs?select=id&id=eq.{ID_LIBRE}", token=tokenA)
    assert r.datos, "una cuenta ajena borro la cancion"

@prueba("quien no la creo tampoco la puede modificar")
def _():
    rest(f"songs?id=eq.{ID_LIBRE}", "PATCH", {"title": "Secuestrada"}, token=tokenB)
    r = rest(f"songs?select=title&id=eq.{ID_LIBRE}", token=tokenA)
    assert r.datos and r.datos[0]["title"] == "Prueba libre", \
        "una cuenta ajena cambio el titulo"

# --------------------------------------------------------------------------
seccion("La papelera")

if not hay_papelera:
    print(f"  {GRIS}· la base todavia no tiene la columna: sin probar{FIN}")
else:
    @prueba("borrar esconde en vez de destruir")
    def _():
        r = rest(f"songs?id=eq.{ID_LIBRE}", "PATCH",
                 {"deleted_at": "now()"}, token=tokenA)
        assert r.codigo < 400, f"no pudo borrar: {r.codigo} {r.texto[:200]}"
        v = rest(f"songs?select=id,deleted_at&id=eq.{ID_LIBRE}", token=tokenA)
        assert v.datos, "la fila desaparecio: no se puede recuperar"
        assert v.datos[0]["deleted_at"], "no quedo marcada como borrada"

    @prueba("lo borrado desaparece para los demas")
    def _():
        r = rest(f"songs?select=id&id=eq.{ID_LIBRE}", token=tokenB)
        assert not r.datos, "otra cuenta sigue viendo una cancion borrada"

    @prueba("lo borrado desaparece tambien del catalogo")
    def _():
        r = rest(f"songs_catalog?select=id&id=eq.{ID_LIBRE}", token=tokenB)
        assert not r.datos, "la borrada sigue anunciandose en el catalogo"

    @prueba("la autora la sigue viendo, que es lo que permite recuperarla")
    def _():
        r = rest(f"songs?select=id&id=eq.{ID_LIBRE}&deleted_at=not.is.null",
                 token=tokenA)
        assert r.datos, "ni la autora puede encontrarla para recuperarla"

    @prueba("el telefono no se la vuelve a bajar sola")
    def _():
        # Es la consulta exacta que hace la app al sincronizar
        r = rest("songs?select=id&deleted_at=is.null", token=tokenA)
        ids = {x["id"] for x in (r.datos or [])}
        assert ID_LIBRE not in ids, \
            "al sincronizar se rebaja la cancion recien borrada"

    @prueba("recuperar la devuelve entera")
    def _():
        r = rest(f"songs?id=eq.{ID_LIBRE}", "PATCH",
                 {"deleted_at": None}, token=tokenA)
        assert r.codigo < 400, f"no pudo recuperar: {r.codigo}"
        v = rest(f"songs?select=id,title&id=eq.{ID_LIBRE}&deleted_at=is.null",
                 token=tokenA)
        assert v.datos, "no volvio"
        assert v.datos[0]["title"] == "Prueba libre", "volvio cambiada"
        w = rest(f"songs?select=id&id=eq.{ID_LIBRE}", token=tokenB)
        assert w.datos, "volvio para la autora pero no para los demas"

    @prueba("nadie puede borrar una cancion ajena ni escondiendola")
    def _():
        rest(f"songs?id=eq.{ID_LIBRE}", "PATCH",
             {"deleted_at": "now()"}, token=tokenB)
        r = rest(f"songs?select=deleted_at&id=eq.{ID_LIBRE}", token=tokenA)
        assert r.datos and not r.datos[0]["deleted_at"], \
            "una cuenta ajena mando a la papelera una cancion que no es suya"

    @prueba("la limpieza automatica no se lleva lo recien borrado")
    def _():
        rest(f"songs?id=eq.{ID_PAGA}", "PATCH", {"deleted_at": "now()"}, token=tokenA)
        r = pedir("/rest/v1/rpc/purge_deleted_songs", "POST", {}, token=tokenA)
        if r.codigo == 404:
            raise AssertionError("falta la funcion de limpieza en la base")
        v = rest(f"songs?select=id&id=eq.{ID_PAGA}", token=tokenA)
        assert v.datos, "la limpieza se llevo una cancion de hoy: se pierden los 30 dias"

    @prueba("vaciar a mano si la borra del todo")
    def _():
        rest(f"songs?id=eq.{ID_PAGA}", "DELETE", token=tokenA)
        v = rest(f"songs?select=id&id=eq.{ID_PAGA}", token=tokenA)
        assert not v.datos, "el borrado definitivo no borro"

# --------------------------------------------------------------------------
seccion("Los puntajes son de cada uno")

@prueba("cada cual solo ve los suyos")
def _():
    p = {"id": MARCA + "-p", "owner": uidB, "song_id": ID_LIBRE,
         "song_title": "Prueba libre", "rhythm": "bachata",
         "played_at": "2026-01-01T00:00:00Z", "taps": 10, "hits": 8,
         "points": 700, "accuracy": 80, "avg_error": 50, "best": 100}
    r = rest("scores", "POST", [p], token=tokenB,
             cabeceras={"Prefer": "resolution=merge-duplicates"})
    assert r.codigo < 400, f"no pudo guardar su puntaje: {r.codigo} {r.texto[:150]}"
    v = rest(f"scores?select=id&id=eq.{MARCA}-p", token=tokenA)
    assert not v.datos, "una cuenta ve los puntajes de otra"
    w = rest(f"scores?select=id&id=eq.{MARCA}-p", token=tokenB)
    assert w.datos, "no ve ni sus propios puntajes"
    rest(f"scores?id=eq.{MARCA}-p", "DELETE", token=tokenB)

# --------------------------------------------------------------------------
limpiar()

@prueba("las pruebas no dejaron basura")
def _():
    seccion("Limpieza")
    r = rest(f"songs?select=id&id=like.{MARCA}*", token=tokenA)
    assert not r.datos, "quedaron canciones de prueba: " + str(r.datos)

print("\n" + "─" * 58)
if _fallos:
    print(f"{ROJO}{len(_fallos)} de {_corridas} fallan{FIN}")
    for f in _fallos:
        print("  · " + f)
    sys.exit(1)
print(f"{VERDE}{_corridas} pruebas, todas pasan{FIN}")
