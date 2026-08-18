/* Lo que hace que la app se abra sin internet.
 *
 * Guarda una copia de la página y los iconos. Al abrirla, sirve la copia al
 * instante y en paralelo va a buscar si hay una versión nueva: así arranca
 * rápido y aun así se actualiza sola.
 *
 * Lo que NO se guarda son las llamadas al servidor. Una respuesta vieja de
 * la nube es peor que ninguna: mostraría canciones que ya no están o un
 * candado que ya se abrió.
 */

/* El nombre lleva la version dentro a proposito: al cambiarla, este deposito
 * pasa a ser otro, se baja todo de nuevo y el viejo se borra. Con un nombre
 * fijo, una copia mala se quedaba pegada sin manera de echarla. */
const CACHE = "cuentas-2.12.0";
const COPIA = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icono-64.png",
  "./icono-192.png",
  "./icono-512.png"
];

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

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Todo lo que sea hablar con el servidor va siempre a la red
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(guardada => {
      const red = fetch(req).then(resp => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return resp;
      }).catch(() => guardada);
      return guardada || red;
    })
  );
});
