/* Un marco de pruebas minimo. No se usa una libreria porque la app no tiene
   ninguna dependencia y no vale la pena estrenar la costumbre para esto. */

let grupo = "";
const fallos = [];
let corridas = 0;

export function seccion(nombre) {
  grupo = nombre;
  console.log("\n\x1b[1m" + nombre + "\x1b[0m");
}

export async function prueba(nombre, fn) {
  corridas++;
  try {
    await fn();
    console.log("  \x1b[32m✓\x1b[0m " + nombre);
  } catch (e) {
    console.log("  \x1b[31m✗ " + nombre + "\x1b[0m");
    console.log("      " + String(e.message).split("\n").join("\n      "));
    fallos.push({ grupo, nombre, error: e.message });
  }
}

export function afirmar(cond, mensaje) {
  if (!cond) throw new Error(mensaje || "se esperaba que fuera cierto");
}

export function igual(a, b, mensaje) {
  if (a !== b) {
    throw new Error((mensaje ? mensaje + "\n" : "") + `esperaba ${JSON.stringify(b)}, llego ${JSON.stringify(a)}`);
  }
}

export function cerca(a, b, tolerancia, mensaje) {
  if (!(Math.abs(a - b) <= tolerancia)) {
    throw new Error((mensaje ? mensaje + "\n" : "") +
      `esperaba ${b} ± ${tolerancia}, llego ${a}`);
  }
}

export function resumen() {
  const ok = corridas - fallos.length;
  console.log("\n" + "─".repeat(58));
  if (!fallos.length) {
    console.log(`\x1b[32m${corridas} pruebas, todas pasan\x1b[0m`);
    return 0;
  }
  console.log(`\x1b[31m${fallos.length} de ${corridas} fallan\x1b[0m  (${ok} pasan)`);
  for (const f of fallos) console.log(`  · ${f.grupo} › ${f.nombre}`);
  return 1;
}

/* Numeros al azar pero siempre los mismos: una prueba que a veces pasa y a
   veces no es peor que no tenerla, porque ensena a ignorar los fallos. */
export function azar(semilla) {
  let s = semilla >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}
