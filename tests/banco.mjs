/* Banco de pruebas del reconocedor.
 *
 * No es una prueba de las que pasan o fallan: es una medición. Sirve para
 * poder decir "mejoró de tanto a tanto" en vez de "creo que ahora anda mejor".
 *
 *   node tests/banco.mjs
 *
 * Mide dos cosas, en varias condiciones de ruido:
 *   ACIERTA  — de cada 100 intentos, cuántos reconoce la canción correcta
 *   INVENTA  — cuántas veces dice una canción cuando en realidad suena otra
 *              que nadie grabó. Este número TIENE que quedarse en cero:
 *              marcarle el tiempo equivocado al alumno es peor que callarse.
 *   SEGUNDOS — cuánto audio necesitó para engancharla
 */

import { cargar } from "./extraer.mjs";
import { azar } from "./marco.mjs";

const M = await cargar([
  "FP", "packHash", "Fingerprinter", "Matcher", "huellaRala", "RALO"
]);

const FPMAX = 232;

/* Música con estructura (acordes que cambian) más detalle propio de cada
   instante, que es lo que hace reconocible un momento concreto. */
function cancion(semilla, frames) {
  const rnd = azar(semilla);
  const acordes = Array.from({ length: 32 }, () =>
    Array.from({ length: 4 }, () => 5 + Math.floor(rnd() * 225)));
  const out = [];
  for (let f = 0; f < frames; f++) {
    const spec = new Float32Array(FPMAX).fill(-120);
    acordes[Math.floor(f / 24) % acordes.length].forEach((bin, k) => {
      spec[bin] = -22 - k * 3;
      if (bin + 1 < FPMAX) spec[bin + 1] = spec[bin] - 9;
    });
    for (let k = 0; k < 3; k++) spec[5 + Math.floor(rnd() * 225)] = -12 - rnd() * 6;
    out.push(spec);
  }
  return out;
}

/* Una sala de verdad, con el micrófono de un teléfono.
 *
 * Lo que rompe el reconocimiento no es que el sonido esté "más sucio": es que
 * cambie CUÁL es el pico más fuerte de cada banda. La huella se arma con la
 * posición de esos picos, y se comparan exactos: si en una banda gana otro
 * tono, ese trozo de huella deja de coincidir. Un primer intento subía el
 * ruido de fondo y no cambiaba nada, porque el pico verdadero seguía ganando.
 *
 * Aquí se modela lo que sí pasa:
 *   · voces y golpes que meten tonos fuertes y ganan bandas enteras
 *   · el micrófono del teléfono, que se come los graves y los agudos
 *   · la reverberación del salón, que arrastra el sonido de un frame al otro
 *   · trozos que directamente se pierden (alguien tapa el teléfono)
 */
/* Cuántos sonidos ajenos compiten con la música en cada instante. La escala
   llega a propósito hasta donde la música queda casi tapada: sin ese extremo
   no hay forma de ver si un cambio mejora algo, porque en condiciones
   normales el reconocedor ya acierta siempre. */
const INTERFERENCIAS = [0, 2, 4, 6, 9];

function ensuciar(specs, nivel, semilla) {
  const rnd = azar(semilla);
  const fuerza = nivel / 4;                 // 0 = estudio, 1 = sala llena
  let anterior = null;

  return specs.map(s => {
    const c = Float32Array.from(s);

    // El micrófono no oye todo por igual
    for (let i = 0; i < c.length; i++) {
      if (i < 16) c[i] -= 9 * fuerza;                 // graves
      if (i > 170) c[i] -= 7 * fuerza;                // agudos
      c[i] += (rnd() * 2 - 1) * 3.5 * fuerza;
    }

    // Reverberación: queda un resto del frame anterior
    if (anterior && fuerza > 0) {
      for (let i = 0; i < c.length; i++) {
        c[i] = Math.max(c[i], anterior[i] - 7 + 4 * (1 - fuerza));
      }
    }

    // Voces, sillas, palmas: tonos ajenos que pueden ganar su banda
    const cuantos = INTERFERENCIAS[nivel];
    for (let k = 0; k < cuantos; k++) {
      const bin = 5 + Math.floor(rnd() * 225);
      c[bin] = Math.max(c[bin], -17 + rnd() * 13);
    }

    // Y cada tanto se pierde el sonido del todo
    if (rnd() < fuerza * 0.05) c.fill(-120);

    anterior = c;
    return c;
  });
}

