/* Pruebas de estructura: cosas que no se ven hasta que la app revienta
   delante de alguien.

   Casi todas nacen de un fallo real. El del idioma se escribio despues de que
   una traduccion a medias dejara textos en blanco, y el de los identificadores
   despues de que un `t` mal puesto tirara la pantalla del alumno entera. */

import { readFileSync } from "node:fs";
import { cargar, HTML, FUENTE, SOLO_HTML } from "./extraer.mjs";
import { seccion, prueba, afirmar, igual, resumen } from "./marco.mjs";

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
  [...SOLO_HTML.matchAll(new RegExp(`${attr}="([^"]+)"`, "g"))].map(m => m[1]);

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
  /* El selector puede nombrar mas de una cosa -hoy tambien el enlace de abrir
     la cancion- pero `.song button` tiene que seguir cayendo dentro. */
  const regla = /\.song button[^{]*\{[^}]*width:\s*auto/.exec(HTML);
  afirmar(regla, "falta el ancho automatico en los botones de las filas");

  /* El enlace de abrir la cancion corre el mismo peligro por el mismo motivo:
     va dentro de la fila, pegado al titulo. */
  afirmar(/\.song a\.solo-ic/.test(regla[0]),
    "el enlace de abrir la cancion se quedo fuera del ancho automatico");

  // Y que no se cuelen las clases de boton grande al construir las filas
  const constructor = FUENTE.slice(FUENTE.indexOf("const mk = (s, forStudent)"),
                                   FUENTE.indexOf("const catEl = $(\"a-list\")"));
  const anchos = [...constructor.matchAll(/className\s*=\s*"(ghost|primary|danger)\b/g)];
  igual(anchos.length, 0,
    "una fila usa una clase de boton grande: volveria a tapar el titulo");
});

await prueba("el perfil se carga antes de subir nada", () => {
  /* El nombre con el que se firman las canciones vive en el perfil, y al
     abrir la app todavia no esta cargado. Si se sube antes de pedirlo, se
     suben sin firma y se pisa el nombre bueno que tiene el servidor: el mismo
     fallo de antes, colandose por la puerta de al lado. */
  const cuerpo = FUENTE.slice(FUENTE.indexOf("async function syncNow"),
                              FUENTE.indexOf("/* ---------- Interfaz de la cuenta"));
  const perfil = cuerpo.indexOf("cargarPerfil()");
  const sube = cuerpo.indexOf("songToRow(");
  afirmar(perfil >= 0 && sube >= 0, "no encuentro el orden de la sincronizacion");
  afirmar(perfil < sube,
    "se suben las canciones antes de saber como te llamas: van sin firma");
});

await prueba("enterarse de que mandas sirve de algo", () => {
  /* Se preguntaba al servidor si eras administrador y no se hacia nada con la
     respuesta: la pestana del catalogo seguia escondida hasta que otra cosa
     repintara la pantalla. El mando existia y no habia forma de llegar a el.
     Y al abrir la app ni se preguntaba, asi que no aparecia nunca. */
  const cuerpo = FUENTE.slice(FUENTE.indexOf("async function syncNow"),
                              FUENTE.indexOf("/* ---------- Interfaz de la cuenta"));
  const pregunta = cuerpo.indexOf("rpc/soy_admin");
  afirmar(pregunta >= 0, "ya no se pregunta quien administra");
  afirmar(cuerpo.indexOf("renderAccount()", pregunta) > pregunta,
    "se averigua que mandas y no se repinta la pestana: sigue escondida");

  const arranque = FUENTE.slice(FUENTE.indexOf("   Arranque"));
  afirmar(/rpc\/soy_admin/.test(arranque),
    "al abrir la app no se pregunta: la pestana no aparece hasta sincronizar");
  afirmar(/cargarPerfil\(\)/.test(arranque),
    "al abrir la app no se pide el perfil: se arranca sin nombre para firmar");
});

await prueba("la firma del profesor tiene su propia linea", () => {
  /* Iba pegada al artista y al ritmo en una sola linea que se corta con
     puntos suspensivos: con un titulo o un artista largo, el nombre del
     profesor quedaba fuera de la pantalla. Y la firma es lo que dice de quien
     es el trabajo, que es de lo que vive el catalogo. */
  afirmar(/\.song \.by \{/.test(HTML), "desaparecio el estilo de la linea de la firma");
  afirmar(/class(?:Name)?\s*=\s*"by"/.test(FUENTE), "ya nadie crea esa linea");

  const juntas = [...FUENTE.matchAll(/\[([^\]]*rhythmName\(\S+?\)[^\]]*)\]/g)]
    .filter(m => /\.teacher/.test(m[1]));
  igual(juntas.length, 0,
    "la firma volvio a la linea del ritmo: un titulo largo se la come");
});

