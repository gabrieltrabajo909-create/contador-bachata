/* Pruebas del reconocedor: la pieza de la que depende todo lo demas.
   Si esto falla, la app le marca al alumno el tiempo equivocado, que es el
   peor error posible: le ensena mal y encima con seguridad. */

import { cargar, FUENTE } from "./extraer.mjs";
import { seccion, prueba, afirmar, igual, cerca, azar, resumen } from "./marco.mjs";

const M = await cargar([
  "FP", "packHash", "Fingerprinter", "Matcher",
  "countAt", "nearestOne", "BANDS", "judge",
  "toB64", "fromB64", "RALO", "huellaRala", "Listener", "ventanaPara",
  "fftEnSitio", "espectroDe", "OBRERO", "ventanas", "ventanaDe"
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

await prueba("se normaliza a la cuadricula que YA tiene el catalogo", () => {
  /* Fijar la frecuencia es lo correcto: si cada telefono mide con su regla,
     una cancion grabada en uno no se reconoce en otro. Eso costo que el
     telefono barato no funcionara nunca.

     Pero el numero al que se fija NO es libre. Se probo 11.025 Hz, que es lo
     que usa Chromaprint, y fue un desastre: las canciones ya grabadas estaban
     medidas en la cuadricula del aparato que las grabo (48.000 Hz, casillas de
     23,44 Hz) y quedaron fuera de juego. El telefono de Gabriel, que
     funcionaba, dejo de funcionar.

     Al normalizar se normaliza a lo que YA EXISTE. Por eso 48.000: es donde
     esta el catalogo. Cambiar este numero tira a la basura todo lo grabado, y
     esta prueba esta aqui para que quien lo intente se entere antes. */
  igual(M.FP.RATE, 48000, "se cambio la frecuencia: el catalogo entero deja de valer");
  igual(M.FP.FFT, 2048, "se cambio la ventana: el catalogo entero deja de valer");
  cerca(M.FP.RATE / M.FP.FFT, M.FP.BINHZ, 1e-9, "la casilla no mide lo que dice");
  cerca(M.FP.BINHZ, 23.4375, 1e-6,
    "las canciones grabadas tienen casillas de 23,4375 Hz y esto dice otra cosa");
  afirmar(/sampleRate: FP\.RATE/.test(FUENTE),
    "no se le pide esa frecuencia al navegador: cada telefono volveria a su regla");
});

await prueba("si el navegador no da esa frecuencia, se sigue igual", () => {
  /* Nunca peor que no arrancar: se usa la del aparato y el panel lo dice en
     rojo. Reconocera solo lo grabado en ese mismo telefono, que es como
     estaba antes. */
  const clase = /class Listener \{[\s\S]*?\n  \}/.exec(FUENTE);
  afirmar(clase, "no encuentro la clase que escucha");
  afirmar(/catch \(e\) \{\s*this\.ctx = new Audio\(\);/.test(FUENTE),
    "si el navegador rechaza la frecuencia, la app se cae en vez de seguir");
  afirmar(/!== FP\.RATE\) \{[\s\S]{0,120}new Audio\(\)/.test(FUENTE),
    "no se comprueba que el navegador haya dado de verdad la frecuencia pedida");
});

await prueba("cada casilla mide lo mismo sea cual sea el aparato", () => {
  /* Lo que tiene que coincidir entre quien grabo y quien escucha no es la
     frecuencia: es cuantos hercios mide cada casilla del espectro. Por eso la
     ventana se elige a partir de la frecuencia que haya. */
  for (const rate of [11025, 22050, 44100, 48000, 96000]) {
    const ancho = rate / M.ventanaPara(rate);
    const error = Math.abs(ancho - M.FP.BINHZ) / M.FP.BINHZ;
    afirmar(error < 0.12,
      `a ${rate} Hz la casilla mide ${ancho.toFixed(2)} Hz y deberia medir ${M.FP.BINHZ.toFixed(2)}`);
  }
  cerca(M.FP.RATE / M.ventanaPara(M.FP.RATE), M.FP.BINHZ, 1e-9,
    "a la frecuencia del catalogo no sale el ancho de casilla del catalogo");
});

await prueba("el paso entre frames es el que llevan dentro las canciones", () => {
  /* Las canciones guardadas tienen sus frames contados con este numero. Si se
     cambiara, los frames de quien escucha avanzarian a otro ritmo que los de
     quien grabo, y las parejas ya no caerian a la misma distancia. */
  cerca(M.FP.HOP, 0.0464, 1e-9,
    "se cambio el paso entre frames: las canciones guardadas dejan de valer");
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

/* ---------------------------------------------------------------------------
   El espectro calculado en casa

   Se dejo de preguntarle el espectro al navegador porque esa pregunta la hace
   el hilo que dibuja la pantalla, y cuando ese hilo se atasca el audio de esos
   momentos se pierde: 6,6 frames por segundo de los 21,6, medido en el
   telefono de Gabriel con el microfono funcionando perfectamente.

   Ahora las muestras las empuja el hilo del audio y la cuenta se hace aqui. Lo
   que estas pruebas protegen es que la cuenta de EXACTAMENTE lo mismo que daba
   el navegador: si no, las canciones ya grabadas dejan de reconocerse.
--------------------------------------------------------------------------- */
seccion("El espectro calculado en casa");

/* Transformada lenta y directa, escrita aparte y de la forma mas tonta
   posible. Sirve de juez: si la rapida se desvia de esta, la rapida esta mal. */
function dftLenta(x) {
  const N = x.length, out = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const a = -2 * Math.PI * k * n / N;
      re += x[n] * Math.cos(a);
      im += x[n] * Math.sin(a);
    }
    out[k] = Math.sqrt(re * re + im * im) / N;
  }
  return out;
}

await prueba("la transformada rapida da lo mismo que la lenta", () => {
  const N = M.FP.FFT;
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    x[i] = 0.5 * Math.sin(2 * Math.PI * 46 * i / N)
         + 0.25 * Math.sin(2 * Math.PI * 100 * i / N)
         + 0.1 * Math.cos(2 * Math.PI * 7 * i / N);
  }
  const lenta = dftLenta(x);
  const re = Float64Array.from(x), im = new Float64Array(N);
  M.fftEnSitio(re, im);
  for (let k = 0; k < N / 2; k++) {
    const rapida = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N;
    cerca(rapida, lenta[k], 1e-9, "la casilla " + k + " no coincide con la cuenta lenta");
  }
});

await prueba("un tono cae en su casilla y en ninguna otra", () => {
  const N = M.FP.FFT;
  for (const casilla of [10, 46, 100, 200]) {
    const bloque = new Float32Array(N);
    for (let i = 0; i < N; i++) bloque[i] = Math.sin(2 * Math.PI * casilla * i / N);
    const spec = new Float32Array(N / 2);
    M.espectroDe(bloque, new Float64Array(N), new Float64Array(N), spec);
    let mejor = -Infinity, donde = -1;
    for (let i = 0; i < N / 2; i++) if (spec[i] > mejor) { mejor = spec[i]; donde = i; }
    igual(donde, casilla, "un tono de la casilla " + casilla + " salio en la " + donde);
  }
});

await prueba("la ventana es la misma que aplica el navegador", () => {
  /* Blackman: la que dice la norma. Si se cambiara por otra, los picos se
     moverian y las huellas viejas dejarian de coincidir. Comprobado en el
     navegador contra su AnalyserNode: -19,58 / -25,60 / -33,56 dB, identicos. */
  const N = M.FP.FFT;
  const VENTANA = M.ventanaDe(N);
  igual(VENTANA.length, N, "la ventana no mide lo que la transformada");
  for (const i of [0, 1, 37, N / 2, N - 1]) {
    const esperado = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / N)
                          + 0.08 * Math.cos(4 * Math.PI * i / N);
    cerca(VENTANA[i], esperado, 1e-6, "la ventana no es Blackman en " + i);
  }
  cerca(VENTANA[N / 2], 1, 0.001, "la ventana no vale 1 en el centro");
  afirmar(VENTANA[0] < 0.01, "la ventana no cierra en los extremos");
});

await prueba("el silencio no inventa picos ni numeros imposibles", () => {
  const N = M.FP.FFT;
  const spec = new Float32Array(N / 2);
  M.espectroDe(new Float32Array(N), new Float64Array(N), new Float64Array(N), spec);
  for (let i = 0; i < N / 2; i++) {
    afirmar(Number.isFinite(spec[i]), "salio un numero imposible en la casilla " + i);
    afirmar(spec[i] <= -180, "el silencio da " + spec[i] + " dB en la casilla " + i);
  }
});

await prueba("el volumen mueve todo el espectro por igual, no los picos", () => {
  /* Un microfono mas caliente que otro no puede cambiar QUE casilla gana. */
  const N = M.FP.FFT;
  const base = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    base[i] = 0.3 * Math.sin(2 * Math.PI * 46 * i / N)
            + 0.2 * Math.sin(2 * Math.PI * 130 * i / N);
  }
  const pico = (mult) => {
    const b = Float32Array.from(base, v => v * mult);
    const spec = new Float32Array(N / 2);
    M.espectroDe(b, new Float64Array(N), new Float64Array(N), spec);
    let mejor = -Infinity, donde = -1;
    for (let i = 0; i < N / 2; i++) if (spec[i] > mejor) { mejor = spec[i]; donde = i; }
    return { donde, mejor };
  };
  const flojo = pico(0.05), fuerte = pico(4);
  igual(flojo.donde, fuerte.donde, "al subir el volumen cambio la casilla ganadora");
  cerca(fuerte.mejor - flojo.mejor, 20 * Math.log10(4 / 0.05), 0.01,
    "la diferencia en decibelios no es la que toca");
});

