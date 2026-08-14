/* Pruebas de la copia de seguridad y de los mensajes de espera.

   La copia de seguridad es de lo que mas depende no perder el trabajo, y era
   de lo unico importante que no probaba nadie. Los mensajes de espera son la
   otra mitad: cuando la app no reconoce nada, lo unico que queda es lo que
   dice, y decir lo que no es hace perder mas tiempo que no decir nada. */

import { cargar, FUENTE } from "./extraer.mjs";
import { seccion, prueba, afirmar, igual } from "./marco.mjs";

const M = await cargar([
  "exportarCanciones", "importarCanciones", "mensajeDeBusqueda", "STR"
]);

const cancion = (id, n) => ({
  id, title: "Canción " + id, artist: "Artista", teacher: "Profe",
  rhythm: "bachata", duration: 180.5, fpv: 1, owner: "alguien",
  createdAt: 1700000000000,
  downbeats: Array.from({ length: 20 }, (_, i) => i * 2.01),
  fp: {
    keys: Uint32Array.from({ length: n }, (_, i) => (i * 2654435761) >>> 0),
    times: Uint16Array.from({ length: n }, (_, i) => i % 65535)
  }
});

/* ========================================================================= */
seccion("La copia de seguridad");

await prueba("lo que sale vuelve a entrar exactamente igual", () => {
  const original = [cancion("a", 5000), cancion("b", 1200)];
  const recuperadas = M.importarCanciones(M.exportarCanciones(original));

  igual(recuperadas.length, 2, "no volvieron todas las canciones");
  for (let i = 0; i < original.length; i++) {
    const o = original[i], r = recuperadas[i];
    igual(r.id, o.id); igual(r.title, o.title); igual(r.artist, o.artist);
    igual(r.teacher, o.teacher); igual(r.rhythm, o.rhythm);
    igual(r.duration, o.duration); igual(r.fpv, o.fpv);
    igual(r.downbeats.length, o.downbeats.length, "faltan marcas del uno");
    for (let k = 0; k < o.downbeats.length; k++) {
      igual(r.downbeats[k], o.downbeats[k], "marca del uno " + k + " cambiada");
    }
    igual(r.fp.keys.length, o.fp.keys.length, "la huella volvio incompleta");
    for (let k = 0; k < o.fp.keys.length; k++) {
      igual(r.fp.keys[k], o.fp.keys[k], "hash " + k);
      igual(r.fp.times[k], o.fp.times[k], "tiempo " + k);
    }
  }
});

await prueba("la huella vuelve como numeros, no como lista suelta", () => {
  /* Si vuelve como lista normal el reconocedor sigue funcionando pero ocupa
     varias veces mas memoria, y en un telefono eso se nota. */
  const [r] = M.importarCanciones(M.exportarCanciones([cancion("a", 100)]));
  afirmar(r.fp.keys instanceof Uint32Array, "los hashes volvieron sueltos");
  afirmar(r.fp.times instanceof Uint16Array, "los tiempos volvieron sueltos");
});

await prueba("el archivo es texto normal, legible y sin sorpresas", () => {
  const texto = M.exportarCanciones([cancion("a", 10)]);
  const datos = JSON.parse(texto);
  igual(datos.v, 1, "falta la version del formato");
  afirmar(Array.isArray(datos.songs), "las canciones no van en una lista");
  afirmar(Array.isArray(datos.songs[0].fp.keys),
    "la huella no se guardo como lista: se perderia entera");
});

await prueba("exportar sin canciones no revienta", () => {
  const texto = M.exportarCanciones([]);
  igual(M.importarCanciones(texto).length, 0);
});

await prueba("una canción sin marcas del uno tampoco revienta", () => {
  const c = cancion("a", 50);
  delete c.downbeats;
  const [r] = M.importarCanciones(M.exportarCanciones([c]));
  igual(r.downbeats.length, 0, "invento marcas que no habia");
});

/* ------------------------------------------------------------------------ */
seccion("Un archivo malo se rechaza, no se traga a medias");

const rechaza = (texto, porque) => {
  let fallo = null;
  try { M.importarCanciones(texto); } catch (e) { fallo = e; }
  afirmar(fallo, "acepto " + porque);
};