await prueba("las dos listas ensenan los mismos datos", () => {
  /* La del profesor y el catalogo se construyen aparte. Cuando cada una se
     armaba sus lineas, cambiar una y olvidar la otra era cuestion de tiempo. */
  const usos = [...FUENTE.matchAll(/ponerDatos\(/g)].length;
  afirmar(usos >= 3, "las listas volvieron a armarse los datos por su cuenta");
});

await prueba("al editar se ve que cancion se esta editando", () => {
  /* El formulario es identico para todas: sin el nombre a la vista no hay
     forma de saber cual se toco. */
  afirmar(/id="e-cual"/.test(HTML), "falta el hueco para el nombre");
  afirmar(/\$\("e-cual"\)\.textContent/.test(FUENTE), "el nombre nunca se rellena");
});

await prueba("el nombre del profesor sale de la cuenta, no se escribe a mano", () => {
  /* Escribirlo en cada cancion fue el fallo original: dos profesores llamados
     "Gabriel" daban dos "La Bachata · Gabriel" sin forma de saber cual era de
     quien. Si vuelve la casilla para teclearlo, vuelve el problema entero. */
  afirmar(!/<input[^>]*id="f-teacher"/.test(HTML),
    "volvio la casilla para escribir el nombre a mano en cada cancion");
  afirmar(/teacher:\s*miNombreDeProfesor\(\)/.test(FUENTE),
    "la cancion ya no se firma con el nombre de la cuenta");
});

await prueba("al sincronizar no se sube el nombre viejo del telefono", () => {
  /* Este llego a produccion. Cambiabas tu nombre, el servidor renombraba tus
     canciones, y un segundo despues la sincronizacion las volvia a subir con
     el nombre viejo que seguia guardado en el telefono: el cambio se deshacia
     solo. Y como el perfil SI cambiaba, parecia que habia funcionado.
     Cuatro de las seis canciones reales volvieron al nombre anterior. */
  const cuerpo = FUENTE.slice(FUENTE.indexOf("const songToRow"),
                              FUENTE.indexOf("const scoreToRow"));
  const firma = /teacher:\s*([^,]+),/.exec(cuerpo);
  afirmar(firma, "no encuentro con que se firma la cancion al subirla");
  afirmar(/miNombreDeProfesor\(\)/.test(firma[1]),
    "lo que se sube es el nombre guardado en el telefono: pisa el de la cuenta");
  afirmar(!/^\s*s\.teacher/.test(firma[1]),
    "el nombre del telefono manda sobre el de la cuenta");
});

await prueba("sin nombre no se deja grabar", () => {
  /* Una cancion sin firma sale al catalogo y nadie sabe de quien es. Peor:
     hay que ir a corregirla despues, una por una. */
  const cuerpo = FUENTE.slice(FUENTE.indexOf("function avisarNombre"),
                              FUENTE.indexOf("async function guardarNombre"));
  afirmar(/disabled\s*=\s*!!cloud\.session && !nombre/.test(cuerpo),
    "el boton de grabar ya no se bloquea cuando falta el nombre");
});

await prueba("el nombre lo cambia el servidor de una sola vez", () => {
  /* Renombrar el perfil y renombrar las canciones son dos pasos. Hechos desde
     aqui, si el segundo falla el nombre queda partido y el catalogo muestra el
     viejo para siempre. Por eso va todo en una sola llamada. */
  const cuerpo = FUENTE.slice(FUENTE.indexOf("async function guardarNombre"),
                              FUENTE.indexOf('$("ac-name-save").addEventListener'));
  afirmar(/rpc\/cambiar_nombre/.test(cuerpo), "ya no le pide el cambio al servidor");
  afirmar(!/rest\(\s*"songs\?/.test(cuerpo),
    "renombra las canciones por su cuenta: puede quedarse a medias");
  afirmar(!/profiles\?select=display_name/.test(FUENTE),
    "comprueba el nombre leyendo los perfiles: eso deja listar a los profesores");
});

await prueba("los rechazos del servidor tienen respuesta en la pantalla", () => {
  /* El servidor rechaza con una palabra suelta -ocupado, largo, vacio- y la
     app la convierte en algo entendible. Si alguien cambia una palabra en la
     base y no aqui, al usuario le aparece el error crudo del servidor. */
  const sql = readFileSync(new URL("../db/06-nombre-de-profesor.sql", import.meta.url), "utf8");
  const avisos = [...sql.matchAll(/raise exception '([a-z]+)'/g)].map(m => m[1]);
  afirmar(avisos.length >= 3, "no encuentro los rechazos en el archivo de la base");
  const cuerpo = FUENTE.slice(FUENTE.indexOf("async function guardarNombre"),
                              FUENTE.indexOf('$("ac-name-save").addEventListener'));
  for (const aviso of avisos) {
    afirmar(new RegExp(`/${aviso}/`).test(cuerpo),
      `la base rechaza con "${aviso}" y la app no sabe que contestar`);
  }
});

await prueba("la app se llama igual en todos lados", () => {
  /* El nombre estaba en cinco sitios: la pestana del navegador, la barra de
     arriba, el titulo de iOS y las dos formas del manifiesto. Quedo el nombre
     provisorio de trabajo en todos ellos mientras el dominio ya decia otra
     cosa, y quien abria la app veia un nombre que no era el suyo. */
  const manifiesto = JSON.parse(
    readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
  const nombre = manifiesto.short_name;
  afirmar(nombre && nombre.length > 2, "el manifiesto no dice como se llama");

  const sitios = {
    "la pestana del navegador": /<title>([^<]+)<\/title>/.exec(HTML),
    "el titulo en iPhone": /apple-mobile-web-app-title" content="([^"]+)"/.exec(HTML),
    "la barra de arriba": /<div class="brand">.*?<b>([^<]+)<\/b>/s.exec(HTML)
  };
  for (const [donde, m] of Object.entries(sitios)) {
    afirmar(m, "no encuentro el nombre en " + donde);
    afirmar(m[1].includes(nombre),
      `en ${donde} la app se llama "${m[1]}" y en el manifiesto "${nombre}"`);
  }
  afirmar(manifiesto.name.includes(nombre),
    `el manifiesto se contradice a si mismo: "${manifiesto.name}" y "${nombre}"`);
});

/* ------------------------------------------------------------------------ */
seccion("La puerta y el orden de las pantallas");

/* Antes se entraba directamente a la app y la cuenta era un boton de arriba
   que casi nadie tocaba. Resultado: gente grabando canciones sin sesion, que
   se quedaban en su telefono y no subian a ningun lado. Ahora sin cuenta no
   hay app. */

await prueba("se arranca fuera aunque el codigo no llegue a correr", () => {
  afirmar(/<body class="[^"]*\bfuera\b/.test(HTML),
    "la pagina nace abierta: si el codigo tardara, se veria la app sin sesion");
});

await prueba("estando fuera no se dibuja nada de la app", () => {
  /* Se esconde desde el CSS y no elemento por elemento: asi no depende de que
     alguien se acuerde de esconder tambien la pantalla que anada manana. */
  const regla = /((?:body\.fuera[^,{]*,\s*)*body\.fuera[^,{]*)\{([^}]*)\}/.exec(SOLO_HTML);
  afirmar(regla, "no hay ninguna regla que esconda la app estando fuera");
  afirmar(/display:\s*none/.test(regla[2]), "la regla de fuera no esconde nada");
  for (const que of [".tabs", ".panel", "#acct", "#acct-toggle"]) {
    afirmar(regla[1].includes(que), "estando fuera se sigue viendo " + que);
  }
  afirmar(/body:not\(\.fuera\)\s*#gate\s*\{[^}]*display:\s*none/.test(SOLO_HTML),
    "la puerta se queda puesta despues de entrar");
});

await prueba("la puerta pregunta lo justo: entrar o crear la cuenta", () => {
  const puerta = /<section id="gate">([\s\S]*?)<\/section>/.exec(SOLO_HTML);
  afirmar(puerta, "no encuentro la puerta");
  for (const id of ["ac-email", "ac-pass", "ac-in", "ac-up", "ac-forgot"]) {
    afirmar(puerta[1].includes('id="' + id + '"'),
      "falta " + id + " en la puerta: no se podria entrar");
  }
  afirmar(!puerta[1].includes('id="ac-name"'),
    "el nombre de profesor no va en la puerta: se elige despues, en los ajustes");
});

await prueba("la primera pantalla es la del alumno", () => {
  /* Ver la cuenta es lo de todos los dias; grabar una cancion lo hace un
     profesor de vez en cuando. Lo primero que se ve tiene que ser lo primero
     que se usa. */
  const orden = [...SOLO_HTML.matchAll(/id="tab-(\w+)"/g)].map(m => m[1]);
  igual(orden[0], "alum", "la primera pestana es " + orden[0]);
  afirmar(/id="tab-alum"[^>]*aria-selected="true"/.test(SOLO_HTML),
    "la pestana del alumno no arranca marcada");
  afirmar(!/id="panel-alum"[^>]*\shidden/.test(SOLO_HTML),
    "la pantalla del alumno arranca escondida");
  afirmar(/id="panel-prof"[^>]*\shidden/.test(SOLO_HTML),
    "arrancan dos pantallas a la vez");
});

await prueba("los ajustes se abren con el engranaje", () => {
  const boton = /<button class="iconbtn" id="acct-toggle"[\s\S]*?<\/button>/.exec(SOLO_HTML);
  afirmar(boton, "no encuentro el boton de ajustes");
  afirmar(boton[0].includes("#g-gear"),
    "el boton de ajustes no es un engranaje: se confundiria con otra cosa");
  afirmar(/<g id="g-gear">/.test(SOLO_HTML), "el engranaje no esta dibujado");
});

await prueba("el aviso se escribe donde se esta mirando", () => {
  /* Al entrar, el mensaje nace en la puerta y termina dentro de la app. Si
     solo se escribiera en uno de los dos sitios, la mitad de los avisos
     -«email o contrasena incorrectos»- caerian en una pantalla invisible. */
  const f = /function setAc\([\s\S]*?\n\}/.exec(FUENTE);
  afirmar(f, "no encuentro setAc");
  for (const id of ["ac-status", "gate-status"]) {
    afirmar(f[0].includes(id), "setAc no escribe en " + id);
  }
});

await prueba("volver desde el correo no abre la app de par en par", () => {
  /* El enlace del correo trae sesion valida. Si eso bastara para abrir, el
     formulario de la clave nueva quedaria detras de la app y nadie lo
     encontraria: se entro sin saber ninguna contrasena. */
  afirmar(/pidiendoClave\s*=\s*true/.test(FUENTE),
    "al volver del correo no se marca que falta elegir clave");
  afirmar(/const on = !!cloud\.session && !pidiendoClave/.test(FUENTE),
    "tener sesion basta para abrir, aunque la clave este a medias");
  afirmar(/pidiendoClave\s*=\s*false/.test(FUENTE),
    "una vez elegida la clave nunca se abre la app");
});

await prueba("al salir se vuelve a la puerta y se suelta el microfono", () => {
  const salir = /\$\("ac-out"\)\.addEventListener\([\s\S]*?\n\}\);/.exec(FUENTE);
  afirmar(salir, "no encuentro el boton de salir");
  for (const [que, aviso] of [
    ["stopStudent", "se sale con el microfono abierto"],
    ["renderAccount", "se sale y la pantalla se queda como estaba"],
    ["toggleCuenta(false)", "los ajustes se quedan abiertos detras de la puerta"]
  ]) {
    afirmar(salir[0].includes(que), aviso);
  }
});

await prueba("la clave se puede cambiar desde dentro", () => {
  afirmar(/id="ac-chpass-save"/.test(SOLO_HTML),
    "para cambiar la clave hay que pedirse un correo a uno mismo");
  afirmar(/\$\("ac-chpass-save"\)\.addEventListener/.test(FUENTE),
    "el boton de cambiar la clave no hace nada");
});

/* ------------------------------------------------------------------------ */
seccion("Una sola cosa que hacer");

/* La pantalla del alumno ensenaba todo a la vez: el selector de modo, la
   cuenta en blanco, los mandos del juego, parar y vibrar apagados. Una docena
   de cosas delante y una sola que servia. */

await prueba("al abrir solo se ofrece escuchar", () => {
  for (const id of ["a-mode", "a-guide", "a-game", "a-stop", "a-vibe"]) {
    afirmar(new RegExp('id="' + id + '"[^>]*\\shidden').test(SOLO_HTML),
      id + " se ve antes de que suene nada");
  }
  afirmar(!/id="a-start"[^>]*\shidden/.test(SOLO_HTML),
    "el boton de escuchar arranca escondido: no quedaria nada que tocar");
});

await prueba("esconder le gana a cualquier display", () => {
  /* Un boton con hidden que el navegador seguia dibujando porque una regla de
     mas abajo le ponia display:flex. Paso dos veces. */
  afirmar(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(SOLO_HTML),
    "sin la regla general, cualquier display:flex vuelve a sacar lo escondido");
});

await prueba("con el microfono abierto siempre se puede cerrar", () => {
  /* Si parar dependiera de haber reconocido algo, quien pone una cancion que
     la app no conoce se queda grabando sin salida. */
  const f = /function pintarAlumno\(\)[\s\S]*?\n\}/.exec(FUENTE);
  afirmar(f, "no encuentro pintarAlumno");
  afirmar(/escuchando\s*=\s*!!student\.listener/.test(f[0]),
    "parar no mira si el microfono esta abierto");
  afirmar(/\$\("a-stop"\)\.hidden\s*=\s*!escuchando/.test(f[0]),
    "parar aparece por otra razon que no es tener el microfono abierto");
  afirmar(/\$\("a-mode"\)\.hidden\s*=\s*!hay/.test(f[0]),
    "el selector de modo no espera a que haya cancion");
});

await prueba("el resultado del juego no se borra al parar", () => {
  const f = /function pintarAlumno\(\)[\s\S]*?\n\}/.exec(FUENTE);
  afirmar(/g-result/.test(f[0]),
    "parar el microfono le borraria a alguien la partida que acaba de terminar");
});

await prueba("del boton de sonido no queda nada", () => {
  /* Se quito entero, no solo el boton: un interruptor que no se puede tocar
     pero sigue en el codigo es una trampa para el que venga despues. */
  for (const rastro of ["a-voice", "student.voice", "g-sound", "g-mute", "function speak"]) {
    afirmar(!FUENTE.includes(rastro) && !SOLO_HTML.includes(rastro),
      "queda un rastro del sonido: " + rastro);
  }
});

/* ------------------------------------------------------------------------ */
seccion("Instalar la app");

await prueba("el boton solo aparece si el navegador deja instalar", () => {
  /* En iPhone no se puede, y ensenar un boton que no hace nada es peor que no
     tener boton. */
  for (const id of ["instalar", "instalar-puerta"]) {
    afirmar(new RegExp('id="' + id + '"[^>]*\\shidden').test(SOLO_HTML),
      id + " se ve aunque el navegador no haya dicho que se puede instalar");
  }
  afirmar(/addEventListener\("beforeinstallprompt"/.test(FUENTE),
    "nadie escucha cuando el navegador avisa que se puede instalar");
  afirmar(/function pintarInstalar\(\)/.test(FUENTE), "el boton no se enciende nunca");
});

await prueba("el aviso del navegador es de un solo uso y se trata como tal", () => {
  const f = /async function instalar\(\)[\s\S]*?\n\}/.exec(FUENTE);
  afirmar(f, "no encuentro la funcion de instalar");
  afirmar(/invitacion\s*=\s*null/.test(f[0]),
    "se guarda el aviso para usarlo otra vez, y no se puede");
  afirmar(f[0].includes("pintarInstalar()"),
    "el boton se queda puesto prometiendo algo que ya no va a pasar");
});

/* ------------------------------------------------------------------------ */
seccion("El reloj del audio");

await prueba("capturar audio no depende de que se dibuje la pantalla", () => {
  /* requestAnimationFrame es el reloj del DIBUJO. Si el telefono va justo o el
     navegador ahorra bateria, deja de llamar. Medido en el telefono de
     Gabriel: 5,2 frames por segundo de los 21,6 que hacen falta. Tres de cada
     cuatro perdidos, y como las parejas de la huella se hacen a distancias
     fijas de frames, casi ninguna llegaba a formarse. La app oia bien, el
     microfono estaba perfecto, y no reconocia nada. */
  afirmar(!/requestAnimationFrame\s*\(/.test(FUENTE),
    "el audio vuelve a colgar del dibujo de la pantalla");
});

await prueba("al parar se sueltan los dos caminos del audio", () => {
  /* Hay dos formas de capturar: el hilo del audio, y el nodo de respaldo para
     navegadores que no lo tienen. Las dos siguen trabajando -y leyendo el
     microfono- si nadie las desconecta. */
  const parar = /\n  stop\(\) \{[\s\S]*?\n  \}/.exec(FUENTE);
  afirmar(parar, "no encuentro donde se para");
  for (const [que, aviso] of [
    ["this.nodo", "el nodo del hilo de audio se queda enchufado"],
    ["this.proceso", "el nodo de respaldo se queda enchufado"],
    ["getTracks", "no se suelta el microfono"]
  ]) {
    afirmar(parar[0].includes(que), aviso);
  }
});

await prueba("los dos caminos usan el mismo convertidor", () => {
  /* Dos copias del mismo calculo acaban diferenciandose, y entonces un
     telefono reconoce lo que otro no, sin que nadie sepa por que. El de
     respaldo monta LA MISMA clase que corre en el hilo del audio. */
  afirmar(/function obreroEnCasa\(/.test(FUENTE),
    "el camino de respaldo no reutiliza el obrero");
  afirmar(/obreroEnCasa\(\{ tam: TAM, paso: PASO, razon: RAZON \}/.test(FUENTE),
    "el camino de respaldo no convierte con los mismos numeros");
  const copias = (FUENTE.match(/this\.pos \+= this\.razon/g) || []).length;
  igual(copias, 1, "hay mas de una copia del que convierte la frecuencia");
});

/* ------------------------------------------------------------------------ */
seccion("Al microfono no se le toca");

await prueba("nadie le cambia los ajustes al microfono en caliente", () => {
  /* Duro un dia. Se le encendia la ganancia automatica al vuelo cuando la
     senal saturaba, con applyConstraints. Resultado: el telefono de Gabriel,
     que reconocia bien, dejo de reconocer. Cambiarle los ajustes a un
     microfono que ya esta capturando reinicia la captura, y eso pisa
     justamente el audio que se esta comparando.

     La leccion no es "applyConstraints es malo": es que el arreglo salio de
     una teoria que yo no podia comprobar, y se probo encima de lo unico que
     funcionaba. */
  afirmar(!/applyConstraints\s*\(/.test(FUENTE),
    "se le vuelven a tocar los ajustes al microfono con la captura abierta");
});

await prueba("del microfono solo se pide el permiso y el apagado", () => {
  /* Lo unico que la app tiene derecho a hacer con la captura es abrirla y
     cerrarla. Cualquier otra orden a mitad de camino es tocar el suelo que se
     esta pisando. */
  const usos = [...FUENTE.matchAll(/\.getAudioTracks\(\)[^\n;]*/g)].map(m => m[0]);
  for (const uso of usos) {
    afirmar(/^\.getAudioTracks\(\)(\[0\])?$/.test(uso.trim()),
      "se hace algo raro con la captura: " + uso.trim());
  }
  const pistas = [...FUENTE.matchAll(/getTracks\(\)\.forEach\(\w+ => \w+\.(\w+)\(\)/g)]
    .map(m => m[1]);
  igual(pistas.join(","), "stop", "a las pistas se les hace algo mas que pararlas");
});

/* ------------------------------------------------------------------------ */
seccion("Sincronizar sin que nadie lo pida");

/* Tener que acordarse de tocar un boton despues de grabar es una forma segura
   de perder canciones: quien graba y cierra la app se queda con el trabajo en
   el telefono y nadie mas lo ve. */

await prueba("se sincroniza en los momentos que importan", () => {
  for (const [donde, marca] of [
    ["al arrancar la app", /avisarNombre\(\);\s*\n[\s\S]{0,120}sincronizarSolo\(true\)/],
    ["al guardar una cancion", /setP\(t\("saved"\)[\s\S]{0,220}sincronizarSolo\(true\)/],
    ["al ponerse a escuchar", /\$\("a-start"\)\.addEventListener[\s\S]{0,400}sincronizarSolo\(\)/]
  ]) {
    afirmar(marca.test(FUENTE), "no se sincroniza " + donde);
  }
});

await prueba("la sincronizacion automatica no bloquea nada", () => {
  /* Si alguna de estas llamadas se esperara, tocar Escuchar se quedaria
     colgado hasta que conteste el servidor. Con mala cobertura, eso son
     segundos mirando una pantalla muerta en mitad de una clase. */
  const esperadas = [...FUENTE.matchAll(/await sincronizarSolo/g)];
  igual(esperadas.length, 0,
    "hay " + esperadas.length + " sitios donde la app espera a la sincronizacion");
});

await prueba("si falla se calla", () => {
  /* La app funciona sin nube. Un cartel de error a mitad de una clase, por
     algo que la persona no pidio y no puede arreglar, es peor que no haber
     sincronizado. */
  const f = /async function sincronizarSolo\(urgente\)[\s\S]*?\n\}/.exec(FUENTE);
  afirmar(f, "no encuentro la sincronizacion automatica");
  afirmar(/catch \(e\) \{/.test(f[0]), "un fallo de red tira la app");
  afirmar(!/setAc\(|setP\(|setA\(|alert\(/.test(f[0]),
    "la sincronizacion automatica interrumpe con carteles");
});

await prueba("no se pisa consigo misma ni con el boton", () => {
  const f = /async function sincronizarSolo\(urgente\)[\s\S]*?\n\}/.exec(FUENTE);
  afirmar(/sincronizando/.test(f[0]), "dos sincronizaciones pueden correr a la vez");
  const manual = /async function doSync\(\)[\s\S]*?\n\}/.exec(FUENTE);
  afirmar(/sincronizando/.test(manual[0]),
    "el boton manual puede arrancar encima de una automatica");
});

await prueba("lo recien grabado no espera al reloj", () => {
  /* Hay un limite de una sincronizacion cada tanto para no molestar al
     servidor, pero acabar de grabar tiene que saltarselo: hasta que suba, esa
     cancion no la tiene nadie mas. */
  const f = /async function sincronizarSolo\(urgente\)[\s\S]*?\n\}/.exec(FUENTE);
  afirmar(/if \(!urgente && /.test(f[0]),
    "el limite de tiempo se aplica tambien a lo que acaba de grabarse");
});

/* ------------------------------------------------------------------------ */
seccion("Los ajustes, en dos grupos");

await prueba("lo de la cuenta esta junto y lo demas aparte", () => {
  const cuenta = /<div id="ajustes-cuenta">([\s\S]*?)\n      <\/div>/.exec(SOLO_HTML);
  const app = /<div id="ajustes-app"[^>]*>([\s\S]*?)\n      <\/div>/.exec(SOLO_HTML);
  afirmar(cuenta, "no encuentro el grupo de la cuenta");
  afirmar(app, "no encuentro el grupo de la app");
  for (const id of ["ac-name", "ac-chpass", "ac-who", "ac-out"]) {
    afirmar(cuenta[1].includes('id="' + id + '"'), id + " deberia estar en Tu cuenta");
  }
  for (const id of ["ac-subbtn", "ac-sync"]) {
    afirmar(app[1].includes('id="' + id + '"'), id + " no deberia estar en Tu cuenta");
  }
});

await prueba("la contrasena se pide dos veces", () => {
  /* No se ve lo que se escribe. Una errata en una contraseña que no se repite
     deja a alguien fuera de su cuenta y de sus canciones, y solo se entera al
     volver a entrar. */
  afirmar(/id="ac-chpass2"/.test(SOLO_HTML), "solo se pide una vez");
  const f = /\$\("ac-chpass-save"\)\.addEventListener[\s\S]*?\n\}\);/.exec(FUENTE);
  afirmar(f, "no encuentro el guardado de la contraseña");
  afirmar(/pass !== otra/.test(f[0]), "no se comprueba que las dos coincidan");
  afirmar(/passMismatch/.test(f[0]), "no se avisa cuando no coinciden");
  const orden = f[0].indexOf("pass !== otra") < f[0].indexOf("setPassword");
  afirmar(orden, "se cambia la contraseña antes de comprobar que coincidan");
});

/* ------------------------------------------------------------------------ */
seccion("El catalogo comun");

await prueba("una cancion recien grabada nace gratis", () => {
  /* El servidor lo pone por defecto, pero si el telefono no hiciera lo mismo,
     quien acaba de grabarla la veria de pago en su propia pantalla hasta la
     siguiente sincronizada. */
  const f = /\$\("p-save"\)\.addEventListener[\s\S]*?\n\}\);/.exec(FUENTE);
  afirmar(f, "no encuentro el guardado de una cancion");
  afirmar(/free:\s*true/.test(f[0]), "la cancion nueva no nace gratis");
});

await prueba("el administrador puede quitar del catalogo", () => {
  afirmar(/function borrarDelCatalogo/.test(FUENTE), "no hay forma de quitar una cancion");
  afirmar(/admDel\b/.test(FUENTE), "el boton de quitar no existe en la lista");
  const f = /async function borrarDelCatalogo[\s\S]*?\n\}/.exec(FUENTE);
  afirmar(/method:\s*"DELETE"/.test(f[0]), "no se borra en el servidor");
  afirmar(/DB\.del\([^)]*"catalog"\)/.test(f[0]), "queda en el catalogo de este telefono");
});

await prueba("quitar pide dos toques", () => {
  /* Esta pegado al boton de gratis, se usa con el pulgar, y borra el trabajo
     de otra persona sin papelera de la que sacarlo. */
  const f = /x\.addEventListener\("click"[\s\S]*?\n    \}\);/.exec(FUENTE);
  afirmar(f, "no encuentro el boton de quitar");
  afirmar(/admDelSure/.test(f[0]), "borra al primer toque");
  afirmar(/setTimeout/.test(f[0]), "el «¿seguro?» se queda puesto para siempre");
});

await prueba("el servidor deja moderar, no solo al dueno", () => {
  const sql = readFileSync(
    new URL("../db/09-gratis-por-defecto-y-moderacion.sql", import.meta.url), "utf8");
  afirmar(/alter column free set default true/i.test(sql),
    "el valor por defecto de gratis no cambia");
  const pol = /create policy songs_delete[\s\S]*?;/.exec(sql);
  afirmar(pol, "no se toca quien puede borrar");
  afirmar(/is_admin\(auth\.uid\(\)\)/.test(pol[0]),
    "el administrador sigue sin poder quitar canciones ajenas");
  afirmar(/owner = auth\.uid\(\)/.test(pol[0]),
    "el dueno se quedaria sin poder borrar las suyas");
});

/* ------------------------------------------------------------------------ */
seccion("Irse del todo");

/* Google Play no deja publicar una app con cuentas si no se pueden borrar
   desde dentro. Pero aunque no lo pidiera: quien da su correo y su microfono
   tiene derecho a irse sin escribirle a nadie y sin esperar a que alguien se
   acuerde de atenderle. */

await prueba("se puede borrar la cuenta desde los ajustes", () => {
  const cuenta = /<div id="ajustes-cuenta">([\s\S]*?)\n      <\/div>/.exec(SOLO_HTML);
  afirmar(cuenta, "no encuentro el grupo de la cuenta");
  afirmar(cuenta[1].includes('id="ac-del"'), "no hay boton de borrar la cuenta");
  afirmar(/\$\("ac-del-go"\)\.addEventListener/.test(FUENTE), "el boton no hace nada");
  afirmar(/rpc\/borrar_mi_cuenta/.test(FUENTE),
    "no se le pide al servidor que borre la cuenta");
});

await prueba("no borra al primer toque: hay que escribir la palabra", () => {
  /* Un "¿estas seguro?" se contesta que si sin leerlo. Y esto no es como
     borrar una cancion, que se recupera durante 30 dias: aqui no hay vuelta. */
  const f = /\$\("ac-del-go"\)\.addEventListener[\s\S]*?\n\}\);/.exec(FUENTE);
  afirmar(f, "no encuentro el borrado");
  afirmar(/delWord/.test(f[0]), "no se comprueba ninguna palabra escrita a mano");
  afirmar(f[0].indexOf("delWord") < f[0].indexOf("borrar_mi_cuenta"),
    "se llama al servidor antes de comprobar la palabra");
});

await prueba("al borrar no queda nada guardado en el telefono", () => {
  /* Si se borra la cuenta en el servidor y aqui quedan las canciones, el
     siguiente que entre en ese telefono se encuentra las del anterior. */
  const f = /\$\("ac-del-go"\)\.addEventListener[\s\S]*?\n\}\);/.exec(FUENTE);
  for (const cajon of ["songs", "scores", "catalog"]) {
    afirmar(f[0].includes('"' + cajon + '"'), "no se vacia " + cajon);
  }
  afirmar(/DB\.vaciar/.test(f[0]), "no se vacia lo guardado aqui");
  afirmar(/signOut\(\)/.test(f[0]), "se borra la cuenta pero la sesion sigue abierta");
});