/* ---------------------------------------------------------------------------
   El obrero, corriendo de verdad

   Aqui esta la pieza que hace que la app sirva para VEINTE telefonos y no para
   uno. Los profesores van a grabar con teléfonos de 44.100, de 48.000, de lo
   que sea; los alumnos van a escuchar con otros distintos. Si cada uno mide
   con su regla, nada se reconoce entre si: eso costo que el telefono de prueba
   no funcionara nunca.

   El obrero convierte lo que le den a la frecuencia del catalogo. Estas
   pruebas lo hacen correr de verdad, no leen su texto: se le da un tono
   conocido a una frecuencia y se comprueba que sale a la otra, sin costuras y
   sin perder muestras en el cruce entre bloques.
--------------------------------------------------------------------------- */

/* Se le montan alrededor las dos cosas que el navegador le da y Node no. */
function montarObrero(razon, tam, paso) {
  let Clase = null;
  const registrar = (nombre, c) => { Clase = c; };
  const Base = class { constructor() { this.port = { postMessage: null }; } };
  new Function("AudioWorkletProcessor", "registerProcessor", M.OBRERO)(Base, registrar);
  afirmar(Clase, "el obrero no se registro");
  const o = new Clase({ processorOptions: { tam, paso, razon } });
  const salidas = [];
  o.port.postMessage = (b) => salidas.push(b);
  return { o, salidas };
}

