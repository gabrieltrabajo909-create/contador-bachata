/* Pruebas del reconocedor: la pieza de la que depende todo lo demas.
   Si esto falla, la app le marca al alumno el tiempo equivocado, que es el
   peor error posible: le ensena mal y encima con seguridad. */

import { cargar, FUENTE } from "./extraer.mjs";
import { seccion, prueba, afirmar, igual, cerca, azar, resumen } from "./marco.mjs";

const M = await cargar([
  "FP", "packHash", "Fingerprinter", "Matcher",
  "countAt", "nearestOne", "BANDS", "judge",
  "toB64", "fromB64", "RALO", "huellaRala", "Listener", "ventanaPara"
]);

/* ---------------------------------------------------------------------------
   Musica de mentira.

   No hace falta audio de verdad: el reconocedor no ve sonido, ve el espectro
   ya calculado. Se fabrica uno con picos en sitios que cambian de frame en
   frame de forma estable, que es exactamente lo que tiene la musica.
--------------------------------------------------------------------------- */
const FPMAX = 232;

/* Musica con estructura pero sin repetirse a si misma clavada: acordes que
   van cambiando mas un poco de detalle propio de cada momento (la voz, la
   percusion, el ruido de la sala). Eso ultimo es lo que hace reconocible un
   instante concreto y lo que distingue el estribillo tercero del primero. */
function cancionFalsa(semilla, frames) {
  const rnd = azar(semilla);
  const specs = [];
  const acordes = Array.from({ length: 32 }, () =>
    Array.from({ length: 4 }, () => 5 + Math.floor(rnd() * 225)));
  for (let f = 0; f < frames; f++) {
    const spec = new Float32Array(FPMAX).fill(-120);
    const acorde = acordes[Math.floor(f / 24) % acordes.length];
    acorde.forEach((bin, k) => {
      spec[bin] = -22 - k * 3;
      if (bin + 1 < FPMAX) spec[bin + 1] = spec[bin] - 9;
    });
    // Detalle irrepetible de este instante, mas fuerte que el acorde de fondo
    for (let k = 0; k < 3; k++) {
      const bin = 5 + Math.floor(rnd() * 225);
      spec[bin] = -12 - rnd() * 6;
    }
    specs.push(spec);
  }
  return specs;
}

/* Musica que se repite clavada, sin ningun detalle propio de cada momento.
   No existe en la realidad, pero sirve para comprobar que ante algo asi la
   app se abstiene en vez de elegir un compas al azar. */
function cancionEnBucle(semilla, frames, periodo = 96) {
  const rnd = azar(semilla);
  const patron = [];
  for (let f = 0; f < periodo; f++) {
    const spec = new Float32Array(FPMAX).fill(-120);
    for (let k = 0; k < 6; k++) {
      const bin = 5 + Math.floor(rnd() * 225);
      spec[bin] = -20 - k * 3;
    }
    patron.push(spec);
  }
  return Array.from({ length: frames }, (_, f) => patron[f % periodo]);
}

// Pasa espectros por el huellador y devuelve la huella
function huellar(specs, desde = 0) {
  const fp = new M.Fingerprinter();
  specs.forEach((s, i) => fp.push(s, desde + i));
  return fp.result();
}

// Copia de un tramo, como si el microfono lo escuchara a mitad de la cancion
function tramo(specs, inicio, largo, ruidoDb = 0, semilla = 99) {
  const rnd = azar(semilla);
  return specs.slice(inicio, inicio + largo).map(s => {
    if (!ruidoDb) return s;
    const c = Float32Array.from(s);
    for (let i = 0; i < c.length; i++) c[i] += (rnd() * 2 - 1) * ruidoDb;
    return c;
  });
}

const comoCancion = (id, specs) => ({ id, title: id, fp: huellar(specs) });

/* ========================================================================= */
seccion("Huella digital");

await prueba("empaquetar un hash cabe en 32 bits y es reversible", () => {
  for (const [a, b, dt] of [[0, 0, 0], [255, 255, 31], [116, 3, 10], [1, 254, 21]]) {
    const h = M.packHash(a, b, dt);
    afirmar(h >= 0 && h <= 0xFFFFFFFF, "se sale de 32 bits");
    igual((h >>> 13) & 255, a, "no recupero f1");
    igual((h >>> 5) & 255, b, "no recupero f2");
    igual(h & 31, dt, "no recupero dt");
  }
});