await prueba("primero el servidor y despues el telefono", () => {
  /* Al reves, si el servidor fallara, la persona se quedaria sin sus
     canciones aqui y con la cuenta viva alla: el peor de los dos mundos. */
  const f = /\$\("ac-del-go"\)\.addEventListener[\s\S]*?\n\}\);/.exec(FUENTE);
  afirmar(f[0].indexOf("borrar_mi_cuenta") < f[0].indexOf("DB.vaciar"),
    "se borra lo del telefono antes de saber si el servidor pudo");
});

await prueba("el servidor solo deja que cada uno se borre a si mismo", () => {
  const sql = readFileSync(new URL("../db/08-borrar-cuenta.sql", import.meta.url), "utf8");
  afirmar(/security definer/i.test(sql), "sin security definer no podria tocar auth.users");
  afirmar(/auth\.uid\(\)/.test(sql),
    "no usa auth.uid(): habria que decirle a quien borrar, y entonces se podria pedir otro");
  afirmar(/create or replace function public\.borrar_mi_cuenta\(\)/.test(sql),
    "la funcion recibe parametros: quien se borra no puede venir de fuera");
  afirmar(/revoke[\s\S]*anon/i.test(sql), "no se le quita el permiso a quien no tiene sesion");
});

await prueba("la politica de privacidad existe, esta enlazada y se puede contestar", () => {
  const pol = readFileSync(new URL("../privacidad.html", import.meta.url), "utf8");
  afirmar(/privacidad\.html/.test(SOLO_HTML), "no se enlaza desde la app");
  afirmar(/@/.test(pol), "no hay correo de contacto, y Google Play lo exige");
  afirmar(!/feeltheone\.app@gmail/.test(pol),
    "quedo el correo de marcador, que no existe: Play manda gente ahi y rebotaria");
});