await prueba("el obrero convierte a la frecuencia del catalogo", () => {
  /* Un aparato de 44.100 entregando 44.100 muestras (un segundo). A la salida
     tienen que aparecer las ventanas que tocan a 48.000. */
  const DE = 44100, A = M.FP.RATE, tam = M.FP.FFT, paso = Math.round(M.FP.HOP * A);
  const { o, salidas } = montarObrero(DE / A, tam, paso);
  const bloque = new Float32Array(128);
  let fase = 0;
  for (let b = 0; b < Math.floor(DE / 128); b++) {
    for (let i = 0; i < 128; i++) { bloque[i] = Math.sin(2 * Math.PI * fase); fase += 1000 / DE; }
    o.process([[bloque]]);
  }
  /* Un segundo de audio son A muestras convertidas; a una ventana cada `paso`,
     salen A/paso ventanas. Se admite una de margen por los bordes. */
  const esperadas = Math.floor(A / paso);
  afirmar(Math.abs(salidas.length - esperadas) <= 1,
    `salieron ${salidas.length} ventanas y tenian que salir ${esperadas}`);
  for (const v of salidas) igual(v.length, tam, "una ventana salio de otro tamano");
});

await prueba("el tono sale donde tiene que salir despues de convertir", () => {
  /* La prueba de verdad: se mete un tono de 1000 Hz muestreado a 44.100 y, tras
     convertir, tiene que caer en la casilla que le toca a 1000 Hz en la
     cuadricula del catalogo. Si la conversion estuviera mal, el tono se
     correria de casilla y ninguna cancion coincidiria: exactamente el fallo que
     dejaba fuera al telefono de prueba. */
  const DE = 44100, A = M.FP.RATE, tam = M.FP.FFT, paso = Math.round(M.FP.HOP * A);
  const { o, salidas } = montarObrero(DE / A, tam, paso);
  const bloque = new Float32Array(128);
  let fase = 0;
  for (let b = 0; b < 700; b++) {
    for (let i = 0; i < 128; i++) { bloque[i] = Math.sin(2 * Math.PI * fase); fase += 1000 / DE; }
    o.process([[bloque]]);
  }
  afirmar(salidas.length > 2, "no salio ninguna ventana");
  const spec = new Float32Array(tam / 2);
  M.espectroDe(salidas[salidas.length - 1], new Float64Array(tam), new Float64Array(tam), spec);
  let mejor = -Infinity, donde = -1;
  for (let i = 0; i < tam / 2; i++) if (spec[i] > mejor) { mejor = spec[i]; donde = i; }
  const debia = Math.round(1000 / M.FP.BINHZ);
  afirmar(Math.abs(donde - debia) <= 1,
    `1000 Hz cayo en la casilla ${donde} y en esta cuadricula le toca la ${debia}`);
});

