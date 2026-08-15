# Las pruebas

Para correrlas todas:

```
./tests/correr.sh
```

Si no hay internet, o solo querés lo rápido:

```
./tests/correr.sh rapido
```

No hace falta instalar nada. Si Node no está en el sistema, el script se baja
una copia suelta a una carpeta temporal, comprobando antes que coincide con la
firma oficial.

## Qué se prueba

| Archivo | Qué mira |
|---|---|
| `algoritmo.test.mjs` | Reconocer la canción y en qué segundo va |
| `cuenta.test.mjs` | Qué número se muestra y cómo se puntúa el juego |
| `estructura.test.mjs` | Traducciones, botones rotos, reglas ya rompidas |
| `servidor.py` | El candado, la privacidad, la papelera y el nombre del profesor |

Las tres primeras funcionan sin internet y tardan segundos. La última habla con
la base de datos de verdad, porque las reglas de acceso solo existen allí.

## Se prueba el código de verdad

`extraer.mjs` saca las funciones directamente de `index.html`. No hay copias.
Copiar el código a un archivo de pruebas daría pruebas que pasan siempre: se
estaría probando la copia, y la copia se queda vieja al primer cambio.

## Las cuentas de prueba

Las del servidor usan dos cuentas fijas, `prueba.autor.contador@example.com` y
`prueba.alumno.contador@example.com`. Se crean solas la primera vez y se
reutilizan siempre, para no ir dejando usuarios sueltos en la base. Todo lo que
crean lo borran al terminar, y la última prueba comprueba justamente eso.

## Por qué muchas prueban que la app NO hace algo

Casi todas nacieron de un fallo real, y casi todos los fallos de este proyecto
fueron del mismo tipo: la app haciendo de más. Reconocer una canción que no
era, seguir contando cuando ya no sabía, dejar ver lo que estaba bloqueado,
borrar de verdad lo que había que esconder.

Marcar el tiempo equivocado es peor que no marcar nada: le enseña mal al alumno
y encima con seguridad. Por eso hay tantas pruebas de que se abstiene.
