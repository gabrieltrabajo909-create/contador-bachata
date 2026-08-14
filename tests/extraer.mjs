/* Saca del index.html las partes que no tocan la pantalla, para poder
   probarlas sueltas.

   La gracia es que se prueba EL CODIGO DE VERDAD. Copiar las funciones a un
   archivo de tests daria pruebas que pasan siempre y no protegen de nada: se
   estaria probando la copia, y la copia se queda vieja al primer cambio. */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
export const HTML = readFileSync(join(raiz, "index.html"), "utf8");

const script = (() => {
  // El <script> grande es el ultimo del archivo y el unico sin atributos.
  const partes = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!partes.length) throw new Error("no hay <script> en index.html");
  return partes.map(p => p[1]).sort((a, b) => b.length - a.length)[0];
})();

/* Recorta una declaracion completa a partir de su nombre, contando llaves,
   parentesis y corchetes y saltandose lo que aparezca dentro de textos,
   plantillas, expresiones regulares y comentarios. Un simple contador de
   llaves no vale: el diccionario de traducciones esta lleno de comillas y
   de acentos escapados. */
function recortar(nombre) {
  const decl = new RegExp(
    `^(?:export\\s+)?(?:const|let|var|function|class)\\s+${nombre}\\b`, "m");
  const m = decl.exec(script);
  if (!m) throw new Error(`no encuentro la declaracion de ${nombre}`);

  /* Donde termina depende de la forma:
       function f() {...}  y  class C {...}   acaban en la llave que cierra
       const x = ...;                          acaba en el punto y coma
     Distinguirlas evita el error clasico de cortar `const f = (i) => ...`
     en el parentesis, que a ojos del contador ya estaba equilibrado. */
  const porLlave = /^(?:export\s+)?(?:function|class)\b/.test(script.slice(m.index));

  let i = m.index, prof = 0, arrancado = false;
  let cita = null, plantilla = 0, comentario = null;

  for (; i < script.length; i++) {
    const c = script[i], sig = script[i + 1];

    if (comentario) {
      if (comentario === "//" && c === "\n") comentario = null;
      else if (comentario === "/*" && c === "*" && sig === "/") { comentario = null; i++; }
      continue;
    }
    if (cita) {
      if (c === "\\") { i++; continue; }
      if (c === cita) cita = null;
      continue;
    }
    if (plantilla) {
      if (c === "\\") { i++; continue; }
      if (c === "`") plantilla--;
      continue;
    }
    if (c === "/" && sig === "/") { comentario = "//"; i++; continue; }
    if (c === "/" && sig === "*") { comentario = "/*"; i++; continue; }
    if (c === '"' || c === "'") { cita = c; continue; }
    if (c === "`") { plantilla++; continue; }

    if (c === "{" || c === "(" || c === "[") { prof++; arrancado = true; continue; }
    if (c === "}" || c === ")" || c === "]") {
      prof--;
      if (porLlave && arrancado && prof === 0 && c === "}") {
        return script.slice(m.index, i + 1);
      }
      continue;
    }
    if (!porLlave && c === ";" && prof === 0) {
      return script.slice(m.index, i + 1);
    }
  }
  throw new Error(`no pude cerrar la declaracion de ${nombre}`);
}

/* Monta un modulo con las piezas pedidas y lo evalua. Se les da un `document`
   y un `localStorage` de mentira porque alguna toca el idioma, pero ninguna
   de las que se prueban dibuja nada. */
export async function cargar(nombres) {
  const cuerpo = nombres.map(recortar).join("\n\n");
  const preludio = `
    const localStorage = { getItem: () => null, setItem: () => {} };
    const navigator = { language: "es" };
    const document = { documentElement: {}, querySelectorAll: () => [] };
  `;
  const salida = `export { ${nombres.join(", ")} };`;
  const src = preludio + "\n" + cuerpo + "\n" + salida;
  const url = "data:text/javascript;base64," + Buffer.from(src, "utf8").toString("base64");
  try {
    return await import(url);
  } catch (e) {
    throw new Error("no se pudo evaluar lo extraido: " + e.message);
  }
}

/* El HTML sin el codigo. Hace falta para buscar atributos de verdad: dentro
   del script hay selectores que se le parecen y daban falsas alarmas. */
export const SOLO_HTML = HTML.replace(/<script>[\s\S]*?<\/script>/g, "");

export { script as FUENTE };