await prueba("sin conversion que hacer, no toca nada", () => {
  /* Cuando el aparato ya trabaja en la cuadricula del catalogo, la razon es 1 y
     las muestras tienen que salir tal cual entraron. */
  const tam = 64, paso = 64;
  const { o, salidas } = montarObrero(1, tam, paso);
  const bloque = new Float32Array(128);
  for (let i = 0; i < 128; i++) bloque[i] = i / 128;
  o.process([[bloque]]);
  o.process([[bloque]]);
  afirmar(salidas.length >= 2, "no salio nada");
  const v = salidas[0];
  for (let i = 0; i < tam; i++) {
    cerca(v[i], bloque[i], 1e-6, "la muestra " + i + " cambio sin hacer falta");
  }
});

await prueba("el cruce entre bloques no deja huecos", () => {
  /* El navegador entrega el audio de a 128 muestras. Si en cada costura se
     perdiera o repitiera una, serian 170 costuras por segundo: un chirrido
     constante metido en la huella. Se comprueba con una rampa, donde cualquier
     salto se ve. */
  const tam = 256, paso = 256;
  const { o, salidas } = montarObrero(1, tam, paso);
  const bloque = new Float32Array(128);
  let v = 0;
  for (let b = 0; b < 8; b++) {
    for (let i = 0; i < 128; i++) bloque[i] = v++;
    o.process([[bloque]]);
  }
  afirmar(salidas.length >= 2, "no salieron ventanas");
  const s = salidas[1];
  for (let i = 1; i < s.length; i++) {
    cerca(s[i] - s[i - 1], 1, 1e-6,
      "hay un salto en la muestra " + i + ": se perdio o se repitio audio");
  }
});

await prueba("el obrero no toca nada que en el hilo del audio no exista", () => {
  afirmar(!/console\.|document|window|localStorage/.test(M.OBRERO),
    "el obrero usa cosas que en el hilo del audio no existen");
  afirmar(/return true/.test(M.OBRERO), "el obrero se apaga solo");
});

/* ---------------------------------------------------------------------------
   Un telefono graba, otro escucha

   El encargo de Gabriel, palabra por palabra: los profesores van a grabar con
   teléfonos distintos y los alumnos van a escuchar con otros distintos, y
   tiene que andar para todos.

   Esta prueba monta la cadena entera -el obrero del hilo de audio convirtiendo
   la frecuencia, el espectro, la huella, los desfases y el reconocedor- y hace
   grabar a un telefono y escuchar a otro. Es lenta comparada con las demas y
   vale lo que cuesta: es la unica que cubre el fallo que tuvo la app rota tres
   dias, y ningun trozo por separado lo habria detectado.
--------------------------------------------------------------------------- */
seccion("Un telefono graba, otro escucha");

const TAM_T = M.FP.FFT;
const reT = new Float64Array(TAM_T), imT = new Float64Array(TAM_T);
const specT = new Float32Array(TAM_T / 2);

function obrero(razon, paso) {
  let C = null;
  const Base = class { constructor() { this.port = { postMessage: null }; } };
  new Function("AudioWorkletProcessor", "registerProcessor", M.OBRERO)(Base, (n, c) => { C = c; });
  const o = new C({ processorOptions: { tam: TAM_T, paso, razon } });
  const out = [];
  o.port.postMessage = b => out.push(b);
  return { o, out };
}

