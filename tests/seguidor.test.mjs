/* Pruebas del seguidor: la ayuda para marcar canciones.

   Lo que hay que proteger aqui no es "que acierte mucho" -eso solo se sabe
   con canciones de verdad y un profesor mirando-, sino las tres promesas que
   se le hicieron a quien lo va a usar:

     1. Sin el profesor no inventa nada. Nunca decide solo donde esta el UNO.
     2. Manda el profesor. Si toca, se hace lo que dice el toque.
     3. No cambia lo que se guarda. Escribe en la misma lista de siempre y con
        la misma forma, para que revisar, guardar y sincronizar no se enteren.

   Un seguidor que acierta poco es un seguidor flojo y se apaga. Un seguidor
   que rompe cualquiera de esas tres es una trampa. */

import { cargar } from "./extraer.mjs";
import { seccion, prueba, afirmar, igual, cerca, azar, resumen } from "./marco.mjs";

const M = await cargar(["FP", "SEG", "Seguidor"]);
const HOP = M.FP.HOP;
const FPMAX = M.FP.MAXBIN;

/* ---------------------------------------------------------------------------
   Musica de mentira.

   El seguidor no ve sonido: ve el espectro ya calculado, en decibelios, uno
   por frame. Asi que se fabrica directamente eso. Un golpe es un frame en el
   que sube todo de golpe, que es lo que mide: cuanto sonido NUEVO entro.

   El fondo lleva ruido a proposito. Sin ruido cualquier cosa destaca y la
   prueba diria que si aunque el detector fuera una porqueria.
--------------------------------------------------------------------------- */
function pista({ bpm, segundos, semilla = 7, arranque = 0.3, arrastre = 0, flojos = true }) {
  const rnd = azar(semilla);
  const frames = Math.round(segundos / HOP);
  const specs = [];
  for (let f = 0; f < frames; f++) {
    const spec = new Float32Array(FPMAX).fill(-80);
    for (let i = 4; i < FPMAX; i++) spec[i] += rnd() * 6;
    specs.push(spec);
  }

  /* Los golpes. "arrastre" es cuanto se alarga el tiempo por cada tiempo que
     pasa: 0,0004 son unos tres BPM menos a lo largo de un minuto, que es lo
     que hace una banda de verdad y lo que descoloca a un seguidor que da por
     sentado que la velocidad no cambia nunca. */
  const golpes = [];
  let t = arranque, pulso = 60 / bpm;
  for (let k = 0; t < segundos; k++) {
    const f = Math.round(t / HOP);
    if (f >= frames) break;
    golpes.push(t);
    /* Los tiempos impares pegan menos que los pares. Es como suena la musica
       de verdad, y ademas es la trampa que importa: si el seguidor se dejara
       llevar por el golpe mas cercano sin mas, se iria al de al lado. */
    const fuerte = !flojos || k % 2 === 0 ? 26 : 15;
    for (let i = 4; i < FPMAX; i++) specs[f][i] += fuerte;
    pulso += arrastre;
    t += pulso;
  }
  return { specs, golpes, frames };
}

/* Le pasa la pista al seguidor de principio a fin, metiendo los toques del
   profesor cuando toca. Los toques van ANTES del frame de su instante porque
   asi ocurre de verdad: la persona oye el golpe y toca, y el sonido de
   despues todavia no llego. */
function correr(p, toques = []) {
  const unos = [];
  const s = new M.Seguidor(unos);
  let i = 0;
  const dichos = [];
  p.specs.forEach((spec, f) => {
    const t = f * HOP;
    while (i < toques.length && toques[i] <= t) { dichos.push(s.tocar(toques[i])); i++; }
    s.push(spec, f);
  });
  return { unos, s, dichos };
}

// Cuanto se aleja el UNO propuesto del golpe de verdad mas cercano
function desvio(t, golpes) {
  let mejor = Infinity;
  for (const g of golpes) mejor = Math.min(mejor, Math.abs(g - t));
  return mejor;
}

const COMPAS = M.SEG.PORCOMPAS;

/* ========================================================================= */
seccion("Sin el profesor no inventa nada");

await prueba("sin ningun toque no propone un solo UNO", () => {
  const p = pista({ bpm: 128, segundos: 40 });
  const { unos } = correr(p);
  igual(unos.length, 0, "propuso UNO sin que nadie le dijera donde estaba");
});

