/* Pruebas de la cuenta y de la valoracion del juego.

   Aqui se decide que numero ve el alumno en pantalla. Un error de un tiempo
   no se nota leyendo el codigo pero se nota bailando. */

import { cargar } from "./extraer.mjs";
import { seccion, prueba, afirmar, igual, cerca, resumen } from "./marco.mjs";

const M = await cargar(["countAt", "nearestOne", "BANDS", "judge", "isOne", "isTap"]);

/* Un compas de bachata dura 8 tiempos. Con los "unos" cada 2 segundos, cada
   tiempo dura un cuarto de segundo. */
const DOS_SEG = [0, 2, 4, 6, 8, 10];

seccion("En que tiempo va");

await prueba("justo en el uno da el tiempo 1", () => {
  for (const golpe of DOS_SEG.slice(0, 5)) {
    const c = M.countAt(DOS_SEG, golpe + 0.001);
    afirmar(c, "no devolvio nada en " + golpe);
    igual(c.index, 0, "no marco el uno en el segundo " + golpe);
  }
});

await prueba("recorre los ocho tiempos en orden", () => {
  const vistos = [];
  for (let k = 0; k < 8; k++) {
    // mitad de cada tiempo, para no caer en el borde
    const c = M.countAt(DOS_SEG, 0 + k * 0.25 + 0.125);
    vistos.push(c.index);
  }
  igual(vistos.join(","), "0,1,2,3,4,5,6,7", "los tiempos no van en orden");
});

await prueba("vuelve a empezar en el compas siguiente", () => {
  igual(M.countAt(DOS_SEG, 2.125).index, 0, "no reinicio en el compas 2");
  igual(M.countAt(DOS_SEG, 4.375).index, 1, "se desincronizo en el compas 3");
});

await prueba("mide bien la duracion del compas", () => {
  cerca(M.countAt(DOS_SEG, 3).period, 2, 0.001, "el compas no dura lo que deberia");
});

await prueba("sigue contando despues del ultimo golpe marcado", () => {
  // El profesor marco hasta el segundo 10; la cancion sigue.
  const c = M.countAt(DOS_SEG, 14.125);
  afirmar(c, "se rindio al pasar la ultima marca");
  igual(c.index, 0, "al extrapolar perdio el uno");
  const d = M.countAt(DOS_SEG, 15.125);
  igual(d.index, 4, "al extrapolar se desfaso");
});

await prueba("cuenta bien antes del primer golpe marcado", () => {
  const c = M.countAt(DOS_SEG, -1.875);
  afirmar(c, "no supo que hacer antes de la primera marca");
  igual(c.index, 0, "antes del primer golpe pierde el uno");
});

await prueba("con marcas absurdas no inventa", () => {
  igual(M.countAt([], 1), null, "conto sin marcas");
  igual(M.countAt([5], 1), null, "conto con una sola marca");
  // Compases imposibles: 50 ms y 30 segundos
  igual(M.countAt([0, 0.05, 0.1], 0.07), null, "acepto un compas de 50 ms");
  igual(M.countAt([0, 30, 60], 15), null, "acepto un compas de 30 s");
});

await prueba("aguanta que el profesor no marque parejo", () => {
  // Marcas humanas: nunca caen clavadas
  const humano = [0, 1.98, 4.03, 5.99, 8.05];
  for (let i = 0; i < humano.length - 1; i++) {
    const c = M.countAt(humano, humano[i] + 0.01);
    igual(c.index, 0, "perdio el uno en la marca " + i);
  }
});

/* ------------------------------------------------------------------------ */
seccion("El uno mas cercano (el juego)");

await prueba("clavarlo da error cero", () => {
  const r = M.nearestOne(DOS_SEG, 4);
  cerca(r.err, 0, 0.0001, "clavado no da cero");
});

await prueba("adelantarse da negativo y atrasarse positivo", () => {
  afirmar(M.nearestOne(DOS_SEG, 3.9).err < 0, "adelantarse deberia ser negativo");
  afirmar(M.nearestOne(DOS_SEG, 4.1).err > 0, "atrasarse deberia ser positivo");
  cerca(M.nearestOne(DOS_SEG, 3.9).err, -0.1, 0.0001);
  cerca(M.nearestOne(DOS_SEG, 4.1).err, 0.1, 0.0001);
});

await prueba("se compara con el uno mas cercano, no con el primero", () => {
  // A 5.9 s el uno mas cercano es el del segundo 6, no el del 4
  cerca(M.nearestOne(DOS_SEG, 5.9).err, -0.1, 0.0001,
    "se comparo con un uno lejano");
});

