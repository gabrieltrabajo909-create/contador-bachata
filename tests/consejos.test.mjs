/* Pruebas de los consejos de baile.

   El profesor ya no solo dice DONDE esta el uno: puede dejar un mapa corto de
   como recomienda bailar la cancion. Seis botones, dos categorias.

   Lo que hay que proteger aqui:

     1. Que lo guardado sea siempre legible. La lista la escribe un telefono y
        la lee otro, quiza con una version distinta de la app y quiza despues
        de pasar por un archivo de copia que alguien abrio con el bloc de
        notas. Todo lo que entra se limpia; nada se cree a la primera.

     2. Que la lista este ORDENADA. El alumno pregunta "cual es el ultimo
        consejo antes de este segundo", y esa pregunta no tiene respuesta si
        el orden no esta garantizado. Es la clase de fallo que no se ve: no
        rompe nada, solo muestra el consejo equivocado de vez en cuando.

     3. Que las dos categorias sean independientes. "Suave" y "waves" son
        respuestas a preguntas distintas y tienen que poder convivir. Si una
        tapara a la otra, la mitad del mapa desapareceria.

     4. Que esto NO toque nada de lo que ya funcionaba. Una cancion sin
        consejos tiene que comportarse exactamente igual que antes de que esto
        existiera. */

import { cargar, FUENTE } from "./extraer.mjs";
import { seccion, prueba, afirmar, igual, resumen } from "./marco.mjs";

const M = await cargar([
  "CONSEJOS", "tipDef", "catDe", "limpiarConsejos", "consejosEn",
  // pegarAlUno se apoya en nearestOne, la misma que usa el juego
  "nearestOne", "pegarAlUno"
]);
const { CONSEJOS, tipDef, catDe, limpiarConsejos, consejosEn, pegarAlUno } = M;

const claves = CONSEJOS.LISTA.map(d => d.k);
const energia = CONSEJOS.LISTA.filter(d => d.cat === "energia").map(d => d.k);
const mov = CONSEJOS.LISTA.filter(d => d.cat === "mov").map(d => d.k);

/* ========================================================================= */
seccion("Los seis botones");

await prueba("son seis, y son los que se prometieron", () => {
  igual(CONSEJOS.LISTA.length, 6, "cambio la cantidad de consejos");
  for (const k of ["up", "soft", "waves", "turns", "foot", "pause"]) {
    afirmar(claves.includes(k), "falta el consejo " + k);
  }
});

await prueba("dos de energia y cuatro de movimiento", () => {
  igual(energia.length, 2, "la energia no tiene dos opciones");
  igual(mov.length, 4, "el movimiento no tiene cuatro opciones");
});

await prueba("cada uno tiene emoji y texto traducible", () => {
  /* El texto NO se guarda en la cancion: se guarda la clave y el texto sale
     de aqui. Asi, traducir la app o cambiar una palabra no deja las canciones
     viejas escritas en el idioma de quien las grabo. */
  for (const d of CONSEJOS.LISTA) {
    afirmar(d.emoji && d.emoji.length, d.k + " se quedo sin emoji");
    afirmar(d.i18n && /^tip/.test(d.i18n), d.k + " no apunta a un texto traducible");
    afirmar(d.cat === "energia" || d.cat === "mov", d.k + " no es ni energia ni movimiento");
  }
});

await prueba("las claves no se repiten", () => {
  igual(new Set(claves).size, 6, "hay dos consejos con la misma clave");
});

await prueba("una clave inventada no existe", () => {
  igual(tipDef("bailar_bonito"), null, "acepto una clave que no existe");
  igual(tipDef(""), null);
  igual(tipDef(undefined), null);
});

/* ========================================================================= */
seccion("Lo que entra se limpia");

