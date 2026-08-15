# Cómo trabajar en este proyecto

Gabriel no es programador. Respuestas **cortas y en español**, sin jerga.

## No gastar de más

Una sesión de este proyecto llegó a **38 MB**, de los cuales **el 72% eran
capturas de pantalla**: 333 fotos. El problema no fue una tarea cara, fue que
cada imagen **se reenvía en todos los mensajes siguientes**. Una foto sacada
temprano se sigue pagando doscientos mensajes después.

Reglas, en orden de importancia:

1. **Verificar desde fuera del navegador siempre que se pueda.** ¿Quedó el
   registro DNS? Preguntarle al servidor de nombres, no mirar la pantalla.
   ¿Se guardó en la base? Una consulta HTTP. ¿Anda la web? `curl`. Es exacto,
   es la fuente de verdad, y cuesta una milésima que una foto.

2. **Capturas solo para ver algo visual de verdad** —cómo quedó un diseño, un
   error que no está en el texto—. Para comprobar estado: leer el texto o el
   DOM.

3. **Agrupar las acciones del navegador** en una sola llamada cuando no
   dependen unas de otras. La herramienta lo avisa; hacerle caso.

4. **Dos intentos fallidos y parar.** Si algo no sale a la segunda, la tercera
   tampoco. Cambiar de enfoque o preguntar. Insistir seis veces con lo mismo
   fue lo que más costó en aquella sesión.

5. **Esperar sin mirar.** Para algo que tarda, un proceso en segundo plano que
   avise, no ciclos de esperar-y-fotografiar.

## Antes de dar algo por bueno

Correr `./tests/correr.sh`. Son ~150 comprobaciones y tardan segundos.
Casi todas nacieron de un fallo real que llegó a producción.

**Y comprobar el resultado, no el formulario.** Un panel puede mostrar que
guardó y no haber guardado nada: pasó con el editor de DNS de Porkbun, que
dibuja la fila y no la manda al servidor. Recargar y volver a mirar.

## Lo que no hago aunque me lo pidan

Crear cuentas, escribir contraseñas o claves de acceso, pagar. Eso lo hace
Gabriel; yo dejo todo lo demás preparado.