await prueba("un archivo que no es del programa", () => {
  rechaza("esto no es json", "un archivo cualquiera");
  rechaza("{}", "un json sin canciones");
  rechaza('{"v":1}', "un json sin la lista");
  rechaza('{"v":1,"songs":"hola"}', "una lista que no es lista");
  rechaza("null", "un archivo vacio");
});

await prueba("una cancion incompleta", () => {
  rechaza('{"v":1,"songs":[{"title":"sin id"}]}', "una cancion sin identificador");
  rechaza('{"v":1,"songs":[{"id":"x"}]}', "una cancion sin huella");
  rechaza('{"v":1,"songs":[{"id":"x","fp":{"keys":[1,2]}}]}',
    "una huella sin tiempos");
});

await prueba("una huella cortada por la mitad", () => {
  /* Un archivo que se copio a medias, o que se corto al bajarlo. Es peor
     tragarselo que rechazarlo: quedaria una cancion que existe en la lista y
     no se reconoce nunca, y nadie sabria por que. */
  rechaza('{"v":1,"songs":[{"id":"x","fp":{"keys":[1,2,3],"times":[1]}}]}',
    "una huella con mas hashes que tiempos");
});

await prueba("si una cancion esta mal, no se importa ninguna a medias", () => {
  const buena = JSON.parse(M.exportarCanciones([cancion("a", 20)])).songs[0];
  const texto = JSON.stringify({ v: 1, songs: [buena, { id: "rota" }] });
  let fallo = null;
  try { M.importarCanciones(texto); } catch (e) { fallo = e; }
  afirmar(fallo, "acepto un archivo con una cancion rota dentro");
});

/* ------------------------------------------------------------------------ */
seccion("Los mensajes de espera");

const clave = (buscando, yaEncontro, hayBloq = false) =>
  M.mensajeDeBusqueda(buscando, yaEncontro, hayBloq).clave;

await prueba("al principio solo dice que esta buscando", () => {
  igual(clave(0, false), "searching");
  igual(clave(7.9, false), "searching");
});

await prueba("despues admite que todavia no la encuentra", () => {
  igual(clave(8, false), "notYet");
  igual(clave(19.9, false), "notYet");
});

await prueba("y al final dice que esa cancion no existe", () => {
  igual(clave(20, false), "notFound");
  igual(clave(120, false), "notFound");
});

await prueba("si hay canciones bloqueadas lo menciona", () => {
  igual(clave(10, false, true), "notYetLocked");
  igual(clave(30, false, true), "notFoundLocked");
});

await prueba("EL FALLO DE AYER: tras perder una cancion no dice que no existe", () => {
  /* Reconocia bien, perdia el hilo en el minuto uno y de golpe soltaba
     "nadie ha grabado esta cancion". Con `yaEncontroAlgo` puesto, ese mensaje
     no puede salir por mucho que se alargue la espera. */
  for (const t of [20, 30, 60, 300, 3600]) {
    igual(clave(t, true), "notYet",
      `a los ${t} s tras haber reconocido algo, volvio a decir que no existe`);
    igual(clave(t, true, true), "notYetLocked",
      `lo mismo con canciones bloqueadas, a los ${t} s`);
  }
});

await prueba("el reloj de la busqueda vuelve a empezar, no sigue corriendo", () => {
  /* Si al perder la cancion no se reiniciara el contador, el primer mensaje
     seria ya el ultimo. Se comprueba pasando tiempos pequenos, que es lo que
     llega cuando el reloj se reinicia bien. */
  igual(clave(0.5, true), "searching", "tras perderla no vuelve a 'buscando'");
  igual(clave(3, true), "searching");
});

await prueba("los cuatro mensajes existen en los dos idiomas", () => {
  for (const k of ["searching", "notYet", "notFound", "notYetLocked", "notFoundLocked"]) {
    afirmar(M.STR.es[k], "falta " + k + " en espanol");
    afirmar(M.STR.en[k], "falta " + k + " en ingles");
  }
});

await prueba("solo el mensaje final se pinta como error", () => {
  /* Pintar de rojo "todavia no la encuentro" alarma sin motivo: en ese punto
     todavia es normal que no la haya encontrado. */
  igual(M.mensajeDeBusqueda(3, false, false).tono, undefined);
  igual(M.mensajeDeBusqueda(10, false, false).tono, undefined);
  igual(M.mensajeDeBusqueda(25, false, false).tono, "err");
  igual(M.mensajeDeBusqueda(25, true, false).tono, undefined,
    "tras haber reconocido algo no deberia pintarse como error");
});

