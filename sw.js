/* Lo que hace que la app se abra sin internet.
 *
 * Guarda una copia de la página y los iconos, para que la app arranque aunque
 * no haya señal. Pero no todo se trata igual, y esa diferencia es la razón de
 * este archivo:
 *
 *   - LA PÁGINA se pide primero a la red. Es el programa entero: si hay una
 *     versión nueva, tiene que llegar HOY, no la próxima vez.
 *   - LOS ICONOS salen de la copia guardada. No cambian casi nunca y así la
 *     app abre al instante.
 *
 * Antes la página también salía de la copia, y eso obligaba a abrir la app dos
 * veces después de cada cambio: la primera traía la versión nueva pero
 * enseñaba la vieja. Se pasaron días diciéndole a la gente "abrila dos veces",
 * que es una instrucción que nadie recuerda y que hacía imposible saber qué
 * versión estaba probando cada uno.
 *
 * Lo que NO se guarda nunca son las llamadas al servidor. Una respuesta vieja
 * de la nube es peor que ninguna: mostraría canciones que ya no están o un
 * candado que ya se abrió.
 */

/* El nombre lleva la version dentro a proposito: al cambiarla, este deposito
 * pasa a ser otro, se baja todo de nuevo y el viejo se borra. Con un nombre
 * fijo, una copia mala se quedaba pegada sin manera de echarla. */
const CACHE = "cuentas-2.22.0";
const COPIA = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icono-64.png",
  "./icono-192.png",
  "./icono-512.png"
];

/* Cuanto se espera a la red antes de tirar de la copia guardada.
 *
 * Es el equilibrio entero de este archivo. Muy corto y con mala señal siempre
 * enseñaría la version vieja; muy largo y quien no tiene internet se queda
 * mirando una pantalla en blanco. Dos segundos y medio: quien tiene señal ve
 * lo nuevo, quien no la tiene abre la app igual sin darse cuenta de que espero. */
const ESPERA = 2500;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(COPIA))
      // Si un archivo falla, no se aborta la instalación entera:
      // es preferible una copia incompleta a no tener ninguna.
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ¿Esto es la app en sí, o un archivo suelto que la acompaña?
 *
 * La app es lo único que cambia de verdad, y es lo único que hay que ir a
 * buscar cada vez. Se mira el tipo de petición, no el nombre del archivo:
 * abrir la app desde el ícono, desde el link o recargando llega de formas
 * distintas y todas tienen que contar como "la app". */
function esLaApp(req, url) {
  return req.mode === "navigate" ||
         url.pathname === "/" ||
         url.pathname.endsWith("/index.html");
}

async function primeroLaRed(req) {
  const guardada = await caches.match(req);
  try {
    /* "reload" salta el almacen del propio navegador y pregunta al servidor.
       Sin esto, el navegador puede contestar con su copia -si el servidor le
       dio permiso para guardarla un rato- y no llegariamos a preguntar nunca:
       todo el trabajo de este archivo se perderia por una cabecera. */
    const fresca = new Request(req.url, { cache: "reload", credentials: "same-origin" });
    const resp = await new Promise((listo, falla) => {
      const reloj = setTimeout(() => falla(new Error("tardo")), ESPERA);
      fetch(fresca).then(r => { clearTimeout(reloj); listo(r); },
                         e => { clearTimeout(reloj); falla(e); });
    });
    if (resp && resp.ok) {
      const copia = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copia));
    }
    return resp;
  } catch (e) {
    /* Sin señal, o con una señal que no llega a tiempo: se abre con lo
       guardado. La app funciona sin internet, que es medio motivo de que
       exista este archivo. */
    if (guardada) return guardada;
    throw e;
  }
}

async function primeroLaCopia(req) {
  const guardada = await caches.match(req);
  const red = fetch(req).then(resp => {
    if (resp && resp.ok) {
      const copia = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copia));
    }
    return resp;
  }).catch(() => guardada);
  return guardada || red;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Todo lo que sea hablar con el servidor va siempre a la red
  if (url.origin !== self.location.origin) return;

  e.respondWith(esLaApp(req, url) ? primeroLaRed(req) : primeroLaCopia(req));
});