/* ------------------------------------------------------------------------ */
seccion("El telefono se comprueba solo");

/* El problema de fondo de estos dias no fue el codigo: fue que para saber si
   algo andaba habia que pedirle a alguien que probara en su telefono y contara
   lo que veia. Con veinte personas y veinte teléfonos eso no escala, y encima
   obliga a interpretar numeros a quien no tiene por que. */

await prueba("hay un boton que comprueba el telefono", () => {
  afirmar(/id="diag-probar"/.test(SOLO_HTML), "no hay boton de comprobacion");
  afirmar(/id="diag-prueba"/.test(SOLO_HTML), "no hay donde poner el resultado");
  afirmar(/\$\("diag-probar"\)\.addEventListener/.test(FUENTE),
    "el boton no hace nada");
});

await prueba("la comprobacion prueba lo que estuvo roto", () => {
  /* Grabar a una frecuencia y reconocer desde OTRA: ese fue el fallo. Una
     comprobacion que solo mirara la misma frecuencia habria dado verde
     mientras la app estaba rota. */
  const f = /async function comprobarReconocedor\(\)[\s\S]*?\n\}/.exec(FUENTE);
  afirmar(f, "no encuentro la comprobacion");
  afirmar(/GRABA = 48000, OYE = 44100/.test(f[0]),
    "la comprobacion no graba en una frecuencia y escucha en otra");
  afirmar(/selfInvents/.test(f[0]),
    "no comprueba que no invente canciones que no estan");
  afirmar(/hilo/.test(f[0]), "no comprueba si hay hilo de audio");
});