/* La musica existe en el aire; cada telefono la muestrea a SU frecuencia.
   Todo por debajo de 4 kHz: por encima cada frecuencia pliega distinto, y eso
   seria un fallo del banco de pruebas, no de la app. Ya me paso. */
function enElAire(semilla) {
  let s = semilla;
  const azar = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const ac = Array.from({ length: 16 }, () =>
    Array.from({ length: 4 }, () => 110 * Math.pow(2, Math.floor(azar() * 24) / 12)));
  const golpe = [180, 420, 900, 1900, 3300].map((f, i) => [f, 0.3 / (i + 1)]);
  return (tt) => {
    const a = ac[Math.floor(tt * 2) % ac.length];
    let v = 0;
    for (const f of a) v += Math.sin(2 * Math.PI * f * tt) * 0.3 + Math.sin(2 * Math.PI * f * 2 * tt) * 0.12;
    const d = tt % 0.5;
    if (d < 0.08) for (const [f, g] of golpe) v += g * Math.exp(-d * 45) * Math.sin(2 * Math.PI * f * tt);
    return v * 0.2;
  };
}

function oir(fn, rate, desde, seg, desfases) {
  const paso = (M.FP.HOP * M.FP.RATE) / desfases;
  const { o, out } = obrero(rate / M.FP.RATE, paso);
  const bloque = new Float32Array(128);
  const total = Math.round(seg * rate);
  let i = 0;
  while (i < total) {
    for (let k = 0; k < 128; k++, i++) bloque[k] = fn(desde + i / rate);
    o.process([[bloque]]);
  }
  const fps = Array.from({ length: desfases }, () => new M.Fingerprinter());
  out.forEach((b, v) => {
    M.espectroDe(b, reT, imT, specT);
    fps[v % desfases].push(specT, Math.floor(v / desfases));
  });
  return fps.map(f => f.result());
}

function buscar(m, fn, rate, desde) {
  let mejor = null;
  for (const q of oir(fn, rate, desde, 4, M.FP.SUBS)) {
    const r = m.match(q.keys, q.times);
    if (r && (!mejor || r.score > mejor.score)) mejor = r;
  }
  return mejor;
}

await prueba("lo grabado en un telefono se reconoce en otro", () => {
  /* Aqui estuvo el fallo que costo tres dias. El telefono de Gabriel graba a
     48.000 y el de prueba escucha a 44.100: antes eran dos reglas distintas
     midiendo lo mismo y no coincidia nada, con el microfono perfecto. */
  for (const [graba, escucha] of [[48000, 44100], [44100, 48000], [22050, 48000]]) {
    const cancs = [1, 2, 3].map(k => ({ id: "c" + k, fn: enElAire(k * 13) }));
    const m = new M.Matcher();
    for (const c of cancs) m.add({ id: c.id, fp: oir(c.fn, graba, 0, 12, 1)[0] });
    const r = buscar(m, cancs[1].fn, escucha, 5.13);
    afirmar(r && r.songId === "c2",
      `grabado a ${graba} y escuchado a ${escucha}: ` +
      (r ? "dijo que era " + r.songId : "no lo reconocio"));
  }
});

await prueba("la frecuencia de quien graba deja de importar", () => {
  /* La huella de la misma musica tiene que salir igual la grabe el telefono
     que la grabe. Si no, cada profesor crearia un catalogo que solo el puede
     usar. */
  const fn = enElAire(77);
  const huellas = [22050, 44100, 48000].map(r => oir(fn, r, 0, 6, 1)[0]);
  const cuantas = huellas.map(h => h.keys.length);
  for (const n of cuantas) {
    afirmar(Math.abs(n - cuantas[0]) <= cuantas[0] * 0.1,
      "salen huellas de tamanos muy distintos segun la frecuencia: " + cuantas.join(", "));
  }
});

await prueba("no dice conocer una cancion que nadie grabo", () => {
  /* El error que no se puede cometer: marcarle al alumno el tiempo de otra
     cancion. Vale mucho mas callarse. */
  const cancs = [1, 2, 3, 4].map(k => ({ id: "c" + k, fn: enElAire(k * 13) }));
  const m = new M.Matcher();
  for (const c of cancs) m.add({ id: c.id, fp: oir(c.fn, 48000, 0, 12, 1)[0] });
  for (const semilla of [101, 202, 303]) {
    const r = buscar(m, enElAire(semilla), 44100, 4.4);
    igual(r, null, "invento que conocia una cancion que no esta en el catalogo");
  }
});