await prueba("dos musicas distintas dan huellas distintas", () => {
  const a = huellar(cancionFalsa(1, 200));
  const b = huellar(cancionFalsa(2, 200));
  const setA = new Set(a.keys);
  const comunes = [...b.keys].filter(k => setA.has(k)).length;
  afirmar(a.keys.length > 500, "la huella salio vacia: " + a.keys.length);
  afirmar(comunes / b.keys.length < 0.5,
    `se parecen demasiado: ${comunes}/${b.keys.length} hashes en comun`);
});

await prueba("la misma musica da siempre la misma huella", () => {
  const a = huellar(cancionFalsa(7, 120));
  const b = huellar(cancionFalsa(7, 120));
  igual(a.keys.length, b.keys.length, "distinta cantidad de hashes");
  for (let i = 0; i < a.keys.length; i++) igual(a.keys[i], b.keys[i], "hash " + i);
});

await prueba("una huella cabe: no crece sin control", () => {
  // 3 min a ~21.6 frames/s. Debe quedar en un tamano razonable para un movil.
  const frames = Math.round(180 / 0.0464);
  const { keys } = huellar(cancionFalsa(3, frames));
  const porSegundo = keys.length / 180;
  afirmar(porSegundo < 500, `demasiados hashes por segundo: ${porSegundo.toFixed(0)}`);
  afirmar(porSegundo > 20, `sospechosamente pocos: ${porSegundo.toFixed(0)}`);
});

/* ========================================================================= */
seccion("Reconocer");

const CANCION_A = cancionFalsa(11, 2000);   // ~90 s
const CANCION_B = cancionFalsa(22, 2000);
const CANCION_C = cancionFalsa(33, 2000);   // esta NO se guarda nunca

function biblioteca(...pares) {
  const m = new M.Matcher();
  for (const [id, specs] of pares) m.add(comoCancion(id, specs));
  return m;
}

await prueba("reconoce un trozo de una cancion guardada", () => {
  const m = biblioteca(["A", CANCION_A]);
  const q = huellar(tramo(CANCION_A, 600, 130));   // ~6 s desde el frame 600
  const r = m.match(q.keys, q.times);
  afirmar(r, "no reconocio nada");
  igual(r.songId, "A", "reconocio otra cancion");
});

await prueba("dice en que segundo va, no solo cual es", () => {
  const m = biblioteca(["A", CANCION_A]);
  for (const inicio of [0, 300, 900, 1500]) {
    const q = huellar(tramo(CANCION_A, inicio, 130));
    const r = m.match(q.keys, q.times);
    afirmar(r, "no reconocio desde el frame " + inicio);
    cerca(r.offsetFrames, inicio, 1, "desfase mal calculado desde " + inicio);
  }
});

await prueba("elige la correcta habiendo varias guardadas", () => {
  const m = biblioteca(["A", CANCION_A], ["B", CANCION_B]);
  for (const [id, specs] of [["A", CANCION_A], ["B", CANCION_B]]) {
    const q = huellar(tramo(specs, 700, 130));
    const r = m.match(q.keys, q.times);
    afirmar(r, "no reconocio " + id);
    igual(r.songId, id, "confundio las canciones");
  }
});

await prueba("aguanta el ruido del microfono", () => {
  const m = biblioteca(["A", CANCION_A], ["B", CANCION_B]);
  const q = huellar(tramo(CANCION_A, 500, 150, 2.5));
  const r = m.match(q.keys, q.times);
  afirmar(r, "el ruido le impidio reconocer");
  igual(r.songId, "A");
  cerca(r.offsetFrames, 500, 2, "el ruido descuadro el desfase");
});

/* ------------------------------------------------------------------------ */
seccion("No inventar: el error mas caro");

await prueba("una cancion que nadie grabo NO se reconoce", () => {
  const m = biblioteca(["A", CANCION_A], ["B", CANCION_B]);
  for (const inicio of [100, 600, 1200, 1700]) {
    const q = huellar(tramo(CANCION_C, inicio, 150));
    const r = m.match(q.keys, q.times);
    igual(r, null, `invento una coincidencia en el frame ${inicio}` +
      (r ? ` (dijo ${r.songId} con ${r.score} votos)` : ""));
  }
});