await prueba("la cancion de prueba no se repite a si misma", () => {
  /* Con pocos acordes la cancion se parece a si misma cada pocos segundos, y
     eso confunde al reconocedor: la comprobacion suspenderia a un telefono
     sano. Paso, con 12 acordes. Una prueba que asusta sin motivo es peor que
     no tenerla. */
  const f = /function musiquita\(semilla\)[\s\S]*?\n\}/.exec(FUENTE);
  afirmar(f, "no encuentro la cancion de prueba");
  const n = /Array\.from\(\{ length: (\d+) \}, \(\) =>\s*\n?\s*Array\.from\(\{ length: 4 \}/.exec(f[0]);
  afirmar(n, "no encuentro cuantos acordes tiene la cancion de prueba");
  afirmar(Number(n[1]) >= 70,
    "la cancion de prueba se repite: solo tiene " + n[1] + " acordes");
});

/* ------------------------------------------------------------------------ */
seccion("Que la gente reciba las versiones nuevas");

/* Durante dias hubo que decirle a la gente "abrila dos veces". Nadie recuerda
   eso, y mientras tanto nadie sabia que version estaba probando cada uno: se
   discutio sobre codigo que no era el que corria. Eran dos cosas a la vez, y
   las dos estan aqui. */

const SW = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const CABECERAS = readFileSync(new URL("../_headers", import.meta.url), "utf8");

await prueba("la app se pide a la red antes que a la copia guardada", () => {
  /* La pagina ES el programa: si hay version nueva tiene que llegar hoy. Los
     iconos pueden salir de la copia, que no cambian y hacen que abra rapido. */
  afirmar(/function esLaApp\(/.test(SW), "no distingue la app de los archivos sueltos");
  afirmar(/primeroLaRed/.test(SW), "no hay forma de pedir primero a la red");
  const decide = /esLaApp\(req, url\) \? (\w+)\(req\) : (\w+)\(req\)/.exec(SW);
  afirmar(decide, "no encuentro donde se decide");
  igual(decide[1], "primeroLaRed", "la app sale de la copia: se veria la version vieja");
  igual(decide[2], "primeroLaCopia", "los iconos se piden a la red y la app abre lenta");
});

await prueba("sin internet la app abre igual", () => {
  /* Medio motivo de que exista el service worker. Pedir primero a la red no
     puede significar quedarse en blanco cuando no hay red. */
  const f = /async function primeroLaRed\(req\)[\s\S]*?\n\}/.exec(SW);
  afirmar(f, "no encuentro como se pide a la red");
  afirmar(/caches\.match\(req\)/.test(f[0]), "no se busca la copia guardada");
  afirmar(/if \(guardada\) return guardada/.test(f[0]),
    "si falla la red no se cae en la copia: pantalla en blanco sin señal");
  afirmar(/ESPERA/.test(f[0]),
    "se espera a la red sin limite: con mala señal la app no abre nunca");
});

await prueba("no se espera a la red eternamente", () => {
  const e = /const ESPERA = (\d+)/.exec(SW);
  afirmar(e, "no hay limite de espera");
  const ms = Number(e[1]);
  afirmar(ms >= 1000 && ms <= 5000,
    "esperar " + ms + " ms esta mal: o enseña lo viejo, o deja la pantalla muerta");
});

await prueba("las cabeceras preparadas piden que se pregunte siempre", () => {
  /* OJO con lo que prueba esto: _headers HOY NO RIGE. Lo leerian Cloudflare o
     Netlify; GitHub Pages, donde vive la app, lo ignora. Lo que arregla el
     problema hoy es el service worker pidiendo la pagina con "reload".

     Se comprueba igual para que el archivo no envejezca mal: si algun dia se
     muda de sitio, tiene que estar bien escrito, y nadie se va a acordar de
     revisarlo ese dia. */
  for (const ruta of ["/index.html", "/sw.js"]) {
    const bloque = new RegExp(ruta.replace(/[/.]/g, "\\$&") + "\\s*\\n\\s*Cache-Control: ([^\\n]+)");
    const m = bloque.exec(CABECERAS);
    afirmar(m, "no se dice como guardar " + ruta);
    afirmar(/no-cache|no-store|max-age=0/.test(m[1]),
      ruta + " se puede servir viejo sin preguntar: " + m[1]);
  }
});

await prueba("los iconos si se guardan, que si no la app abre lenta", () => {
  const m = /icono-192\.png\s*\n\s*Cache-Control: ([^\n]+)/.exec(CABECERAS);
  afirmar(m, "no se dice como guardar los iconos");
  afirmar(/max-age=\d{4,}/.test(m[1]), "los iconos se piden cada vez: " + m[1]);
});

/* ------------------------------------------------------------------------ */
seccion("Lo que se publica y lo que no");

await prueba("se publica la app entera y nada mas", () => {
  /* El repositorio tiene pruebas, el esquema de la base y notas. Nada de eso
     es secreto, pero tampoco tiene por que estar colgado en internet. */
  const guion = readFileSync(new URL("../construir.sh", import.meta.url), "utf8");
  const lista = /ARCHIVOS=\(([\s\S]*?)\)/.exec(guion);
  afirmar(lista, "no encuentro la lista de lo que se publica");
  const publicados = lista[1].split("\n")
    .map(l => l.replace(/#.*/, "").trim()).filter(Boolean);

  for (const hace_falta of ["index.html", "sw.js", "manifest.webmanifest", "_headers"]) {
    afirmar(publicados.includes(hace_falta),
      "no se publica " + hace_falta + ", y la app no anda sin eso");
  }

  /* Y todo lo que la app pide por su nombre tiene que estar en la lista, o se
     publica una app a la que le falta un pedazo. */
  const pedidos = new Set();
  for (const m of HTML.matchAll(/(?:src|href)="\.?\/?([\w.-]+\.(?:png|webmanifest|js))"/g)) {
    pedidos.add(m[1]);
  }
  const manifiesto = JSON.parse(
    readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
  for (const i of manifiesto.icons) pedidos.add(i.src.replace(/^\.?\//, ""));
  for (const m of SW.matchAll(/"\.\/([\w.-]+\.(?:png|html|webmanifest))"/g)) pedidos.add(m[1]);

  const faltan = [...pedidos].filter(f => !publicados.includes(f));
  afirmar(!faltan.length, "la app pide archivos que no se publican: " + faltan.join(", "));

  for (const prohibido of ["tests", "db", "CLAUDE.md", "servidor.py", ".claves"]) {
    afirmar(!publicados.some(f => f.includes(prohibido)),
      "se estaria publicando algo que no toca: " + prohibido);
  }
});

/* ------------------------------------------------------------------------ */
seccion("La version a la vista");

/* La app se guarda en el telefono para abrirse sin internet, asi que la
   primera vez despues de un cambio se ve la copia vieja. Sin un numero
   delante se pierde el tiempo discutiendo sobre codigo que no es el que
   corre: paso, y por eso Gabriel lo pidio. */

const VERSION = /const VERSION = "([^"]+)"/.exec(FUENTE);

await prueba("hay un numero de version y tiene forma de version", () => {
  afirmar(VERSION, "no encuentro la version en el codigo");
  afirmar(/^\d+\.\d+\.\d+$/.test(VERSION[1]),
    'la version es "' + VERSION[1] + '" y deberia ser tipo 2.10.0');
});

await prueba("la version se ve al lado del nombre", () => {
  const marca = /<div class="brand">[\s\S]*?<\/div>/.exec(SOLO_HTML);
  afirmar(marca, "no encuentro la barra de arriba");
  afirmar(/id="ver"/.test(marca[0]),
    "la version no esta junto al nombre, que es donde se mira");
  afirmar(/\$\("ver"\)\.textContent = VERSION/.test(FUENTE),
    "el hueco de la version se queda vacio");
});

await prueba("al cambiar la version se tira la copia guardada", () => {
  /* Con un nombre de deposito fijo, una copia mala se queda pegada y no hay
     manera de echarla: el numero de arriba diria una cosa y el codigo seria
     otro, que es justo lo que se quiere evitar. */
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const cache = /const CACHE = "([^"]+)"/.exec(sw);
  afirmar(cache, "no encuentro el nombre del deposito en sw.js");
  afirmar(cache[1].includes(VERSION[1]),
    `el deposito se llama "${cache[1]}" y la version es ${VERSION[1]}: ` +
    "al publicar, el telefono se queda con la copia vieja");
});

/* ------------------------------------------------------------------------ */
seccion("La llave del servidor");

await prueba("la clave del servidor es la publica, no una secreta", () => {
  /* La publicable esta pensada para ir en la pagina; una clave de servicio
     ahi seria dar acceso total a la base a cualquiera que mire el codigo. */
  afirmar(!/service_role|SUPABASE_SERVICE|sb_secret_/.test(HTML),
    "hay una clave secreta metida en la pagina");
  afirmar(/sb_publishable_/.test(HTML), "no encuentro la clave publica");
});

/* ------------------------------------------------------------------------ */
seccion("Marcar con ayuda");

await prueba("la ayuda arranca apagada", () => {
  /* Hasta que alguien la pruebe con canciones de verdad no se sabe cuanto
     acierta, y una ayuda que se equivoca sin avisar es peor que no tenerla.
     Se enciende a mano, no de fabrica. */
  afirmar(/ayuda:\s*false/.test(FUENTE), "la ayuda viene encendida de serie");
  const seg = /<div class="seg" id="f-assist">([\s\S]*?)<\/div>/.exec(SOLO_HTML);
  afirmar(seg, "no encuentro el interruptor de la ayuda");
  const aMano = /data-a="0"[^>]*aria-pressed="true"/.test(seg[1]);
  afirmar(aMano, "el interruptor aparece marcado en 'con ayuda'");
});

await prueba("escribe en la misma lista de siempre y no en un formato nuevo", () => {
  /* Esta es LA promesa del cambio: revisar, acomodar marcas, guardar y
     sincronizar no se enteran de nada porque lo guardado no cambia de forma.
     Si alguna vez el seguidor deja de recibir teacher.downbeats, se acabo. */
  afirmar(/new Seguidor\(teacher\.downbeats\)/.test(FUENTE),
    "el seguidor ya no escribe en la lista de marcas del profesor");
});

await prueba("no abre el microfono por su cuenta: usa los frames de la huella", () => {
  /* Si pidiera su propia captura habria dos micrófonos abiertos, dos relojes
     distintos y el doble de bateria, para mirar exactamente el mismo sonido. */
  const clase = FUENTE.slice(FUENTE.indexOf("class Seguidor"),
                            FUENTE.indexOf("class Listener"));
  afirmar(!/getUserMedia|AudioContext|new Listener/.test(clase),
    "el seguidor abre su propia captura de audio");
  afirmar(/teacher\.ayuda\) teacher\.seguidor\.push\(spec, frame\)/.test(FUENTE),
    "el seguidor no esta enganchado a los frames que ya pasan por la grabacion");
});

await prueba("sin dos toques del profesor no propone nada", () => {
  const clase = FUENTE.slice(FUENTE.indexOf("class Seguidor"),
                             FUENTE.indexOf("class Listener"));
  /* La unica puerta para arrancar es tocar(). Si apareciera un detector de
     velocidad automatico, el seguidor podria decidir solo donde esta el UNO,
     que es justo lo que no se quiere: en bachata se equivocaria y el alumno
     no tiene como notarlo. */
  afirmar(/if \(this\.anclas\.length === 1\) return "primero"/.test(clase),
    "el primer toque ya no se limita a esperar al segundo");
});

await prueba("el temporizador del dibujo se apaga al dejar de grabar", () => {
  const parar = FUENTE.slice(FUENTE.indexOf("function stopTeacher"),
                             FUENTE.indexOf("function setP"));
  afirmar(/clearInterval\(teacher\.pintando\)/.test(parar),
    "el repintado sigue vivo con el microfono cerrado");
});

await prueba("la variable del instante no se llama t", () => {
  /* Ya paso dos veces en esta app: una variable local llamada `t` tapa la
     funcion de traducir dentro de toda la funcion, y la linea siguiente que
     traduce algo revienta. En tapNow el fallo era invisible porque la marca
     se guardaba igual y la pantalla parpadeaba: lo unico que se perdia era el
     contador de toques. */
  const fn = FUENTE.slice(FUENTE.indexOf("function tapNow"),
                          FUENTE.indexOf('$("p-tap").addEventListener'));
  afirmar(!/\bconst t\s*=/.test(fn), "vuelve a haber un `const t` tapando la traduccion");
});

/* ------------------------------------------------------------------------ */
seccion("El link de la cancion");

await prueba("solo se guardan links que se puedan abrir en el navegador", () => {
  /* El link lo escribe un profesor y lo abren todos sus alumnos desde el
     catalogo compartido. Sin filtro, un "javascript:..." se ejecutaria en el
     telefono de cualquiera que tocara el boton, con su sesion abierta. */
  afirmar(/function linkSeguro/.test(FUENTE), "no existe el filtro de links");
  const fn = FUENTE.slice(FUENTE.indexOf("function linkSeguro"));
  afirmar(/protocol !== "http:" && u\.protocol !== "https:"/.test(fn),
    "el filtro no comprueba el protocolo");
});

await prueba("y se filtran al guardar, no solo al pintarlos", () => {
  /* Filtrar solo al dibujar obliga a que TODOS los sitios que lo pinten se
     acuerden, y basta que uno se olvide. Se guarda ya limpio. */
  afirmar(/link: linkSeguro\(\$\("f-link"\)\.value\)/.test(FUENTE),
    "al grabar se guarda el link sin filtrar");
  afirmar(/link: linkSeguro\(\$\("e-link"\)\.value\)/.test(FUENTE),
    "al editar se guarda el link sin filtrar");
});

await prueba("el enlace se abre fuera y sin dejar puerta atras", () => {
  const fn = FUENTE.slice(FUENTE.indexOf("function botonDeLink"),
                          FUENTE.indexOf("function renderLists"));
  afirmar(/rel = "noopener noreferrer"/.test(fn),
    "la pagina que se abre puede navegar la nuestra desde atras");
  afirmar(/target = "_blank"/.test(fn), "el link se abre encima de la app");
});

await prueba("el link viaja al servidor y vuelve", () => {
  afirmar(/link: r\.link \|\| ""/.test(FUENTE), "el link no se lee de la fila del servidor");
  afirmar(/link: s\.link \|\| null/.test(FUENTE), "el link no se sube al servidor");
});

await prueba("si la base todavia no tiene la columna, se sincroniza igual", () => {
  /* Mientras haya un telefono con la version nueva y una base sin migrar,
     este camino se usa de verdad. Sin el, la persona se queda sin sincronizar
     NADA por una columna que ni sabia que existia. */
  /* Se comprueba que ESTEN, no que sean exactamente esas. La version anterior
     de esta prueba clavaba la lista entera y por tanto fallaba cada vez que
     llegaba una columna nueva -que es justo lo que hay que poder hacer sin
     miedo-. Lo que hay que proteger es que ninguna se caiga de la lista, no
     que la lista no crezca nunca. */
  const nuevas = /const NUEVAS = \[([^\]]*)\]/.exec(FUENTE);
  afirmar(nuevas, "ya no existe la lista de columnas que se pueden dejar caer");

  /* Y la lista de la izquierda tiene que coincidir con la de la derecha: se
     dejan caer unas columnas, pero el reintento solo se dispara con los
     errores que reconoce. Si una columna esta en NUEVAS y no aqui, el
     reintento no llega a ocurrir y no sincroniza nada. */
  const reintento = /fpl_keys\|([^/]*)PGRST204/.exec(FUENTE);
  afirmar(reintento, "el reintento ya no reconoce el error de columna que falta");

  for (const col of ["fpl_keys", "fpl_times", "link", "tips"]) {
    afirmar(nuevas[1].includes('"' + col + '"'),
      col + " no esta entre las columnas que se pueden dejar caer");
    afirmar(("fpl_keys|" + reintento[1]).includes(col + "|"),
      "el reintento no reconoce el error de la columna " + col);
  }
});

