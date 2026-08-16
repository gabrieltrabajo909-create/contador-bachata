/* Pruebas de la rejilla de compases: detectar y acomodar las marcas que se
   salieron de tiempo cuando el profesor grababa. */

import { cargar, FUENTE } from "./extraer.mjs";
import { seccion, prueba, afirmar, igual, cerca, resumen } from "./marco.mjs";

const M = await cargar(["rejillaDeCompases", "TOLERANCIA", "DUDOSA", "clasificarMarcas"]);

// Un profesor perfecto: un uno cada 2 segundos
const perfecto = (n = 20, paso = 2, desde = 1.5) =>
  Array.from({ length: n }, (_, i) => desde + i * paso);

seccion("Encontrar el compás");

await prueba("con marcas parejas encuentra el compás exacto", () => {
  const r = M.rejillaDeCompases(perfecto());
  afirmar(r, "no encontró nada");
  cerca(r.compas, 2, 0.001, "no midió bien el compás");
  igual(Math.max(...r.desvios.map(Math.abs)) < 0.001, true, "inventó desvíos");
});

await prueba("aguanta el pulso humano sin llamarlo error", () => {
  /* Nadie marca clavado. Unos 40 ms arriba y abajo es lo normal y NO
     tiene que salir como fuera de tiempo. */
  const marcas = perfecto().map((x, i) => x + (i % 3 - 1) * 0.04);
  const r = M.rejillaDeCompases(marcas);
  const limite = r.compas * M.TOLERANCIA;
  const fuera = r.desvios.filter(e => Math.abs(e) > limite).length;
  igual(fuera, 0, "marcó como error el pulso humano normal");
});

await prueba("encuentra la marca que llegó tarde", () => {
  const marcas = perfecto();
  marcas[7] += 0.55;                       // medio segundo tarde
  const r = M.rejillaDeCompases(marcas);
  const limite = r.compas * M.TOLERANCIA;
  const fuera = r.desvios.map((e, i) => Math.abs(e) > limite ? i : -1).filter(i => i >= 0);
  igual(fuera.join(","), "7", "no encontró la marca tarde, o marcó de más");
});

await prueba("dice dónde tendría que haber caído", () => {
  const marcas = perfecto();
  marcas[7] += 0.55;
  const r = M.rejillaDeCompases(marcas);
  cerca(r.donde[7], 1.5 + 7 * 2, 0.05, "el sitio corregido está mal");
});

await prueba("un compás salteado no corre toda la cuenta", () => {
  /* El profesor se distrae y no marca un uno. El hueco sale del doble.
     Si eso se contara como un compás, TODAS las marcas siguientes
     quedarían mal y aparecerían como errores. */
  const marcas = perfecto();
  marcas.splice(10, 1);
  const r = M.rejillaDeCompases(marcas);
  cerca(r.compas, 2, 0.01, "el salto le descuadró la medida del compás");
  const limite = r.compas * M.TOLERANCIA;
  const fuera = r.desvios.filter(e => Math.abs(e) > limite).length;
  igual(fuera, 0, "el compás salteado hizo que " + fuera + " marcas parezcan errores");
});

await prueba("varios errores sueltos no arrastran a los buenos", () => {
  const marcas = perfecto(24);
  marcas[3] += 0.5; marcas[11] -= 0.45; marcas[19] += 0.6;
  const r = M.rejillaDeCompases(marcas);
  const limite = r.compas * M.TOLERANCIA;
  const fuera = r.desvios.map((e, i) => Math.abs(e) > limite ? i : -1).filter(i => i >= 0);
  igual(fuera.join(","), "3,11,19", "encontró " + fuera.join(",") + " en vez de 3,11,19");
});

await prueba("con muy pocas marcas no arriesga", () => {
  igual(M.rejillaDeCompases([]), null);
  igual(M.rejillaDeCompases([1]), null);
  igual(M.rejillaDeCompases([1, 3]), null);
});