await prueba("con UNA sola cancion guardada tampoco inventa", () => {
  // Este es el caso que fallaba en produccion: con la biblioteca casi vacia
  // cualquier musica se parecia lo suficiente a la unica que habia.
  const m = biblioteca(["A", CANCION_A]);
  for (const inicio of [0, 400, 800, 1400]) {
    const q = huellar(tramo(CANCION_C, inicio, 150));
    const r = m.match(q.keys, q.times);
    igual(r, null, `invento con la biblioteca casi vacia (frame ${inicio})`);
  }
});

await prueba("el silencio no se reconoce", () => {
  const m = biblioteca(["A", CANCION_A]);
  const mudo = Array.from({ length: 150 }, () => new Float32Array(FPMAX).fill(-120));
  const q = huellar(mudo);
  igual(m.match(q.keys, q.times), null, "reconocio algo en el silencio");
});

await prueba("ante musica que se repite clavada, se abstiene", () => {
  /* Si un compas es identico a otro no hay forma honesta de saber en cual
     estas. La respuesta correcta es no contestar: elegir uno al azar tiene
     una posibilidad entre muchas de acertar y marca el tiempo cambiado. */
  const bucle = cancionEnBucle(77, 2000);
  const m = new M.Matcher();
  m.add({ id: "loop", title: "loop", fp: huellar(bucle) });
  const q = huellar(tramo(bucle, 700, 150));
  igual(m.match(q.keys, q.times), null,
    "adivino una posicion en musica que se repite identica");
});

await prueba("un trozo demasiado corto se abstiene", () => {
  const m = biblioteca(["A", CANCION_A]);
  const q = huellar(tramo(CANCION_A, 400, 6));   // ~0,3 s
  const r = m.match(q.keys, q.times);
  igual(r, null, "arriesgo con muy poca informacion");
});

await prueba("la ganadora destaca de verdad sobre la segunda", () => {
  const m = biblioteca(["A", CANCION_A], ["B", CANCION_B], ["C2", cancionFalsa(44, 2000)]);
  const q = huellar(tramo(CANCION_B, 800, 160));
  const r = m.match(q.keys, q.times);
  afirmar(r, "no reconocio");
  igual(r.songId, "B");
  afirmar(r.score >= 2.5 * Math.max(r.rival, 1),
    `gano por poco: ${r.score} contra un rival de ${r.rival}`);
});

/* ------------------------------------------------------------------------ */
seccion("Biblioteca");

await prueba("quitar una cancion la deja de reconocer", () => {
  const m = biblioteca(["A", CANCION_A], ["B", CANCION_B]);
  m.remove("A");
  const q = huellar(tramo(CANCION_A, 600, 150));
  igual(m.match(q.keys, q.times), null, "sigue reconociendo lo que se quito");
  // y la otra sigue entera
  const q2 = huellar(tramo(CANCION_B, 600, 150));
  const r2 = m.match(q2.keys, q2.times);
  afirmar(r2 && r2.songId === "B", "quitar una rompio la otra");
});

await prueba("quitar y volver a poner deja todo igual", () => {
  const m = biblioteca(["A", CANCION_A], ["B", CANCION_B]);
  m.remove("A");
  m.add(comoCancion("A", CANCION_A));
  const q = huellar(tramo(CANCION_A, 600, 150));
  const r = m.match(q.keys, q.times);
  afirmar(r && r.songId === "A", "no volvio a reconocerla");
});

/* ------------------------------------------------------------------------ */
seccion("Huella reducida (para nombrar lo bloqueado)");

await prueba("ocupa una fraccion de la entera", () => {
  const fp = huellar(CANCION_A);
  const rala = M.huellaRala(fp);
  const razon = fp.keys.length / rala.keys.length;
  cerca(razon, M.RALO, 0.2, "no esta quitando 1 de cada " + M.RALO);
});

await prueba("todavia sirve para saber QUE cancion es", () => {
  // El identificador de la app usa un minimo mas bajo, porque tiene menos
  // marcas con las que trabajar.
  const m = new M.Matcher(8);
  for (const [id, specs] of [["A", CANCION_A], ["B", CANCION_B]]) {
    m.add({ id, title: id, fp: M.huellaRala(huellar(specs)) });
  }
  const q = huellar(tramo(CANCION_B, 700, 220));   // ~10 s
  const r = m.match(q.keys, q.times);
  afirmar(r, "no pudo nombrar la cancion bloqueada");
  igual(r.songId, "B", "nombro la cancion equivocada");
});