await prueba("la migracion del link existe y recrea el catalogo", () => {
  const sql = readFileSync(new URL("../db/10-link-de-la-cancion.sql", import.meta.url), "utf8");
  afirmar(/add column if not exists link text/.test(sql), "no anade la columna");
  /* La vista hay que rehacerla entera: una vista no admite anadirle una
     columna por partes, y si se olvida, el alumno nunca ve el link porque el
     catalogo se lee de ahi. */
  afirmar(/create view public\.songs_catalog[\s\S]*\blink\b/.test(sql),
    "la vista del catalogo se quedo sin el link");
  afirmar(/revoke all on public\.songs_catalog from anon/.test(sql),
    "el catalogo quedo abierto a visitantes");
});

/* ========================================================================= */
seccion("Los consejos de baile");

await prueba("los consejos se guardan dentro de la cancion, no aparte", () => {
  /* La decision de fondo, y la que hay que poder recordar dentro de un ano.
     Una fila de `songs` YA es de un profesor: si dos preparan el mismo tema,
     hoy ya son dos filas con su huella y sus marcas. Metiendolos aqui, el
     permiso que protege los tiempos del uno protege estos igual, sin escribir
     una politica nueva. Una tabla aparte habria sido RLS nueva -o sea, una
     forma nueva de equivocarse- para repetir un permiso que ya existe. */
  afirmar(/tips: limpiarConsejos\(r\.tips\)/.test(FUENTE),
    "los consejos no se leen de la fila de la cancion");
  afirmar(/tips: limpiarConsejos\(s\.tips\)/.test(FUENTE),
    "los consejos no se suben con la cancion");
});