await prueba("lo que no es una lista da una lista vacia", () => {
  /* Puede llegar null del servidor -una cancion vieja-, o cualquier cosa de
     un archivo tocado a mano. Ninguna de esas puede tumbar la pantalla. */
  for (const basura of [null, undefined, 0, "", "hola", {}, 42, true]) {
    const r = limpiarConsejos(basura);
    afirmar(Array.isArray(r), "no devolvio una lista con " + JSON.stringify(basura));
    igual(r.length, 0, "invento consejos a partir de " + JSON.stringify(basura));
  }
});

await prueba("las claves que no existen se caen", () => {
  const r = limpiarConsejos([
    { t: 1, k: "soft" },
    { t: 2, k: "salto_mortal" },     // de una version mas nueva, o inventada
    { t: 3, k: "waves" },
    { t: 4 },                        // sin clave
    { t: 5, k: null }
  ]);
  igual(r.length, 2, "no se quedo solo con los consejos que existen");
  igual(r[0].k, "soft"); igual(r[1].k, "waves");
});

await prueba("los tiempos imposibles se caen", () => {
  const r = limpiarConsejos([
    { t: -1, k: "soft" },            // antes de empezar la cancion
    { t: NaN, k: "waves" },
    { t: Infinity, k: "turns" },
    { t: "hola", k: "foot" },
    { t: 10, k: "up" }
  ]);
  igual(r.length, 1, "acepto un tiempo que no es un tiempo");
  igual(r[0].k, "up");
});

await prueba("el cero vale: hay consejos que empiezan con la cancion", () => {
  const r = limpiarConsejos([{ t: 0, k: "soft" }]);
  igual(r.length, 1, "tiro el consejo del segundo cero");
  igual(r[0].t, 0);
});

await prueba("un texto con numero dentro tambien vale", () => {
  // JSON de un archivo de copia puede traer "18.4" en vez de 18.4
  const r = limpiarConsejos([{ t: "18.4", k: "soft" }]);
  igual(r.length, 1);
  igual(r[0].t, 18.4);
});

await prueba("los tiempos se redondean a la milesima", () => {
  /* Vienen de un reloj de audio y arrastran decimales que no significan nada
     pero que abultan en cada subida y en cada copia. */
  const r = limpiarConsejos([{ t: 18.400000000000002, k: "soft" }]);
  igual(r[0].t, 18.4, "el tiempo no se redondeo");
});

await prueba("nunca pasan del tope", () => {
  const muchos = Array.from({ length: 900 }, (_, i) => ({ t: i, k: "waves" }));
  const r = limpiarConsejos(muchos);
  afirmar(r.length <= CONSEJOS.MAX, "una sola cancion puede traer consejos sin limite");
});

await prueba("limpiar dos veces da lo mismo que limpiar una", () => {
  /* Se limpia al bajar del servidor, al importar y al guardar. Si limpiar
     cambiara el resultado cada vez, los consejos se irian moviendo solos con
     cada sincronizacion. */
  const uno = limpiarConsejos([
    { t: 30, k: "turns" }, { t: 5, k: "soft" }, { t: 5.1, k: "up" }, { t: 12, k: "waves" }
  ]);
  const dos = limpiarConsejos(uno);
  igual(JSON.stringify(dos), JSON.stringify(uno), "limpiar otra vez cambio la lista");
});

await prueba("limpiar no toca la lista que le dieron", () => {
  // Se le pasa teacher.tips y la copia local a la vez: si la modificara,
  // guardar sin querer cambiaria lo que hay en pantalla.
  const original = [{ t: 5, k: "soft" }, { t: 1, k: "waves" }];
  const copia = JSON.stringify(original);
  limpiarConsejos(original);
  igual(JSON.stringify(original), copia, "limpiar modifico la lista original");
});

/* ========================================================================= */
seccion("La lista siempre ordenada");

await prueba("lo desordenado sale ordenado", () => {
  const r = limpiarConsejos([
    { t: 51, k: "up" }, { t: 18, k: "soft" }, { t: 87, k: "foot" }, { t: 34, k: "waves" }
  ]);
  igual(r.map(c => c.t).join(","), "18,34,51,87", "la lista no quedo ordenada");
});