/* ------------------------------------------------------------------------ */
seccion("El resultado de una partida");

const G = await cargar(["resumenDelJuego", "BANDS", "judge"]);

// Simula una tanda de golpes con los errores dados, puntuando como la app
function partida(errores) {
  const taps = errores.map(err => ({ err, band: G.judge(err).name }));
  const puntos = errores.reduce((s, e) => s + G.judge(e).pts, 0);
  return G.resumenDelJuego(taps, puntos);
}

await prueba("clavarlos todos da el maximo", () => {
  const r = partida([0, 0.01, -0.02, 0.005]);
  igual(r.acierto, 100, "clavarlos todos no da 100%");
  igual(r.nota, "gFlawless");
  igual(r.n, 4);
});

await prueba("fallarlos todos da cero", () => {
  const r = partida([0.5, -0.6, 0.9, 1.2]);
  igual(r.acierto, 0);
  igual(r.nota, "gRough");
});

await prueba("el acierto nunca se sale de cero a cien", () => {
  const casos = [[0], [3], [0, 3], [0.1, 0.2, 0.3, 0.9, 0.05, 0]];
  for (const c of casos) {
    const r = partida(c);
    afirmar(r.acierto >= 0 && r.acierto <= 100,
      `un acierto imposible: ${r.acierto}% con ${JSON.stringify(c)}`);
  }
});

await prueba("el error medio no se compensa entre adelantarse y atrasarse", () => {
  /* Alguien que se adelanta 200 ms y se atrasa 200 ms NO es preciso, aunque
     la suma de cero. El error medio tiene que verlo. */
  const r = partida([-0.2, 0.2, -0.2, 0.2]);
  afirmar(Math.abs(r.errorMedio - 0.2) < 0.001,
    `el error medio se anulo solo: ${r.errorMedio}`);
});

await prueba("pero la tendencia SI se compensa, que para eso esta", () => {
  const r = partida([-0.2, 0.2, -0.2, 0.2]);
  afirmar(Math.abs(r.tendencia) < 0.001, "detecto una tendencia que no existe");
  igual(r.consejo, "tipEven", "le dice que corrija algo que no le pasa");
});

await prueba("a quien se adelanta siempre se le dice que se adelanta", () => {
  const r = partida([-0.12, -0.15, -0.1, -0.13]);
  igual(r.consejo, "tipEarly");
  afirmar(r.tendencia < 0, "la tendencia deberia ser negativa");
});

await prueba("y a quien se atrasa, lo contrario", () => {
  igual(partida([0.12, 0.15, 0.1, 0.13]).consejo, "tipLate");
});

await prueba("las notas van en orden y no dejan huecos", () => {
  const vistas = new Set();
  let anterior = null;
  const orden = ["gRough", "gPractise", "gOk", "gVeryGood", "gFlawless"];
  for (let acierto = 0; acierto <= 100; acierto++) {
    // una partida artificial con ese porcentaje exacto
    const r = G.resumenDelJuego([{ err: 0 }], acierto);
    vistas.add(r.nota);
    const i = orden.indexOf(r.nota);
    afirmar(i >= 0, "una nota desconocida: " + r.nota);
    if (anterior !== null) afirmar(i >= anterior, "las notas no van en orden");
    anterior = i;
  }
  igual(vistas.size, 5, "hay notas inalcanzables: " + [...vistas].join(","));
});

await prueba("una partida sin golpes no da un resultado inventado", () => {
  igual(G.resumenDelJuego([], 0), null, "invento un resultado de la nada");
});

await prueba("todas las notas y consejos existen en los dos idiomas", () => {
  const claves = ["gFlawless", "gVeryGood", "gOk", "gPractise", "gRough",
                  "tipEven", "tipEarly", "tipLate"];
  for (const k of claves) {
    afirmar(M.STR.es[k], "falta " + k + " en espanol");
    afirmar(M.STR.en[k], "falta " + k + " en ingles");
  }
});

/* ------------------------------------------------------------------------ */
seccion("El juego no se traba al perder la señal");