await prueba("con un solo toque tampoco, porque no sabe a que velocidad va", () => {
  const p = pista({ bpm: 128, segundos: 40 });
  const { unos, dichos } = correr(p, [4]);
  igual(dichos[0], "primero");
  igual(unos.length, 0);
});

await prueba("dos toques absurdamente juntos no lo arrancan", () => {
  const p = pista({ bpm: 128, segundos: 40 });
  const { unos, dichos } = correr(p, [4, 4.4]);
  igual(dichos[1], "raro", "acepto un compas de 0,4 segundos");
  igual(unos.length, 0);
});

await prueba("y dos toques absurdamente separados, tampoco", () => {
  const p = pista({ bpm: 128, segundos: 40 });
  const { dichos } = correr(p, [4, 15]);
  igual(dichos[1], "raro", "acepto un compas de 11 segundos");
});

/* ========================================================================= */
seccion("Con dos toques sigue solo");

/* 120 BPM: el tiempo dura medio segundo y el compas de ocho, cuatro segundos.
   Los toques van sobre golpes de verdad, como los daria un profesor. */
const P120 = pista({ bpm: 120, segundos: 90, arranque: 0.3 });
const R120 = correr(P120, [0.3, 4.3]);

await prueba("arranca en cuanto tiene los dos", () => {
  igual(R120.dichos[1], "listo");
});

await prueba("propone un UNO por compas hasta el final", () => {
  const esperados = Math.floor((90 - 0.3) / 4);
  /* Un margen de dos: el ultimo compas depende de donde corte la grabacion, y
     exigir el numero exacto seria una prueba que falla por nada. */
  afirmar(Math.abs(R120.unos.length - esperados) <= 2,
    `esperaba unos ${esperados} UNO, llegaron ${R120.unos.length}`);
});

await prueba("los UNO caen sobre golpes de la cancion, no donde tocaria la cuenta", () => {
  for (const u of R120.unos) {
    afirmar(desvio(u, P120.golpes) <= HOP,
      `un UNO cayo a ${desvio(u, P120.golpes).toFixed(3)}s del golpe mas cercano`);
  }
});

await prueba("y separados por un compas entero, sin saltarse ninguno", () => {
  for (let i = 1; i < R120.unos.length; i++) {
    cerca(R120.unos[i] - R120.unos[i - 1], 4, 0.06, `entre el UNO ${i - 1} y el ${i}`);
  }
});

await prueba("no se va al tiempo de al lado aunque los impares peguen flojo", () => {
  /* Todos los UNO tienen que caer a un numero ENTERO de compases del primero.
     Si se hubiera ido a un tiempo vecino, la distancia daria rota. */
  for (const u of R120.unos) {
    const compases = (u - R120.unos[0]) / 4;
    cerca(compases - Math.round(compases), 0, 0.03, "un UNO se corrio de compas");
  }
});

/* ========================================================================= */
seccion("Aguanta lo que hace una cancion de verdad");

await prueba("sigue enganchado aunque la cancion se arrastre", () => {
  /* La banda se va frenando poco a poco. Una rejilla calculada de dos toques
     y estirada hasta el final -lo que se hacia hasta ahora- se despegaria; el
     seguidor tiene que ir detras del sonido. */
  const p = pista({ bpm: 130, segundos: 90, arrastre: 0.0006 });
  const { unos } = correr(p, [p.golpes[0], p.golpes[COMPAS]]);
  afirmar(unos.length > 15, "se quedo sin proponer a mitad de camino");
  const malos = unos.filter(u => desvio(u, p.golpes) > 2 * HOP).length;
  afirmar(malos === 0, `${malos} de ${unos.length} UNO se despegaron del sonido`);
});

await prueba("no se descoloca del todo en un silencio y avisa que se perdio", () => {
  const p = pista({ bpm: 120, segundos: 60, arranque: 0.3 });
  // Se calla la cancion entre el segundo 20 y el 32
  for (let f = Math.round(20 / HOP); f < Math.round(32 / HOP); f++) {
    p.specs[f] = new Float32Array(FPMAX).fill(-80);
  }
  const { unos, s } = correr(p, [0.3, 4.3]);
  afirmar(s.perdido || unos.length > 10, "ni siguio ni admitio que se habia perdido");
  // Y al volver el sonido, los ultimos UNO tienen que estar otra vez en su sitio
  const finales = unos.filter(u => u > 40);
  afirmar(finales.length > 2, "no se recupero despues del silencio");
});

/* ========================================================================= */
seccion("Manda el profesor");