await prueba("y aun asi no inventa con una que no existe", () => {
  const m = new M.Matcher(8);
  m.add({ id: "A", title: "A", fp: M.huellaRala(huellar(CANCION_A)) });
  const q = huellar(tramo(CANCION_C, 700, 220));
  igual(m.match(q.keys, q.times), null, "el identificador invento una coincidencia");
});

/* ------------------------------------------------------------------------ */
seccion("Guardar y recuperar la huella");

await prueba("pasar por la nube no altera ni un numero", () => {
  const fp = huellar(cancionFalsa(55, 800));
  const k2 = M.fromB64(M.toB64(fp.keys), Uint32Array);
  const t2 = M.fromB64(M.toB64(fp.times), Uint16Array);
  igual(k2.length, fp.keys.length, "se perdieron hashes por el camino");
  igual(t2.length, fp.times.length, "se perdieron tiempos por el camino");
  for (let i = 0; i < fp.keys.length; i++) {
    igual(k2[i], fp.keys[i], "hash cambiado en la posicion " + i);
    igual(t2[i], fp.times[i], "tiempo cambiado en la posicion " + i);
  }
});

await prueba("aguanta hashes grandes y una huella vacia", () => {
  const grandes = Uint32Array.from([0, 1, 4294967295, 2147483648, 12345]);
  const v = M.fromB64(M.toB64(grandes), Uint32Array);
  for (let i = 0; i < grandes.length; i++) igual(v[i], grandes[i], "posicion " + i);
  igual(M.fromB64(M.toB64(new Uint32Array(0)), Uint32Array).length, 0, "la vacia falla");
});

await prueba("una cancion recuperada de la nube se reconoce igual", () => {
  const fp = huellar(CANCION_A);
  const revivida = {
    id: "A", title: "A",
    fp: {
      keys: M.fromB64(M.toB64(fp.keys), Uint32Array),
      times: M.fromB64(M.toB64(fp.times), Uint16Array)
    }
  };
  const m = new M.Matcher();
  m.add(revivida);
  const q = huellar(tramo(CANCION_A, 900, 150));
  const r = m.match(q.keys, q.times);
  afirmar(r && r.songId === "A", "tras el viaje ya no se reconoce");
  cerca(r.offsetFrames, 900, 1, "tras el viaje el desfase se descuadro");
});

/* ------------------------------------------------------------------------ */
seccion("Buscar una canción concreta");

await prueba("dirigir la búsqueda encuentra la misma y no otra", () => {
  const m = biblioteca(["A", CANCION_A], ["B", CANCION_B]);
  const q = huellar(tramo(CANCION_B, 800, 150));
  const r = m.match(q.keys, q.times, "B");
  afirmar(r, "no encontró la canción que se le pidió");
  igual(r.songId, "B");
  cerca(r.offsetFrames, 800, 2, "el desfase salió mal");
});

await prueba("pedir una canción que no suena devuelve nada", () => {
  const m = biblioteca(["A", CANCION_A], ["B", CANCION_B]);
  const q = huellar(tramo(CANCION_B, 800, 150));
  igual(m.match(q.keys, q.times, "A"), null,
    "dijo que sonaba A cuando en realidad sonaba B");
});

await prueba("DIRIGIR NO ES CONFORMARSE CON MENOS", () => {
  /* Se probó relajar el criterio cuando la persona ya eligió la canción, con
     el argumento de que no hay con quién confundirla. Medido, contestaba que
     sí en nueve de cada diez veces con música que no era esa.

     El motivo: con una sola canción quedan pocos votos, y la comparación
     estadística miente con números chicos. Un pico de ocho votos sobre un
     promedio de uno parece enorme y no significa nada.

     Esta prueba existe para que nadie lo intente otra vez sin medirlo. */
  const m = biblioteca(["A", CANCION_A], ["B", CANCION_B]);
  let falsosPositivos = 0, intentos = 0;
  for (const inicio of [100, 500, 900, 1300, 1700]) {
    intentos++;
    const q = huellar(tramo(CANCION_C, inicio, 200));
    if (m.match(q.keys, q.times, "A")) falsosPositivos++;
  }
  igual(falsosPositivos, 0,
    `dijo que sonaba A en ${falsosPositivos} de ${intentos} intentos con otra música`);
});