await prueba("sigue ordenada aunque limpiar junte dos", () => {
  /* Este es el caso raro que se escapa: al fusionar dos consejos pegados, el
     que queda es el mas tardio y puede pasar por delante de uno de la otra
     categoria. Sin volver a ordenar, la lista sale rota y nada avisa. */
  const r = limpiarConsejos([
    { t: 10.0, k: "soft" },
    { t: 10.1, k: "waves" },
    { t: 10.4, k: "up" }      // se junta con "soft" y se queda en 10.4
  ]);
  const tiempos = r.map(c => c.t);
  for (let i = 1; i < tiempos.length; i++) {
    afirmar(tiempos[i] >= tiempos[i - 1], "la lista quedo desordenada tras juntar dos");
  }
});

/* ========================================================================= */
seccion("Dos toques pegados: manda el ultimo");

await prueba("del mismo tipo y muy juntos, se quedan en uno", () => {
  // El dedo rebotando, o cambiar de idea sobre la marcha
  const r = limpiarConsejos([{ t: 20, k: "soft" }, { t: 20.2, k: "up" }]);
  igual(r.length, 1, "se guardaron los dos toques del rebote");
  igual(r[0].k, "up", "gano el primero en vez del ultimo");
});

await prueba("de tipos distintos conviven aunque sean simultaneos", () => {
  /* La razon de ser de las dos categorias: "suave" y "waves" a la vez son dos
     consejos buenos, no un rebote. */
  const r = limpiarConsejos([{ t: 20, k: "soft" }, { t: 20.05, k: "waves" }]);
  igual(r.length, 2, "una categoria se comio a la otra");
});

await prueba("del mismo tipo pero separados se guardan los dos", () => {
  const lejos = CONSEJOS.JUNTOS + 1;
  const r = limpiarConsejos([{ t: 20, k: "soft" }, { t: 20 + lejos, k: "up" }]);
  igual(r.length, 2, "se comio un cambio de energia de verdad");
});

await prueba("el umbral es mas corto que un compas", () => {
  /* Si fuera mas largo se tragaria cambios de verdad. Un compas de bachata
     lenta ronda los dos segundos y medio. */
  afirmar(CONSEJOS.JUNTOS < 1, "el umbral de juntar es demasiado largo");
});

/* ========================================================================= */
seccion("Que ve el alumno en cada momento");

const mapa = limpiarConsejos([
  { t: 18, k: "soft" },
  { t: 34, k: "waves" },
  { t: 51, k: "up" },
  { t: 53, k: "turns" },
  { t: 75, k: "pause" },
  { t: 87, k: "foot" }
]);

await prueba("antes del primer consejo no hay nada que decir", () => {
  const r = consejosEn(mapa, 5);
  igual(r.energia, null, "invento un consejo de energia antes de tiempo");
  igual(r.mov, null, "invento un movimiento antes de tiempo");
});

await prueba("cada consejo aparece justo cuando le toca", () => {
  igual(consejosEn(mapa, 17.9).energia, null, "aparecio un segundo antes");
  igual(consejosEn(mapa, 18).energia.k, "soft", "no aparecio en su segundo");
  igual(consejosEn(mapa, 18.1).energia.k, "soft");
});

await prueba("se queda puesto hasta que llegue el siguiente", () => {
  /* Un consejo no es un aviso que pasa: es como se baila ESE trozo. Tiene que
     seguir en pantalla hasta que el profesor diga otra cosa. */
  for (const seg of [18, 25, 40, 50.9]) {
    igual(consejosEn(mapa, seg).energia.k, "soft", "el consejo se borro solo en " + seg);
  }
  igual(consejosEn(mapa, 51).energia.k, "up", "no cambio cuando debia");
});

await prueba("las dos etiquetas van cada una por su cuenta", () => {
  const r = consejosEn(mapa, 40);
  igual(r.energia.k, "soft", "la energia del minuto 0:40 no es la que marco el profesor");
  igual(r.mov.k, "waves", "el movimiento del minuto 0:40 no es el que marco el profesor");
});

