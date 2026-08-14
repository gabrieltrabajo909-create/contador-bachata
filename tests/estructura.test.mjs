/* Pruebas de estructura: cosas que no se ven hasta que la app revienta
   delante de alguien.

   Casi todas nacen de un fallo real. El del idioma se escribio despues de que
   una traduccion a medias dejara textos en blanco, y el de los identificadores
   despues de que un `t` mal puesto tirara la pantalla del alumno entera. */

import { cargar, HTML, FUENTE } from "./extraer.mjs";
import { seccion, prueba, afirmar, igual } from "./marco.mjs";

const M = await cargar(["STR"]);
const { es, en } = M.STR;

const idiomas = Object.keys(M.STR);
const marcadores = (s) => (String(s).match(/\{\d+\}/g) || []).sort().join(",");

/* ------------------------------------------------------------------------ */
seccion("Los dos idiomas");

await prueba("hay exactamente dos idiomas", () => {
  igual(idiomas.sort().join(","), "en,es");
});

await prueba("nada esta traducido a medias", () => {
  const faltanEn = Object.keys(es).filter(k => !(k in en));
  const faltanEs = Object.keys(en).filter(k => !(k in es));
  afirmar(!faltanEn.length, "sin traducir al ingles: " + faltanEn.join(", "));
  afirmar(!faltanEs.length, "sin traducir al espanol: " + faltanEs.join(", "));
});

await prueba("ningun texto esta vacio", () => {
  for (const [idioma, dicc] of Object.entries(M.STR)) {
    for (const [k, v] of Object.entries(dicc)) {
      afirmar(typeof v === "string" && v.trim().length,
        `${idioma}.${k} esta vacio`);
    }
  }
});

await prueba("los huecos coinciden entre idiomas", () => {
  /* Si el espanol dice "Borrada: {0}" y el ingles se olvida del {0}, el
     nombre de la cancion desaparece solo para quien usa la app en ingles. */
  for (const k of Object.keys(es)) {
    if (!(k in en)) continue;
    igual(marcadores(en[k]), marcadores(es[k]),
      `los huecos de "${k}" no coinciden:\n  es: ${es[k]}\n  en: ${en[k]}`);
  }
});

await prueba("el espanol no se colo en el diccionario ingles", () => {
  // Los acentos y la enye no aparecen en ingles: delatan un copiar y pegar
  const sospechosos = Object.entries(en)
    .filter(([, v]) => /[áéíóúñ¿¡]/i.test(v))
    .map(([k]) => k);
  afirmar(!sospechosos.length,
    "textos en ingles que parecen estar en espanol: " + sospechosos.join(", "));
});

/* ------------------------------------------------------------------------ */
seccion("Los textos y la pantalla concuerdan");

const enHtml = (attr) =>
  [...HTML.matchAll(new RegExp(`${attr}="([^"]+)"`, "g"))].map(m => m[1]);

await prueba("cada texto marcado en la pantalla existe en el diccionario", () => {
  const usados = new Set([...enHtml("data-i18n"), ...enHtml("data-i18n-ph")]);
  const huerfanos = [...usados].filter(k => !(k in es));
  afirmar(!huerfanos.length,
    "la pantalla pide textos que no existen: " + huerfanos.join(", "));
});