await prueba("lo que llega de fuera se limpia siempre", () => {
  /* Tres puertas de entrada, y las tres tienen que filtrar: el servidor, el
     archivo de copia -que se puede abrir con el bloc de notas- y lo que toca
     el profesor. Si una sola se saltara el filtro, la pantalla del alumno
     recibiria una lista desordenada y mostraria el consejo equivocado sin que
     nada avisara. */
  const puertas = [
    [/rowToSong = \(r\) => \(\{[\s\S]*?\}\);/, "lo que baja del servidor"],
    [/function importarCanciones[\s\S]*?\n}\n/, "lo que viene del archivo de copia"],
    [/ct-save"\)\.addEventListener[\s\S]*?\n\}\);/, "lo que marca el profesor"]
  ];
  for (const [re, quien] of puertas) {
    const trozo = re.exec(FUENTE);
    afirmar(trozo, "no encuentro el codigo de " + quien);
    afirmar(/limpiarConsejos\(/.test(trozo[0]), quien + " no se limpia");
  }
});

await prueba("al catalogo solo va un si o un no, nunca los tiempos", () => {
  /* Esta es LA prueba de esta funcion. El catalogo lo ve todo el mundo, tenga
     o no acceso a la cancion: es lo que permite ensenar con candado lo que no
     se puede usar. Los consejos son contenido preparado por el profesor,
     igual que las marcas del uno, y no pueden salir por ahi. */
  const sql = readFileSync(new URL("../db/11-consejos-de-baile.sql", import.meta.url), "utf8");
  const vista = /create view public\.songs_catalog[\s\S]*?;/.exec(sql);
  afirmar(vista, "la migracion no recrea la vista del catalogo");
  afirmar(/has_tips/.test(vista[0]), "el catalogo no dice si la cancion trae consejos");
  /* Que no aparezca `tips` suelto como columna de la vista. Se admite dentro
     de la expresion que calcula has_tips, que es donde tiene que estar. */
  const columnas = vista[0].replace(/case[\s\S]*?end as has_tips/, "");
  afirmar(!/\btips\b/.test(columnas),
    "los tiempos de los consejos se estan publicando en el catalogo");
});

await prueba("la migracion anade la columna y no toca nada mas", () => {
  const sql = readFileSync(new URL("../db/11-consejos-de-baile.sql", import.meta.url), "utf8");
  afirmar(/add column if not exists tips jsonb/.test(sql), "no anade la columna");
  afirmar(/revoke all on public\.songs_catalog from anon/.test(sql),
    "el catalogo quedo abierto a visitantes");
  /* Ni politicas nuevas ni tablas nuevas: ese era el punto de meterlos dentro
     de la cancion. Si algun dia hace falta tocar esto, que sea a sabiendas. */
  afirmar(!/create table|create policy/.test(sql),
    "la migracion crea tablas o politicas, y no deberia hacer falta ninguna");
  /* Y que no se lleve por delante lo que ya publicaba el catalogo. */
  for (const col of ["title", "artist", "teacher", "rhythm", "free", "link", "fpl_keys"]) {
    afirmar(new RegExp("\\b" + col + "\\b").test(sql),
      "la vista recreada se dejo por el camino la columna " + col);
  }
});

await prueba("los consejos no se cuelan en la grabacion", () => {
  /* Un anadido de verdad no toca lo de abajo. Si el editor de consejos
     escribiera en downbeats o en la huella, un fallo aqui se llevaria por
     delante la cuenta, que es la app entera. Solo puede tocar `tips`. */
  const guardar = /ct-save"\)\.addEventListener[\s\S]*?\n\}\);/.exec(FUENTE);
  afirmar(guardar, "no encuentro el guardado de los consejos");
  afirmar(!/downbeats|fp_keys|fpv|rhythm/.test(guardar[0]),
    "guardar los consejos toca la grabacion");
  afirmar(/JSON\.stringify\(\{ tips: lista \}\)/.test(guardar[0]),
    "al servidor se le manda algo mas que los consejos");
});

await prueba("el editor de consejos apunta a UNA cancion, no a la que suene", () => {
  /* Sin forzar la cancion, una version parecida podria ganar el
     reconocimiento y los consejos acabarian en la cancion equivocada, sin que
     nada lo delatara hasta que un alumno viera "vueltas" en mitad de un
     silencio. */
  afirmar(/matcher\.match\(qk, qt, tipsEd\.song\.id\)/.test(FUENTE),
    "el editor de consejos acepta cualquier cancion que suene");
});

await prueba("un microfono a la vez", () => {
  /* Tres sitios abren el microfono: grabar los uno, escuchar de alumno y
     anotar consejos. Dos a la vez no dan error, dan datos mezclados. */
  afirmar(/ct-start"\)\.addEventListener[\s\S]*?stopStudent\(\)/.test(FUENTE),
    "anotar consejos no corta la escucha del alumno");
  const start = /\$\("p-start"\)\.addEventListener[\s\S]{0,400}/.exec(FUENTE);
  afirmar(start && /pararConsejos\(\)/.test(start[0]),
    "empezar a grabar no corta el microfono de los consejos");
  afirmar(/which !== "prof"\) pararConsejos\(\)/.test(FUENTE),
    "cambiar de pestana deja el microfono de los consejos abierto");
});