await prueba("despues del ultimo se queda el ultimo", () => {
  const r = consejosEn(mapa, 600);   // mucho despues de que acabe la cancion
  igual(r.energia.k, "up");
  igual(r.mov.k, "foot");
});

await prueba("devuelve el emoji y el texto, no solo la clave", () => {
  // Quien pinta necesita las dos cosas y no deberia tener que buscarlas
  const r = consejosEn(mapa, 60);
  afirmar(r.energia.emoji, "no vino el emoji");
  afirmar(r.energia.i18n, "no vino el texto");
});

/* ========================================================================= */
seccion("Una cancion sin consejos sigue igual que siempre");

await prueba("sin consejos no se propone nada", () => {
  for (const vacio of [[], null, undefined]) {
    const r = consejosEn(vacio, 30);
    igual(r.energia, null, "invento energia sin que nadie la marcara");
    igual(r.mov, null, "invento movimiento sin que nadie lo marcara");
  }
});

await prueba("preguntar por una lista rota no revienta", () => {
  /* El alumno pregunta esto veintiuna veces por segundo con la musica sonando.
     Una excepcion aqui no da un mensaje de error: para la cuenta en seco. */
  for (const basura of [{}, 5, "hola", [null], [{ k: "no_existe", t: 1 }]]) {
    const r = consejosEn(basura, 30);
    afirmar(r && "energia" in r && "mov" in r, "se rompio con " + JSON.stringify(basura));
  }
});

/* ========================================================================= */
seccion("Los consejos caen en el UNO, como la cuenta");

/* Un compas cada dos segundos, que es una bachata de unos 120. */
const compases = Array.from({ length: 60 }, (_, i) => i * 2);

await prueba("un toque tarde cae en el uno que acaba de pasar", () => {
  /* EL FALLO QUE SE ARREGLO. Se guardaba el segundo crudo del toque, con el
     retraso de reaccion incluido, y el consejo entraba a destiempo. La cuenta
     del alumno lleva desde siempre pegada a las marcas del profesor; esto no
     lo estaba, y esa incoherencia es la que se veia bailando. */
  igual(pegarAlUno(compases, 20.28), 20, "no se pego al uno que acababa de pasar");
  igual(pegarAlUno(compases, 20.05), 20);
});

await prueba("un toque adelantado cae en el uno que viene", () => {
  igual(pegarAlUno(compases, 21.7), 22, "no se pego al uno mas cercano");
});

await prueba("justo en medio no se queda en medio", () => {
  // Caiga donde caiga, tiene que caer en UN uno, nunca entre dos
  const r = pegarAlUno(compases, 21);
  afirmar(compases.includes(r), "se quedo a mitad de compas");
});

await prueba("sigue funcionando fuera del tramo marcado", () => {
  /* El profesor puede anotar un consejo despues del ultimo uno que marco, o
     antes del primero. Se extrapola con el compas del borde, igual que hace
     el juego. */
  const tarde = pegarAlUno(compases, 200.4);
  afirmar(Math.abs(tarde - 200) < 0.001, "fuera del tramo no se pego a nada");
});

await prueba("sin marcas suficientes no se pega, pero tampoco se rompe", () => {
  /* Una cancion a medio grabar no puede quedarse sin poder anotarse. Se
     devuelve el segundo tal cual y ya esta. */
  igual(pegarAlUno([], 18.4), 18.4, "se rompio sin marcas");
  igual(pegarAlUno([5], 18.4), 18.4, "se rompio con una sola marca");
  igual(pegarAlUno(null, 18.4), 18.4, "se rompio sin lista");
});

await prueba("nunca devuelve un tiempo negativo", () => {
  // Pegar un consejo del segundo 0.2 podria llevarlo antes del principio
  afirmar(pegarAlUno(compases, 0.2) >= 0, "un consejo se fue antes de empezar");
  afirmar(pegarAlUno(compases, 0) >= 0);
});