await prueba("cada texto que pide el codigo existe en el diccionario", () => {
  const llamadas = [...FUENTE.matchAll(/\bt\(\s*"([^"]+)"/g)].map(m => m[1]);
  afirmar(llamadas.length > 30, "sospechosamente pocas llamadas: " + llamadas.length);
  const huerfanos = [...new Set(llamadas)].filter(k => !(k in es));
  afirmar(!huerfanos.length,
    "el codigo pide textos que no existen: " + huerfanos.join(", "));
});

await prueba("no sobran textos sin usar", () => {
  /* Se buscan las claves como texto en cualquier sitio del codigo, no solo
     dentro de un t(...). Muchas se eligen sobre la marcha —
     t(entrando ? "signingIn" : "signingUp")— y una busqueda mas estricta las
     daria por muertas estando vivas. Lo que se persigue aqui es lo que no
     aparece en ninguna parte, que eso si esta muerto seguro. */
  const sinDiccionario = FUENTE.replace(/const STR = \{[\s\S]*?\n\};/, "");
  const literales = new Set(
    [...sinDiccionario.matchAll(/"([A-Za-z][A-Za-z0-9_]*)"/g)].map(m => m[1]));
  const usados = new Set([
    ...enHtml("data-i18n"), ...enHtml("data-i18n-ph"), ...literales
  ]);
  const sobran = Object.keys(es).filter(k => !usados.has(k));
  afirmar(!sobran.length, "textos que ya no usa nadie: " + sobran.join(", "));
});

/* ------------------------------------------------------------------------ */
seccion("Los identificadores de la pantalla");

const idsDeclarados = [...HTML.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);

await prueba("no hay dos elementos con el mismo identificador", () => {
  const vistos = new Set(), repes = new Set();
  for (const id of idsDeclarados) (vistos.has(id) ? repes : vistos).add(id);
  afirmar(!repes.size, "identificadores repetidos: " + [...repes].join(", "));
});

await prueba("el codigo no busca elementos que no existen", () => {
  /* Este es el que atrapa las erratas. Buscar un elemento que no existe
     devuelve nada, y la app se cae al intentar usarlo, casi siempre en una
     pantalla concreta y no al arrancar: el peor momento para enterarse. */
  const buscados = [...new Set(
    [...FUENTE.matchAll(/\$\(\s*"([^"]+)"\s*\)/g)].map(m => m[1]))];
  const declarados = new Set(idsDeclarados);
  const rotos = buscados.filter(id => !declarados.has(id));
  afirmar(!rotos.length, "busca elementos inexistentes: " + rotos.join(", "));
  afirmar(buscados.length > 20, "sospechosamente pocos: " + buscados.length);
});

/* ------------------------------------------------------------------------ */
seccion("Higiene del archivo");

await prueba("la pagina se declara en espanol y se adapta al movil", () => {
  afirmar(/<html[^>]+lang=/.test(HTML), "falta el idioma de la pagina");
  afirmar(/name="viewport"/.test(HTML), "falta la etiqueta de movil");
  afirmar(/charset="?utf-8"?/i.test(HTML), "falta la codificacion");
});

await prueba("no quedan rastros de depuracion", () => {
  const sueltos = [...FUENTE.matchAll(/console\.log\(/g)].length;
  igual(sueltos, 0, "quedaron " + sueltos + " console.log en el codigo");
  afirmar(!/\bdebugger\b/.test(FUENTE), "quedo un debugger");
});

await prueba("sigue sin depender de nada externo", () => {
  /* Toda la gracia es que sea un archivo suelto. Una libreria de fuera es
     otra cosa que puede caerse, caducar o cambiar sin avisar. */
  const fuera = [...HTML.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)]
    .map(m => m[1])
    .filter(u => !/supabase\.co/.test(u));
  afirmar(!fuera.length, "aparecieron dependencias externas: " + fuera.join(", "));
});

/* ------------------------------------------------------------------------ */
seccion("Reglas que ya se rompieron una vez");

await prueba("al sincronizar nunca se piden las canciones borradas", () => {
  /* Si se cae este filtro, la cancion que acabas de borrar se vuelve a bajar
     sola en la siguiente sincronizacion, porque su dueno SI la ve en el
     servidor. Es la clase de fallo que solo aparece dias despues. */
  const consultas = [...FUENTE.matchAll(/rest\(\s*"(songs\?[^"]*)"/g)].map(m => m[1]);
  const bajadas = consultas.filter(q => /select=\*/.test(q));
  afirmar(bajadas.length, "no encuentro la consulta que baja las canciones");
  for (const q of bajadas) {
    afirmar(/deleted_at=is\.null/.test(q),
      "esta consulta se baja tambien lo borrado: " + q);
  }
});

await prueba("borrar desde la lista esconde, no destruye", () => {
  /* El borrado definitivo tiene que quedar solo en la papelera, detras de su
     propia confirmacion. Si vuelve a la lista principal, un dedo torpe
     pierde el trabajo de marcar una cancion entera. */
  const cuerpo = FUENTE.slice(FUENTE.indexOf("async function borrarCancion"),
                             FUENTE.indexOf("async function restaurarCancion"));
  afirmar(/method:\s*"PATCH"/.test(cuerpo), "borrarCancion ya no esconde");
  afirmar(!/method:\s*"DELETE"/.test(cuerpo),
    "borrarCancion volvio a borrar de verdad: se pierde el trabajo");
});

await prueba("lo definitivo pide confirmacion aparte", () => {
  const cuerpo = FUENTE.slice(FUENTE.indexOf("async function purgarCancion"),
                             FUENTE.indexOf("let papelera"));
  afirmar(/confirm\(/.test(cuerpo), "el borrado definitivo no pregunta nada");
  afirmar(/method:\s*"DELETE"/.test(cuerpo), "el borrado definitivo no borra");
});

await prueba("solo se sube lo propio", () => {
  /* Reclamar la propiedad de una cancion ajena hace que el servidor rechace
     la sincronizacion entera, y el usuario solo ve un error indescifrable. */
  afirmar(/const mio = \(x\) => !x\.owner \|\| x\.owner === uid;/.test(FUENTE),
    "desaparecio el filtro que evita subir canciones de otros");
});

await prueba("ningun boton de una fila puede estirarse y tapar el titulo", () => {
  /* Los botones grandes de la app llevan width:100%. En cuanto uno de esos
     cayo dentro de una fila de cancion, se comio el nombre entero: el titulo
     quedo en cero pixeles y la lista mostraba solo botones. */
  afirmar(/\.song button \{[^}]*width:\s*auto/.test(HTML),
    "falta el ancho automatico en los botones de las filas");

  // Y que no se cuelen las clases de boton grande al construir las filas
  const constructor = FUENTE.slice(FUENTE.indexOf("const mk = (s, forStudent)"),
                                   FUENTE.indexOf("const catEl = $(\"a-list\")"));
  const anchos = [...constructor.matchAll(/className\s*=\s*"(ghost|primary|danger)\b/g)];
  igual(anchos.length, 0,
    "una fila usa una clase de boton grande: volveria a tapar el titulo");
});

await prueba("al editar se ve que cancion se esta editando", () => {
  /* El formulario es identico para todas: sin el nombre a la vista no hay
     forma de saber cual se toco. */
  afirmar(/id="e-cual"/.test(HTML), "falta el hueco para el nombre");
  afirmar(/\$\("e-cual"\)\.textContent/.test(FUENTE), "el nombre nunca se rellena");
});

await prueba("la clave del servidor es la publica, no una secreta", () => {
  /* La publicable esta pensada para ir en la pagina; una clave de servicio
     ahi seria dar acceso total a la base a cualquiera que mire el codigo. */
  afirmar(!/service_role|SUPABASE_SERVICE|sb_secret_/.test(HTML),
    "hay una clave secreta metida en la pagina");
  afirmar(/sb_publishable_/.test(HTML), "no encuentro la clave publica");
});