const huellar = (specs) => {
  const fp = new M.Fingerprinter();
  specs.forEach((x, i) => fp.push(x, i));
  return fp.result();
};

/* Con DIRIGIDA se simula que la persona ya eligió la canción a mano. */
const DIRIGIDA = process.argv.includes("--dirigida");

const BIBLIO = 12;                 // canciones guardadas
const LARGO = 2400;                // ~110 s cada una
const VENTANAS = [3.5, 6, 9, 12];  // segundos de audio en la consulta

console.log("Preparando " + BIBLIO + " canciones..." + (DIRIGIDA ? "  [con la canción ya elegida]" : ""));
const canciones = [];
for (let i = 0; i < BIBLIO; i++) canciones.push(cancion(100 + i, LARGO));
const desconocidas = [];
for (let i = 0; i < 6; i++) desconocidas.push(cancion(900 + i, LARGO));

const m = new M.Matcher();
canciones.forEach((c, i) => m.add({ id: "s" + i, title: "s" + i, fp: huellar(c) }));

function medir(nivel) {
  let intentos = 0, aciertos = 0, inventos = 0;
  let sumaSeg = 0, conSeg = 0;

  for (let i = 0; i < BIBLIO; i++) {
    for (const inicio of [200, 700, 1300, 1900]) {
      intentos++;
      let enganche = null;
      for (const seg of VENTANAS) {
        const largo = Math.round(seg / M.FP.HOP);
        const tramo = ensuciar(canciones[i].slice(inicio, inicio + largo), nivel, i * 31 + inicio);
        const q = huellar(tramo);
        const r = m.match(q.keys, q.times, DIRIGIDA ? ("s" + i) : undefined);
        if (r) { enganche = { r, seg }; break; }
      }
      if (enganche && enganche.r.songId === "s" + i) {
        aciertos++; sumaSeg += enganche.seg; conSeg++;
      }
    }
  }

  // Y ahora música que nadie grabó: no debe reconocer ni una
  let pruebasFalsas = 0;
  for (const d of desconocidas) {
    for (const inicio of [200, 900, 1600]) {
      pruebasFalsas++;
      for (const seg of VENTANAS) {
        const largo = Math.round(seg / M.FP.HOP);
        const q = huellar(ensuciar(d.slice(inicio, inicio + largo), nivel, inicio));
        /* Con búsqueda dirigida el peligro cambia: no es confundir una canción
           con otra, es decir "sí, es esta" cuando suena algo que no lo es. Se
           comprueba pidiéndole la primera canción de la lista. */
        if (m.match(q.keys, q.times, DIRIGIDA ? "s0" : undefined)) { inventos++; break; }
      }
    }
  }

  return {
    acierta: (aciertos / intentos * 100),
    inventa: inventos,
    falsas: pruebasFalsas,
    seg: conSeg ? (sumaSeg / conSeg) : NaN
  };
}

console.log("\n  condicion       acierta   inventa   segundos que necesita");
console.log("  " + "─".repeat(56));
for (const nivel of [0, 1, 2, 3, 4]) {
  const r = medir(nivel);
  const nombre = ["estudio", "clase normal", "clase ruidosa", "muy ruidoso", "casi tapada"][nivel];
  console.log(
    "  " + nombre.padEnd(16) +
    (r.acierta.toFixed(0) + "%").padStart(5) +
    String(r.inventa + "/" + r.falsas).padStart(11) +
    (isNaN(r.seg) ? "     —" : ("      " + r.seg.toFixed(1) + " s"))
  );
}
console.log("");