await prueba("pegar dos veces da lo mismo que pegar una", () => {
  // Si moviera un poco cada vez, corregir un consejo lo iria desplazando
  const una = pegarAlUno(compases, 20.28);
  igual(pegarAlUno(compases, una), una, "pegarlo otra vez lo movio");
});

/* ========================================================================= */
seccion("El mensaje escrito del profesor");

await prueba("un mensaje se guarda con su texto", () => {
  const r = limpiarConsejos([{ t: 18, m: "abri el pecho" }]);
  igual(r.length, 1, "se perdio el mensaje");
  igual(r[0].m, "abri el pecho");
  igual(r[0].t, 18);
});

await prueba("es su propia categoria: no tapa ni energia ni movimiento", () => {
  /* Un mensaje no reemplaza a "suave" ni a "waves". Son tres cosas distintas
     y el alumno tiene que poder ver las tres a la vez. */
  const r = limpiarConsejos([
    { t: 18, k: "soft" }, { t: 18.1, k: "waves" }, { t: 18.2, m: "no corras" }
  ]);
  igual(r.length, 3, "el mensaje se comio un consejo de boton, o al reves");
  const v = consejosEn(r, 30);
  igual(v.energia.k, "soft");
  igual(v.mov.k, "waves");
  igual(v.msg, "no corras");
});

await prueba("un mensaje dura hasta que llegue el siguiente", () => {
  /* Lo que pidio Gabriel: se muestra, y se muestra, hasta que otro lo
     sobrescriba. Sin "durante cuanto tiempo", que obligaria al profesor a
     decidir un numero que no sabe. */
  const r = limpiarConsejos([
    { t: 10, m: "primero" }, { t: 40, m: "segundo" }, { t: 90, m: "tercero" }
  ]);
  igual(consejosEn(r, 5).msg, null, "aparecio antes de tiempo");
  igual(consejosEn(r, 10).msg, "primero");
  igual(consejosEn(r, 39.9).msg, "primero", "se borro solo antes del siguiente");
  igual(consejosEn(r, 40).msg, "segundo", "no lo sobrescribio el siguiente");
  igual(consejosEn(r, 5000).msg, "tercero", "el ultimo no se quedo puesto");
});

await prueba("los mensajes vacios no se guardan", () => {
  const r = limpiarConsejos([
    { t: 1, m: "" }, { t: 2, m: "   " }, { t: 3, m: "\n\t " }, { t: 4, m: "vale" }
  ]);
  igual(r.length, 1, "se guardo un mensaje sin nada dentro");
  igual(r[0].m, "vale");
});

await prueba("un mensaje larguisimo se recorta", () => {
  /* Sin tope, un profesor pega un parrafo y le tapa la cuenta a todos sus
     alumnos. Y estas canciones se comparten: el destrozo no es solo suyo. */
  const r = limpiarConsejos([{ t: 1, m: "x".repeat(500) }]);
  igual(r[0].m.length, CONSEJOS.LARGO, "el mensaje no se recorto");
});

await prueba("los saltos de linea se aplastan", () => {
  // Descolocan la pantalla del alumno, y ahi no hay sitio para dos lineas
  const r = limpiarConsejos([{ t: 1, m: "una\nlinea\n\n  y   otra" }]);
  igual(r[0].m, "una linea y otra", "quedaron saltos de linea dentro");
});

await prueba("lo que no es texto no es un mensaje", () => {
  const r = limpiarConsejos([
    { t: 1, m: 42 }, { t: 2, m: {} }, { t: 3, m: ["hola"] }, { t: 4, m: null }
  ]);
  igual(r.length, 0, "acepto como mensaje algo que no es texto");
});

await prueba("dos mensajes pegados: manda el ultimo", () => {
  // Mismo criterio que los botones: es el dedo, no dos mensajes de verdad
  const r = limpiarConsejos([{ t: 20, m: "uno" }, { t: 20.2, m: "dos" }]);
  igual(r.length, 1, "se guardaron los dos");
  igual(r[0].m, "dos", "gano el primero en vez del ultimo");
});