/* Reproduce lo que pasaba: jugando, el reconocedor suelta la canción unos
   segundos y a partir de ahí el contador se queda clavado mientras la persona
   sigue tocando la pantalla, sin ninguna señal de que algo va mal —en modo
   juego la cuenta está escondida a propósito.

   Se prueba la función de verdad, sacada del código, no una copia de la regla:
   una copia seguiría en verde con la app rota. */

const J = await cargar(["motivoParaNoContar"]);
const motivo = (juego, bloqueada) => J.motivoParaNoContar(juego, bloqueada);

await prueba("con la señal perdida a mitad, los golpes siguen contando", () => {
  /* Esto es lo que importa: el reconocedor ya no sabe qué suena, pero el
     juego tiene su ancla y tiene que seguir puntuando. */
  igual(motivo({ on: true, song: { id: "a" }, offset: 1.2 }, null), null,
    "al perder la señal dejó de contar: el juego se congela");
});

await prueba("si nunca se supo qué suena, sí se rechaza", () => {
  igual(motivo({ on: true, song: null }, null), "sinCancion",
    "puntuaba sin saber contra qué canción");
});

await prueba("una canción bloqueada sigue sin poder jugarse", () => {
  igual(motivo({ on: true, song: { id: "a" } }, { id: "x" }), "bloqueada",
    "dejó jugar con una canción bloqueada");
});

await prueba("con el juego apagado no pasa nada", () => {
  igual(motivo({ on: false, song: { id: "a" } }, null), "apagado");
});

await prueba("la regla no mira lo que el reconocedor sepa ahora mismo", () => {
  /* El ancla manda. Da igual lo que haya pasado con la escucha entre medias:
     mientras se sepa contra qué canción se juega, se puntúa. */
  const conAncla = { on: true, song: { id: "a" }, offset: 3.4 };
  for (let i = 0; i < 50; i++) {
    igual(motivo(conAncla, null), null, "se cayó en el intento " + i);
  }
});

await prueba("gameTap usa el ancla, no lo que el reconocedor tenga ahora", () => {
  const cuerpo = FUENTE.slice(FUENTE.indexOf("function gameTap"),
                              FUENTE.indexOf("$(\"g-tap\").addEventListener"));
  afirmar(/motivoParaNoContar/.test(cuerpo), "gameTap ya no usa la regla comprobada");
  afirmar(/game\.offset/.test(cuerpo), "gameTap dejó de usar el desfase del ancla");
  afirmar(/game\.song\.downbeats/.test(cuerpo), "gameTap dejó de usar la canción del ancla");
  afirmar(!/student\.offset/.test(cuerpo),
    "gameTap volvió a puntuar con el desfase de fuera del juego");
});

/* ------------------------------------------------------------------------ */
seccion("Una canción rota no se lleva a las demás por delante");

await prueba("la sincronización salta la fila mala y sigue", () => {
  /* Apareció probando: una canción con la huella estropeada hacía fallar la
     sincronización entera, y la persona se quedaba sin NINGUNA canción sin
     saber por qué. Se comprueba que el código la salta en los tres sitios
     donde se descifra una huella. */
  /* Se corta por longitud y no buscando la siguiente llamada: varios de esos
     nombres aparecen antes en el archivo y el corte salia vacio. */
  const iniBajada = FUENTE.indexOf("const remoteSongs = await cloud.rest");
  const bajada = FUENTE.slice(iniBajada, iniBajada + 900);
  afirmar(/try\s*\{[\s\S]*rowToSong[\s\S]*catch/.test(bajada),
    "al bajar canciones, una huella rota vuelve a tumbar la sincronización");

  const iniCat = FUENTE.indexOf("identificador.clear()");
  const cat = FUENTE.slice(iniCat, iniCat + 900);
  afirmar(/try\s*\{[\s\S]*identificador\.add[\s\S]*catch/.test(cat),
    "una huella rota en el catálogo vuelve a tumbar la pantalla");

  const iniSub = FUENTE.indexOf("const misSongs =");
  const subida = FUENTE.slice(iniSub, iniSub + 400);
  afirmar(/catch/.test(subida), "se vuelve a intentar subir una huella rota");
});

await prueba("y avisa de cuántas no pudo leer", () => {
  afirmar(/someBroken/.test(FUENTE), "se saltan en silencio, sin decirlo");
});
