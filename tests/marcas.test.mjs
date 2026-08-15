/* Pruebas de la rejilla de compases: detectar y acomodar las marcas que se
   salieron de tiempo cuando el profesor grababa. */

import { cargar, FUENTE } from "./extraer.mjs";
import { seccion, prueba, afirmar, igual, cerca, resumen } from "./marco.mjs";

const M = await cargar(["rejillaDeCompases", "TOLERANCIA"]);

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