await prueba("se escucha hasta 20 s antes de rendirse", () => {
  /* Medido, grabando en un telefono y escuchando en otro desde doce puntos:
     con 4 s reconoce 3 de 12; con 12 s, 8; con 16 s, 11; con 20 s, 12 de 12.
     Y con canciones que NO estan en el catalogo inventa 0 de 6 con 12, con 20
     y con 25 segundos: juntar mas prueba no la vuelve mas confiada, porque el
     criterio para aceptar no se toca. */
  const f = /const ventana = ([\s\S]*?);/.exec(FUENTE);
  afirmar(f, "no encuentro la escalera de ventanas");
  const numeros = (f[1].match(/\d+/g) || []).map(Number);
  afirmar(Math.max(...numeros) >= 20,
    "se rinde antes de los 20 s, que es donde deja de mejorar");
});

await prueba("no se guardan huellas que ya no se van a mirar", () => {
  /* Se guardaba todo desde que se tocaba Escuchar y se copiaba entero en cada
     busqueda; con tres desfases, por triplicado. En una clase larga eso es
     mucho trabajo inutil, y justo en los telefonos que menos pueden. */
  afirmar(/podar\(/.test(FUENTE), "nada tira las huellas viejas");
  /* Y que NO se corte por delante sin mirar: los tiempos no entran en orden
     estricto, porque cada frame se empareja con varios anteriores a distancias
     distintas. Cortar por el primero que pasa el corte dejaba huellas viejas
     escondidas mas adelante; lo encontro la comprobacion de abajo. */
  const p = /podar\(desdeFrame\)[\s\S]*?\n  \}/.exec(FUENTE);
  afirmar(p, "no encuentro la poda");
  afirmar(!/splice\(0,/.test(p[0]),
    "la poda vuelve a cortar por delante, y los tiempos no vienen ordenados");
  const fp = new M.Fingerprinter();
  for (let f = 0; f < 200; f++) fp.push(Float32Array.from({length: M.FP.FFT/2}, (_, i) => -60 + (i % 7)), f);
  const antes = fp.result().keys.length;
  fp.podar(150);
  const despues = fp.result().keys.length;
  afirmar(despues < antes, "podar no quito nada");
  const { times } = fp.result();
  for (const t of times) afirmar(t >= 150, "quedaron huellas mas viejas que el corte");
});

await prueba("podar no toca lo que todavia se mira", () => {
  const fp = new M.Fingerprinter();
  const espectro = (n) => Float32Array.from({length: M.FP.FFT/2}, (_, i) => -60 + ((i * n) % 11));
  for (let f = 0; f < 200; f++) fp.push(espectro(f), f);
  const enteras = fp.result();
  const quedan = [...enteras.times].filter(t => t >= 100).length;
  fp.podar(100);
  igual(fp.result().times.length, quedan,
    "podar se llevo huellas que la busqueda todavia necesitaba");
});

await prueba("el limite de destacar deja margen sobre donde empieza a inventar", () => {
  /* Calibrado con 72 intentos de canciones guardadas y 54 de canciones que no
     estan: a 5,5 ya inventaba 3 veces; a 6 y a 7, ninguna. Estaba en 7 y
     rechazaba coincidencias con tres mil votos. Se bajo a 6: un escalon por
     encima del punto donde empieza a fallar. */
  const S = /const SOBRESALE = ([\d.]+)/.exec(FUENTE);
  afirmar(S, "no encuentro el limite de destacar");
  const v = Number(S[1]);
  afirmar(v >= 6, "por debajo de 6 la app empieza a decir que conoce lo que no");
  afirmar(v <= 7, "por encima de 7 rechaza coincidencias buenisimas");
});

/* Sin esto, un fallo se veia en rojo por pantalla pero el archivo terminaba
   diciendo que todo habia ido bien: correr.sh no tenia como enterarse y
   remataba con "Todo en orden". Una prueba que falla sin que nadie se entere
   es peor que no tenerla. */
process.exit(resumen());
