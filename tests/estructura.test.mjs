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
  afirmar(/\.song button \{[^}]*width:\s*auto/.test(HTML),
    "falta el ancho automatico en los botones de las filas");

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

await prueba("el servidor no deja servir una pagina vieja sin preguntar", () => {
  /* La otra mitad. Si el navegador tiene permiso para usar su copia sin
     preguntar, el service worker ni llega a pedirla. Antes eran diez minutos
     de permiso, y publicar un arreglo no bastaba para que la gente lo viera. */
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

/* Sin esto, un fallo se veia en rojo por pantalla pero el archivo terminaba
   diciendo que todo habia ido bien: correr.sh no tenia como enterarse y
   remataba con "Todo en orden". Una prueba que falla sin que nadie se entere
   es peor que no tenerla. */
process.exit(resumen());