await prueba("catDe sabe distinguir las tres cosas", () => {
  igual(catDe({ t: 1, k: "soft" }), "energia");
  igual(catDe({ t: 1, k: "waves" }), "mov");
  igual(catDe({ t: 1, m: "hola" }), "msg");
  igual(catDe({ t: 1, k: "no_existe" }), null, "acepto una clave inventada");
  igual(catDe(null), null);
  igual(catDe({ t: 1 }), null, "acepto una entrada sin nada dentro");
});

await prueba("un mensaje sobrevive el viaje por JSON", () => {
  // Sube al servidor y baja como jsonb; y va al archivo de copia
  const ida = limpiarConsejos([{ t: 18, m: "abrí el pecho — despacio" }]);
  const vuelta = limpiarConsejos(JSON.parse(JSON.stringify(ida)));
  igual(vuelta[0].m, ida[0].m, "el texto cambio en el viaje");
});

await prueba("mezclar botones y mensajes no desordena la lista", () => {
  const r = limpiarConsejos([
    { t: 51, k: "up" }, { t: 18, m: "arranca suave" },
    { t: 87, k: "foot" }, { t: 34, m: "ahora si" }
  ]);
  igual(r.map(c => c.t).join(","), "18,34,51,87", "la lista mezclada quedo desordenada");
});

/* ========================================================================= */
seccion("Lo que se guarda no cambia de forma");

await prueba("solo se guardan dos datos por consejo: cuando y cual", () => {
  /* Si aqui se colara el texto, el color o el nombre del profesor, cada
     cancion llevaria una copia de cosas que cambian, y cambiarlas obligaria a
     tocar todas las canciones ya grabadas. */
  const r = limpiarConsejos([{ t: 12, k: "soft", texto: "Suave", color: "rojo" }]);
  igual(Object.keys(r[0]).sort().join(","), "k,t", "se guarda mas de lo necesario");

  // Y de un mensaje, cuando y que dice. Nada del profesor ni de la cancion:
  // eso ya esta una vez en la fila, y repetirlo es tener dos verdades.
  const m = limpiarConsejos([{ t: 12, m: "hola", autor: "Gabriel", color: "azul" }]);
  igual(Object.keys(m[0]).sort().join(","), "m,t", "el mensaje guarda mas de lo necesario");
});

await prueba("los consejos son texto plano, sin funciones ni referencias", () => {
  // Van a JSON para subir y para la copia de seguridad: si no sobreviven a un
  // viaje de ida y vuelta por JSON, no se pueden guardar.
  const ida = limpiarConsejos(mapa);
  const vuelta = JSON.parse(JSON.stringify(ida));
  igual(JSON.stringify(limpiarConsejos(vuelta)), JSON.stringify(ida),
    "los consejos no sobreviven un viaje por JSON");
});

await prueba("las marcas del uno no se tocan desde aqui", () => {
  /* La comprobacion mas importante del archivo. Los consejos son un anadido:
     si alguna de estas funciones supiera de downbeats, el dia que algo falle
     aqui se llevaria por delante la cuenta, que es la app entera. */
  const trozo = /function limpiarConsejos[\s\S]*?\n}\n/.exec(FUENTE);
  afirmar(trozo, "no encuentro limpiarConsejos en el archivo");
  afirmar(!/downbeats|fp\.keys|fpv/.test(trozo[0]),
    "limpiarConsejos toca la grabacion, y no tiene por que");

  const trozo2 = /function consejosEn[\s\S]*?\n}\n/.exec(FUENTE);
  afirmar(trozo2, "no encuentro consejosEn en el archivo");
  afirmar(!/downbeats|fp\.keys|fpv/.test(trozo2[0]),
    "consejosEn toca la grabacion, y no tiene por que");
});

resumen();