await prueba("el error nunca pasa de medio compas", () => {
  for (let t = 0; t < 12; t += 0.07) {
    const r = M.nearestOne(DOS_SEG, t);
    afirmar(Math.abs(r.err) <= 1.0001,
      `en t=${t.toFixed(2)} el error fue ${r.err.toFixed(3)}, mas de medio compas`);
  }
});

await prueba("tambien juzga fuera del tramo marcado", () => {
  const antes = M.nearestOne(DOS_SEG, -4.05);
  cerca(antes.err, -0.05, 0.0001, "antes del principio calcula mal");
  const despues = M.nearestOne(DOS_SEG, 16.05);
  cerca(despues.err, 0.05, 0.0001, "despues del final calcula mal");
});

await prueba("sin marcas suficientes no juzga", () => {
  igual(M.nearestOne([], 1), null);
  igual(M.nearestOne([3], 1), null);
  igual(M.nearestOne(null, 1), null);
});

/* ------------------------------------------------------------------------ */
seccion("La nota del golpe");

await prueba("las bandas van de mejor a peor y la ultima lo abarca todo", () => {
  const maximos = M.BANDS.map(b => b.max);
  for (let i = 1; i < maximos.length; i++) {
    afirmar(maximos[i] > maximos[i - 1], "las bandas no van de menor a mayor");
  }
  igual(maximos[maximos.length - 1], Infinity, "la ultima banda deja huecos");
  const puntos = M.BANDS.map(b => b.pts);
  for (let i = 1; i < puntos.length; i++) {
    afirmar(puntos[i] < puntos[i - 1], "peor precision deberia dar menos puntos");
  }
});

await prueba("nota correcta segun lo cerca que estuvo", () => {
  const casos = [
    [0,     "perfecto"], [0.079, "perfecto"],
    [0.081, "bien"],     [0.159, "bien"],
    [0.161, "casi"],     [0.279, "casi"],
    [0.281, "fuera"],    [3,     "fuera"]
  ];
  for (const [err, esperado] of casos) {
    igual(M.judge(err).name, esperado, `un error de ${err * 1000} ms`);
  }
});

await prueba("da igual adelantarse que atrasarse", () => {
  for (const e of [0.05, 0.12, 0.2, 0.5]) {
    igual(M.judge(-e).name, M.judge(e).name, `${e * 1000} ms no se juzga igual en los dos sentidos`);
  }
});

await prueba("siempre da una nota, nunca se queda sin respuesta", () => {
  for (const e of [0, -0, 1e-9, 1e9, -1e9]) {
    afirmar(M.judge(e), "se quedo sin nota con un error de " + e);
  }
});

/* ------------------------------------------------------------------------ */
seccion("Los tiempos marcados");

await prueba("el uno es el primero y los palmas van en 4 y 8", () => {
  igual(M.isOne(0), true, "el uno no es el tiempo 0");
  for (let i = 1; i < 8; i++) igual(M.isOne(i), false, "el tiempo " + i + " se cree el uno");
  // En bachata el golpe de cadera cae en el cuarto y el octavo
  igual(M.isTap(3), true); igual(M.isTap(7), true);
  for (const i of [0, 1, 2, 4, 5, 6]) igual(M.isTap(i), false, "tiempo " + i);
});

/* ------------------------------------------------------------------------ */
seccion("La cuenta y el juego concuerdan");

await prueba("cuando la cuenta marca el uno, el juego lo da por clavado", () => {
  /* Las dos funciones se calcularon por separado. Si no coincidieran, el
     alumno veria el "1" en pantalla en un momento distinto de aquel en que
     tocar la pantalla puntua, que es la peor incoherencia posible. */
  for (let t = 0.02; t < 11; t += 0.013) {
    const c = M.countAt(DOS_SEG, t);
    if (!c || c.index !== 0) continue;
    if (c.phase > 0.3) continue;              // recien entrado en el uno
    const j = M.nearestOne(DOS_SEG, t);
    afirmar(Math.abs(j.err) < 0.3,
      `en t=${t.toFixed(3)} la pantalla marca el UNO pero el juego lo puntua ` +
      `con ${(j.err * 1000).toFixed(0)} ms de error`);
  }
});

/* Sin esto, un fallo se veia en rojo por pantalla pero el archivo terminaba
   diciendo que todo habia ido bien: correr.sh no tenia como enterarse y
   remataba con "Todo en orden". Una prueba que falla sin que nadie se entere
   es peor que no tenerla. */
process.exit(resumen());
