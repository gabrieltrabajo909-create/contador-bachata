# Mudanza de GitHub Pages a Cloudflare Pages

Lo que hace falta que hagas vos, en orden. Yo no puedo crear cuentas ni dar
permisos en tu nombre; el resto ya está preparado en el repositorio.

**La regla de toda la mudanza: no se toca el dominio hasta que la app nueva
funcione en su dirección de prueba.** Así, si algo sale mal, la app que usa la
gente sigue en pie y no te enterás por un mensaje de tus alumnos.

---

## Cómo está hoy

| | |
|---|---|
| Dominio y DNS | Porkbun |
| La app | GitHub Pages, servida desde la rama `main` |
| `feeltheone.app` | apunta a las cuatro IPs de GitHub |
| `www` | apunta a `gabrieltrabajo909-create.github.io` |
| Correo en el dominio | no hay |
| Base de datos | Supabase — **no se toca en toda la mudanza** |

Hay un registro `TXT` con `brevo-code:...`. Es el que autoriza a mandar los
correos de «olvidé mi contraseña». **Si desaparece, esos correos dejan de
llegar.** Aparece más abajo, en el paso donde importa.

---

## 1. Cuenta de Cloudflare — *lo hacés vos*

Entrá a `dash.cloudflare.com` y creá la cuenta (o entrá si ya tenés). Es
gratis y no pide tarjeta para esto.

## 2. Darle permiso a GitHub — *lo hacés vos*

En Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.

Te va a mandar a GitHub a autorizar la aplicación de Cloudflare. Cuando te
pregunte a qué repositorios darle acceso, elegí **solo `contador-bachata`**,
no todos. Menos permisos, menos que revisar el día que algo salga mal.

## 3. Crear el proyecto — *lo hacés vos*

Elegí el repositorio y poné exactamente esto:

| Campo | Valor |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | `bash construir.sh` |
| Build output directory | `public` |

No hace falta ninguna variable de entorno ni ninguna clave.

Ese guion copia a `public/` **solo los ocho archivos que la app necesita**. Las
pruebas, el esquema de la base y las notas se quedan fuera. No son secretos,
pero no tienen por qué estar colgados en internet.

## 4. Probar antes de tocar nada — *lo hacés vos, y es el paso que no se saltea*

Cloudflare te da una dirección tipo `contador-bachata.pages.dev`. Abrila:

1. Arriba tiene que decir **2.22.0**.
2. Entrá a **Alumno → abajo del todo → «Si no reconoce: datos técnicos» →
   Comprobar este teléfono**. Tiene que decir **«este teléfono está sano»**.
3. Entrá con tu cuenta y fijate que aparezcan tus canciones.

Si esas tres cosas están bien, la app nueva funciona entera. **Recién ahí se
toca el dominio.**

## 5. Mudar el DNS — *lo hacés vos*

En Cloudflare: **Add a site → `feeltheone.app`**, plan Free. Cloudflare lee los
registros que ya existen en Porkbun y te los muestra.

**Mirá esa lista antes de seguir.** Tiene que estar el `TXT` que empieza con
`brevo-code`. Si no está, agregalo a mano copiándolo de Porkbun.

Cloudflare te va a dar dos nombres de servidores. Entrá a Porkbun y cambiá los
de `feeltheone.app` por esos dos. Tarda entre unos minutos y unas horas.

> Porkbun ya nos jugó una mala pasada: el editor dibuja el cambio en pantalla y
> a veces no lo manda. **Recargá la página de Porkbun y volvé a mirar** que
> quedaron los de Cloudflare.

## 6. Enganchar el dominio a la app — *lo hacés vos*

De vuelta en el proyecto de Pages: **Custom domains → Set up a domain** y
agregá `feeltheone.app` y después `www.feeltheone.app`.

Cloudflare crea los registros solo y pide el certificado de seguridad. Suele
tardar unos minutos; hasta que termina podés ver un aviso de sitio no seguro.
Es normal y se arregla solo.

## 7. Apagar GitHub Pages — *lo hacés vos*

En GitHub: **Settings → Pages → Source: None**.

Es para que no queden dos sitios sirviendo la misma app. Recién después de que
`feeltheone.app` cargue bien desde Cloudflare.

## 8. Hacer el repositorio privado — *lo hacés vos*

En GitHub: **Settings → General → abajo del todo → Change visibility →
Private**.

Cloudflare Pages funciona con repositorios privados sin pagar nada.

---

## Una cosa que conviene que sepas antes

**Hacer el repositorio privado no esconde la app.** El archivo `index.html` con
todo el algoritmo se lo baja cualquiera que entre a la web: así funciona
cualquier página. Lo que el repositorio privado sí esconde son las pruebas, el
esquema de la base de datos y las notas de trabajo.

Lo que protege los datos de verdad no es esconder el código: es que **el
servidor no deja hacer nada que no corresponda**. La clave que va en la página
es la publicable, la que está pensada para eso, y hay una prueba que salta si
alguien mete una secreta por error. Cada persona solo puede tocar sus propias
canciones y sus propios puntajes, y eso lo decide Supabase, no la app. Hay 52
pruebas contra la base de datos de verdad que lo comprueban.

---

## Lo que ya quedó hecho

**Cada empujón a GitHub actualiza la app sola.** Cloudflare escucha la rama
`main` y reconstruye. No hay que tocar nada.

**Se acabó el «abrila dos veces».** Eran dos cosas a la vez:

- El servidor daba permiso para usar la página guardada durante diez minutos
  sin preguntar. Ahora dice que pregunte siempre; el navegador manda una marca
  y el servidor le contesta «sigue igual» sin reenviar nada. Es barato.
- El programa que hace que la app abra sin internet servía su copia antes de
  mirar si había algo nuevo. Ahora la app se pide a la red primero, con dos
  segundos y medio de paciencia; si no hay señal, abre con la copia igual que
  siempre. Los iconos siguen saliendo de la copia, que no cambian nunca.

---

## Si algo sale mal

**Volver atrás es cambiar los nombres de servidores de vuelta a los de
Porkbun** y encender GitHub Pages otra vez. Por eso el repositorio se hace
privado al final: mientras siga público, esa vuelta atrás está disponible.