await prueba("nada de requestAnimationFrame, tampoco aqui", () => {
  /* La regla es de toda la app y nacio de un fallo real: colgar trabajo del
     reloj de la pantalla hacia que en el telefono de Gabriel se perdieran
     tres de cada cuatro frames de audio. El reloj de los consejos se repinta
     con un temporizador normal. */
  afirmar(/tipsEd\.pintando = setInterval\(/.test(FUENTE),
    "el reloj de los consejos no usa un temporizador");
  afirmar(/clearInterval\(tipsEd\.pintando\)/.test(FUENTE),
    "el temporizador de los consejos no se apaga nunca");
});

await prueba("una cancion nueva nace sin consejos y eso esta bien", () => {
  /* No obligar al profesor. Una cancion con los uno y sin un solo consejo
     esta completa, y la pantalla del alumno no puede enseñar un hueco vacio
     por ello. */
  afirmar(/tips: \[\]/.test(FUENTE), "al grabar no se deja la lista de consejos vacia");
  const pintar = /function pintarConsejoAlumno[\s\S]*?\n}\n/.exec(FUENTE);
  afirmar(pintar, "no encuentro lo que pinta los consejos del alumno");
  afirmar(/caja\.hidden = true/.test(pintar[0]),
    "sin consejos, la zona del alumno no se esconde");
});

await prueba("lo que se marca cae en el UNO, no donde cayo el dedo", () => {
  /* La incoherencia que se arreglo: la cuenta del alumno lleva desde siempre
     pegada a las marcas del profesor, y los consejos guardaban el segundo
     crudo del toque -retraso de reaccion incluido-, asi que salian corridos.
     Se pegan con la MISMA lista que manda sobre la cuenta. */
  afirmar(/pegarAlUno\(tipsEd\.song\.downbeats, relojTips\(\)\)/.test(FUENTE),
    "los consejos se guardan sin pegarlos al uno");
  const poner = /function ponerConsejo[\s\S]*?\n}\n/.exec(FUENTE);
  afirmar(poner && /cuandoTips\(\)/.test(poner[0]),
    "el boton de consejo no usa el tiempo pegado al uno");

  /* Y corregir tiene que mover un compas entero. Media un segundo suelto lo
     sacaria del uno otra vez, deshaciendo justo lo anterior. */
  const correr = /function correrConsejo[\s\S]*?\n}\n/.exec(FUENTE);
  afirmar(correr, "no encuentro lo que corrige la posicion de un consejo");
  afirmar(/pegarAlUno\(/.test(correr[0]), "correr un consejo lo saca del uno");
  afirmar(/nearestOne\(/.test(correr[0]), "correr un consejo no sabe cuanto dura un compas");
});

await prueba("el mensaje escrito se pinta como texto, nunca como HTML", () => {
  /* Lo escribe un profesor y lo leen todos sus alumnos a traves del catalogo
     compartido. Con innerHTML, cualquiera podria dejar codigo corriendo en el
     telefono de otro, con su sesion abierta. Es el mismo cuidado que ya se
     tuvo con el link. */
  for (const re of [/function pintarConsejoAlumno[\s\S]*?\n}\n/,
                    /function pintarListaTips[\s\S]*?\n}\n/]) {
    const trozo = re.exec(FUENTE);
    afirmar(trozo, "no encuentro uno de los sitios que pintan consejos");
    /* Con el punto delante: se busca la LLAMADA, no la palabra. Sin eso, un
       comentario que diga "textContent y no innerHTML" hace fallar la prueba,
       que es exactamente lo que paso al escribirla. */
    afirmar(!/\.innerHTML|insertAdjacentHTML|\.outerHTML/.test(trozo[0]),
      "un consejo se esta metiendo en el HTML");
  }
  afirmar(/msg\.textContent = ahora\.msg/.test(FUENTE),
    "el mensaje del alumno no se pinta con textContent");
});

await prueba("el mensaje tiene tope y no puede tapar la cuenta", () => {
  /* Sin tope, un profesor pega un parrafo y le tapa la pantalla a todos sus
     alumnos. Y estas canciones se comparten: el destrozo no seria solo suyo. */
  afirmar(/LARGO: \d+/.test(FUENTE), "el mensaje no tiene tope de largo");
  afirmar(/maxlength="80"/.test(SOLO_HTML), "el campo deja escribir sin limite");
  const limpiar = /function limpiarConsejos[\s\S]*?\n}\n/.exec(FUENTE);
  afirmar(/slice\(0, CONSEJOS\.LARGO\)/.test(limpiar[0]),
    "el tope no se aplica al guardar, solo al escribir");
});

await prueba("los mensajes viajan en la misma lista que los botones", () => {
  /* Y por eso NO hacen falta ni columna nueva ni migracion: se guardan, se
     suben, se exportan y se borran por el mismo camino que ya estaba probado.
     Si algun dia alguien los saca a un sitio aparte, esta prueba avisa de todo
     lo que habria que volver a montar. */
  afirmar(!/msgs:|mensajes:|add column if not exists (msg|mensajes)/.test(FUENTE),
    "los mensajes se fueron a su propia lista y ahora hay dos caminos que mantener");
  const consejos = /function consejosEn[\s\S]*?\n}\n/.exec(FUENTE);
  afirmar(/fuera\.msg = c\.m/.test(consejos[0]),
    "el alumno no lee el mensaje de la misma lista");
});

await prueba("los seis botones del profesor estan en la pantalla", () => {
  /* Grandes y a la vista, sin desplegables: se tocan sin mirar mientras suena
     la cancion. Si alguno se cayera del HTML no habria error en ningun lado,
     simplemente no se podria marcar. */
  for (const k of ["up", "soft", "waves", "turns", "foot", "pause"]) {
    afirmar(new RegExp('class="tip" data-k="' + k + '"').test(SOLO_HTML),
      "falta el boton de " + k);
  }
  /* Y que el codigo sepa leer ese atributo. Sin esto, los botones estarian
     dibujados y no harian nada. */
  afirmar(/closest\("button\[data-k\]"\)/.test(FUENTE),
    "nadie escucha los botones de consejos");
});

await prueba("todos los textos nuevos estan en los dos idiomas", () => {
  const claves = ["assist", "assistOn", "assistOff", "assistHint", "assistStart",
    "assistHelp", "assistFirst", "assistOdd", "assistGo", "assistFine",
    "assistFixed", "assistTaps", "assistWait", "assistOk", "assistLost",
    "link", "phLink", "linkHint", "openSong",
    "tips", "tipEnergy", "tipMove", "tipUp", "tipSoft", "tipWaves", "tipTurns",
    "tipFoot", "tipPause", "tipNone", "tipsBy", "tipsHelp", "tipsListen",
    "tipsSearching", "tipsNotFound", "tipsGo", "tipsWait", "tipsFull",
    "tipsEmpty", "tipsEarlier", "tipsLater", "tipsSaved", "tipsDiscard",
    "tipsNoColumn", "tipsMsg", "phTipsMsg", "tipsMsgAdd", "tipsMsgSave",
    "tipsMsgHelp", "tipsMsgEmpty", "tipsMsgEdited", "tipsMsgEditing"];
  for (const k of claves) {
    const veces = [...FUENTE.matchAll(new RegExp("\\b" + k + ":\\s*\"", "g"))].length;
    igual(veces, 2, `"${k}" tendria que estar en espanol y en ingles`);
  }
});

/* Sin esto, un fallo se veia en rojo por pantalla pero el archivo terminaba
   diciendo que todo habia ido bien: correr.sh no tenia como enterarse y
   remataba con "Todo en orden". Una prueba que falla sin que nadie se entere
   es peor que no tenerla. */
process.exit(resumen());