await prueba("con marcas absurdas se abstiene", () => {
  igual(M.rejillaDeCompases([0, 0.05, 0.1, 0.15]), null, "aceptó compases de 50 ms");
  igual(M.rejillaDeCompases([0, 30, 60, 90]), null, "aceptó compases de 30 s");
});

/* ------------------------------------------------------------------------ */
seccion("Lo que se acomoda solo y lo que se pregunta");

/* Mirando solo los tiempos, una marca que llego tarde y un medio compas de
   verdad se ven IGUAL. Por eso lo pequeño -el temblor del pulso- se acomoda
   solo, y lo grande se le pregunta al profesor: si ahi la cancion cambia de
   verdad, moverla le borra el trabajo, y se lo borra en silencio. */

await prueba("el temblor humano se acomoda solo", () => {
  const marcas = perfecto();
  marcas[7] += 0.35;                       // torcida, pero no tanto
  const { torcidas, dudosas } = M.clasificarMarcas(marcas);
  igual(torcidas.join(","), "7", "no vio la marca torcida");
  igual(dudosas.length, 0, "trato como dudosa un simple temblor de pulso");
});

await prueba("lo que esta muy lejos no se toca sin preguntar", () => {
  const marcas = perfecto();
  marcas[7] += 0.9;                        // casi medio compas
  const { torcidas, dudosas } = M.clasificarMarcas(marcas);
  igual(dudosas.join(","), "7", "movio sola una marca que puede ser un cambio");
  igual(torcidas.length, 0, "la conto dos veces");
});

await prueba("una marca no puede ser torcida y dudosa a la vez", () => {
  const marcas = perfecto(24);
  marcas[3] += 0.35; marcas[11] += 0.9; marcas[19] -= 0.95;
  const { torcidas, dudosas } = M.clasificarMarcas(marcas);
  const repetidas = torcidas.filter(i => dudosas.includes(i));
  igual(repetidas.length, 0, "hay marcas en los dos grupos");
  igual(torcidas.join(","), "3", "no separo bien las torcidas");
  igual(dudosas.join(","), "11,19", "no separo bien las dudosas");
});

await prueba("con las marcas bien no hay nada que acomodar", () => {
  const { torcidas, dudosas } = M.clasificarMarcas(perfecto());
  igual(torcidas.length + dudosas.length, 0, "invento trabajo donde no habia");
});

await prueba("el limite de lo dudoso es mayor que el de lo torcido", () => {
  afirmar(M.DUDOSA > M.TOLERANCIA,
    "si lo dudoso fuera mas estricto, no se acomodaria nunca nada solo");
});

/* ------------------------------------------------------------------------ */
seccion("El fallo del nombre tapado");

await prueba("ningún callback llama a su parámetro t", () => {
  /* La pantalla de revisar estaba rota justo por esto: el parámetro de un
     forEach se llamaba `t` y tapaba la función de traducir, así que
     `t("remove")` reventaba. Solo fallaba cuando había al menos una marca,
     que es por lo que no se veía probando en vacío. */
  const sospechosos = [...FUENTE.matchAll(
    /\((?:\s*)t(?:\s*),(?:\s*)\w+(?:\s*)\)(?:\s*)=>/g)];
  igual(sospechosos.length, 0,
    "hay callbacks cuyo primer parámetro se llama t: taparían la traducción");

  const solos = [...FUENTE.matchAll(/\.(?:forEach|map|filter)\(\(?t\)?\s*=>/g)];
  igual(solos.length, 0, "hay recorridos cuyo parámetro se llama t");
});

/* Sin esto, un fallo se veia en rojo por pantalla pero el archivo terminaba
   diciendo que todo habia ido bien: correr.sh no tenia como enterarse y
   remataba con "Todo en orden". Una prueba que falla sin que nadie se entere
   es peor que no tenerla. */
process.exit(resumen());