await prueba("el silencio tampoco cuela con la búsqueda dirigida", () => {
  const m = biblioteca(["A", CANCION_A]);
  const mudo = Array.from({ length: 200 }, () => new Float32Array(FPMAX).fill(-120));
  const q = huellar(mudo);
  igual(m.match(q.keys, q.times, "A"), null, "reconoció algo en el silencio");
});


/* ---------------------------------------------------------------------------
   La barra del micrófono

   Gabriel probó la app en un teléfono más barato: la barra se llenaba del todo
   al instante y no reconocía nada. Tenía razón en el diagnóstico. La barra
   sumaba decibelios de los graves y dividía por un número elegido a mano en UN
   teléfono; medido después, con sonido de banda ancha ya marcaba el máximo a
   -18 dB, cinco veces por debajo de donde el micrófono empieza a recortar. O
   sea que no medía el nivel: era una luz de "hay sonido", y encima tapaba
   justo lo que había que ver.

   Ahora mira el pico de la onda, que es lo que de verdad satura.
--------------------------------------------------------------------------- */
seccion("La barra del micrófono");

/* Un medidor de mentira, para poder probar sin micrófono. */
function medidor(muestras) {
  const l = Object.create(M.Listener.prototype);
  l.onda = new Float32Array(muestras.length);
  l.analyser = { getFloatTimeDomainData: (a) => a.set(muestras) };
  l.saturados = 0;
  l.domada = true;          // que no intente tocar un micrófono que no existe
  return l;
}

const tono = (pico, n = 512) =>
  Float32Array.from({ length: n }, (_, i) => pico * Math.sin(i * 0.3));

await prueba("más señal, más barra", () => {
  const l = medidor(tono(0.5));
  let anterior = -1;
  for (const pico of [0.001, 0.01, 0.05, 0.2, 0.5, 0.95]) {
    l.analyser.getFloatTimeDomainData = (a) => a.set(tono(pico, a.length));
    const v = l.medir();
    afirmar(v > anterior, `con pico ${pico} la barra no subió (${v.toFixed(2)})`);
    afirmar(v >= 0 && v <= 1, "la barra se salió de la escala: " + v);
    anterior = v;
  }
});

await prueba("un nivel bueno no llena la barra", () => {
  /* -18 dB es una grabación sana. Si eso ya marcara el máximo, la barra
     volvería a no servir para nada, que es de donde venimos. */
  const l = medidor(tono(0.125));
  const v = l.medir();
  afirmar(v < 0.85, "un nivel sano marca " + Math.round(v * 100) + "%, casi el tope");
  afirmar(v > 0.4, "un nivel sano marca solo " + Math.round(v * 100) + "%");
  igual(l.saturando, false, "dice que satura con la señal a un octavo del tope");
});

await prueba("a fondo de escala avisa que satura", () => {
  const l = medidor(tono(1));
  for (let i = 0; i < 12; i++) l.medir();
  igual(l.saturando, true, "el micrófono recorta y no se entera");
});

await prueba("un golpe suelto no cuenta como saturar", () => {
  /* Un platillo puede tocar el techo un frame y no pasa nada. Lo que estropea
     la huella es estar arriba todo el rato. Si avisara al primer pico, el
     aviso saldría en cada canción y dejaría de leerse. */
  const l = medidor(tono(0.2));
  for (let i = 0; i < 20; i++) {
    l.analyser.getFloatTimeDomainData = (a) => a.set(tono(i === 10 ? 1 : 0.2, a.length));
    l.medir();
    igual(l.saturando, false, "se asustó por un pico suelto en el frame " + i);
  }
});

await prueba("cuando deja de saturar se olvida", () => {
  const l = medidor(tono(1));
  for (let i = 0; i < 12; i++) l.medir();
  igual(l.saturando, true, "no llegó a saturar, la prueba no vale");
  l.analyser.getFloatTimeDomainData = (a) => a.set(tono(0.1, a.length));
  for (let i = 0; i < 12; i++) l.medir();
  igual(l.saturando, false, "se quedó avisando después de bajar el volumen");
});