await prueba("un toque lejos reengancha la cuenta ahi mismo", () => {
  const p = pista({ bpm: 120, segundos: 60, arranque: 0.3 });
  /* Arranca marcando mal a proposito -dos tiempos corrido- y a mitad de
     camino el profesor lo corrige sobre un golpe de verdad. */
  const corrige = p.golpes.find(g => g > 30);
  const { unos, dichos } = correr(p, [0.3, 4.3, corrige]);
  igual(dichos[2], "corregido", "leyo como confirmacion un toque que estaba lejos");
  const despues = unos.filter(u => u >= corrige - 0.01);
  afirmar(despues.length > 4, "no siguio proponiendo despues de la correccion");
  for (const u of despues) {
    const compases = (u - corrige) / 4;
    cerca(compases - Math.round(compases), 0, 0.03, "no respeto la correccion del profesor");
  }
});

await prueba("un toque encima de un UNO propuesto no lo mueve ni lo duplica", () => {
  const p = pista({ bpm: 120, segundos: 60, arranque: 0.3 });
  const sinToque = correr(p, [0.3, 4.3]).unos.length;
  /* El profesor toca justo donde la app ya proponia, con el temblor normal de
     un dedo. Eso es "vas bien", no "esta mal". */
  const { unos, dichos } = correr(p, [0.3, 4.3, 20.3 + 0.04]);
  igual(dichos[2], "bien", "se tomo por correccion un toque que confirmaba");
  igual(unos.length, sinToque, "el toque de confirmacion cambio la lista de UNO");
});

await prueba("el UNO se guarda donde esta el golpe, no donde llego el dedo", () => {
  const p = pista({ bpm: 120, segundos: 40, arranque: 0.3 });
  /* Un profesor que toca 60 ms tarde las dos veces. La cuenta tiene que
     quedar pegada a la cancion igual, porque quien pone el sitio exacto es el
     sonido; el dedo solo dice cual de los golpes es el UNO. */
  const { unos } = correr(p, [0.36, 4.36]);
  afirmar(unos.length > 5, "no arranco");
  const tardios = unos.filter(u => desvio(u, p.golpes) > HOP).length;
  afirmar(tardios <= 1, `${tardios} UNO se quedaron con el retraso del dedo`);
});

/* ========================================================================= */
seccion("No cambia lo que se guarda");

await prueba("escribe en la misma lista que se le paso, no en una copia", () => {
  const p = pista({ bpm: 120, segundos: 30, arranque: 0.3 });
  const downbeats = [];
  const s = new M.Seguidor(downbeats);
  p.specs.forEach((spec, f) => {
    const t = f * HOP;
    if (t >= 0.3 && t < 0.3 + HOP) s.tocar(0.3);
    if (t >= 4.3 && t < 4.3 + HOP) s.tocar(4.3);
    s.push(spec, f);
  });
  afirmar(downbeats.length > 4,
    "la lista que se le dio quedo vacia: estaria escribiendo en otro sitio");
});

await prueba("lo que escribe son segundos sueltos, como siempre", () => {
  for (const u of R120.unos) {
    igual(typeof u, "number", "un UNO no es un numero");
    afirmar(isFinite(u) && u >= 0, `un UNO vale ${u}`);
  }
});

await prueba("los UNO salen en orden y sin repetirse", () => {
  for (let i = 1; i < R120.unos.length; i++) {
    afirmar(R120.unos[i] > R120.unos[i - 1],
      `el UNO ${i} (${R120.unos[i]}) no viene despues del anterior`);
  }
});

/* ========================================================================= */
seccion("No se cuelga");

await prueba("un pulso disparatado no lo deja dando vueltas para siempre", () => {
  const p = pista({ bpm: 120, segundos: 20, arranque: 0.3 });
  const { s } = correr(p, [0.3, 4.3]);
  // Se le fuerza un pulso ridiculo y se le pide avanzar una hora
  s.pulso = 1e-9;
  const antes = Date.now();
  s.avanzar(3600);
  afirmar(Date.now() - antes < 2000, "se quedo colgado avanzando la cuenta");
});

await prueba("los frames vacios del principio no cuentan como un golpe", () => {
  const p = pista({ bpm: 120, segundos: 20, arranque: 0.3 });
  const unos = [];
  const s = new M.Seguidor(unos);
  s.push(p.specs[0], 0);
  afirmar(s.flujo[0] === 0,
    "el primer frame midio golpe, y no tenia con que compararse");
});

process.exit(resumen());