/* ---------------------------------------------------------------------------
   La misma regla en todos los telefonos

   Aqui estuvo el fallo que costo mas caro. La huella guarda numeros de casilla
   del espectro, y a que nota corresponde cada casilla depende del muestreo del
   telefono. Medido en el navegador: los mismos 1000 Hz caen en la casilla 46 a
   44.100 Hz y en la 43 a 48.000 Hz. Tres casillas, y ya no coincide nada.

   Una cancion grabada en un telefono no se reconocia en otro, y no habia forma
   de verlo desde fuera: el sonido llegaba limpio, el nivel bien, el microfono
   perfecto. Simplemente eran dos reglas distintas midiendo lo mismo.

   Asi lo hacen los que funcionan: Chromaprint (AcoustID) lleva todo a 11.025
   Hz, dejavu fija 44.100. Los dos FIJAN la frecuencia antes de mirar nada.
--------------------------------------------------------------------------- */
seccion("La misma regla en todos los telefonos");

await prueba("el muestreo esta fijado, no lo pone el telefono", () => {
  afirmar(M.FP.RATE > 0, "no hay una frecuencia fija a la que llevar el audio");
  afirmar(/sampleRate: FP\.RATE/.test(FUENTE),
    "no se le pide al navegador esa frecuencia: cada telefono usaria la suya");
});

await prueba("cada casilla mide lo mismo que siempre", () => {
  /* Esta es la prueba que protege las canciones ya grabadas. Se cambio el
     muestreo de 44.100 a 11.025, pero tambien la ventana, de 2048 a 512: las
     dos cuentas dan los mismos 21,533 Hz por casilla. Si alguien tocara una
     sola de las dos, las huellas viejas dejarian de coincidir y habria que
     regrabar el catalogo entero. */
  cerca(M.FP.RATE / M.FP.FFT, M.FP.BINHZ, 0.001,
    "la casilla ya no mide lo mismo: las canciones grabadas dejan de valer");
  cerca(M.FP.BINHZ, 44100 / 2048, 0.001,
    "se cambio el ancho de casilla de siempre");
});

await prueba("la ventana dura lo mismo que antes", () => {
  /* 512 muestras a 11.025 Hz son los mismos 46 ms que 2048 a 44.100. Si
     durara otra cosa, se veria otro trozo de musica en cada golpe. */
  const antes = 2048 / 44100, ahora = M.FP.FFT / M.FP.RATE;
  cerca(ahora, antes, 0.0005, "la ventana pasó de " + (antes*1000).toFixed(1) +
        " ms a " + (ahora*1000).toFixed(1) + " ms");
});

await prueba("si el navegador no da la frecuencia, se busca la ventana que mas se acerque", () => {
  igual(M.ventanaPara(11025), 512, "con la frecuencia buena no eligió 512");
  igual(M.ventanaPara(44100), 2048, "a 44.100 no vuelve a la ventana de siempre");
  igual(M.ventanaPara(48000), 2048, "a 48.000 eligió una ventana rara");
  for (const rate of [8000, 11025, 16000, 22050, 32000, 44100, 48000, 96000]) {
    const n = M.ventanaPara(rate);
    igual(Math.log2(n) % 1, 0, "la ventana no es potencia de dos con " + rate);
    afirmar(n >= 256 && n <= 32768, "ventana absurda con " + rate + ": " + n);
  }
});

await prueba("las casillas que se miran caben en la huella", () => {
  /* La huella empaqueta la casilla partida por dos en ocho bits: si se pasara
     de 511, dos notas distintas acabarian con el mismo numero. */
  afirmar(M.FP.MAXBIN < 512, "las casillas no caben en la huella");
  const casillas = M.FP.FFT / 2;
  afirmar(M.FP.MAXBIN <= casillas,
    `se miran ${M.FP.MAXBIN} casillas y el espectro solo tiene ${casillas}`);
  igual(M.FP.BANDS[M.FP.BANDS.length - 1], M.FP.MAXBIN,
    "las bandas no terminan donde termina lo que se mira");
});

await prueba("con la frecuencia fija se sigue llegando a los 5 kHz", () => {
  const techo = M.FP.RATE / 2;
  const mira = M.FP.MAXBIN * M.FP.BINHZ;
  afirmar(mira <= techo,
    `se miran ${Math.round(mira)} Hz y a ${M.FP.RATE} Hz solo hay hasta ${techo}`);
  afirmar(mira > 4500, "se dejó de mirar la parte alta: solo llega a " + Math.round(mira));
});

/* Sin esto, un fallo se veia en rojo por pantalla pero el archivo terminaba
   diciendo que todo habia ido bien: correr.sh no tenia como enterarse y
   remataba con "Todo en orden". Una prueba que falla sin que nadie se entere
   es peor que no tenerla. */
process.exit(resumen());
