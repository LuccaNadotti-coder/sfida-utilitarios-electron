# Seguridad — revisión de la v5

Revisión hecha el **22 de agosto de 2026**, sobre la v5 completa.

Vale aclarar de entrada cuál es el escenario real, porque de eso depende qué
es un problema y qué no: **una sola persona, una sola PC de almacén, sin
internet y sin servidor.** No hay usuarios remotos, no hay red, no hay nadie
autenticándose desde afuera. La superficie de ataque es chica y eso es una
ventaja que conviene no desperdiciar.

---

## Resumen

| Punto | Estado |
|---|---|
| Aislamiento del renderer (`contextIsolation`) | ✅ Correcto |
| Puente del preload | ✅ Mínimo y tipado |
| Política de contenido (CSP) | ✅ Todo local, nada de internet |
| Inyección de SQL | ✅ Sin exposición |
| HTML de los tickets | ✅ Escapado |
| Navegación y enlaces externos | ⚠️ **Se corrigió en esta revisión** |
| Fórmulas en el CSV exportado | ⚠️ **Se corrigió en esta revisión** |
| Clave del Control Maestro | ✅ Bien guardada — pero ver el límite |
| Base de datos sin cifrar | ⚠️ **Es así a propósito. Leer abajo.** |
| Instalador sin firma digital | ⚠️ Conocido, con costo |

---

## Lo que estaba bien

### El renderer no puede tocar la computadora

`contextIsolation: true` y `nodeIntegration: false` en las tres ventanas que
abre la app (la principal, la de captura y la de impresión). La pantalla no ve
`require`, ni `ipcRenderer`, ni el sistema de archivos: **solo ve
`window.sfida`**, que es exactamente la lista de funciones declarada en
`src/compartido/contrato.ts`.

El preload no expone `ipcRenderer` entero. Eso sería darle al renderer la llave
de todos los canales, incluidos los que todavía no existen.

### La política de contenido no deja salir a internet

`src/renderer/index.html` declara `default-src 'self'`. No hay CDN, ni fuentes
de Google, ni analítica. Todo viaja adentro del instalador. Además de ser lo
correcto en seguridad, es lo que hace que la app funcione en el almacén sin
conexión.

### No hay inyección de SQL

Se revisaron los siete lugares donde el SQL se arma con texto en vez de ser
literal. En **todos**, lo que se interpola son nombres de tabla o de columna
que salen de constantes del propio código, nunca de algo que escriba la
persona. Los valores siempre van con `?`.

Concretamente: `migraciones.ts:32`, `articulos.ts:171` y `:218`,
`mantenimiento.ts:244` y `:259`, `movimientos.ts:145`, `stock.ts:61`.

### El HTML de los tickets está escapado

Todo texto libre que sale impreso (nombre del artículo, proveedor, empresa,
observación) pasa por `esc()`. Lo único que se interpola crudo son números,
fechas y códigos de unidad, que salen de un catálogo cerrado de 22 valores.

---

## Lo que se corrigió en esta revisión

### 1. Los enlaces externos aceptaban cualquier cosa

**Estaba así:**

```ts
ventana.webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url);      // ← cualquier url
  return { action: 'deny' };
});
```

`shell.openExternal()` no abre páginas web: le entrega la dirección **al
sistema operativo**, que sabe abrir muchas más cosas. Con `file:` abre un
archivo del disco, y hay esquemas registrados por otros programas que
directamente lanzan aplicaciones.

**Por qué importa acá y no es teoría:** los datos del almacén entran por
importación de CSV. Alcanzaría con un nombre de artículo raro para tener, más
adelante, un clic que le pide algo al sistema operativo.

**Ahora:** solo se abren direcciones `http://` y `https://`. Cualquier otra
cosa no hace nada.

### 2. La ventana podía navegar a otro lado

No había ningún control de `will-navigate`. Si algo hubiera hecho que la
ventana cargara otra dirección, esa página quedaría corriendo **con el preload
puesto**, es decir con acceso a `window.sfida` y a toda la base de datos.

**Ahora:** la ventana no navega a ningún lado. Es una aplicación de una sola
pantalla; no tiene por qué hacerlo.

### 3. El CSV exportado podía llevar fórmulas

Excel y LibreOffice tratan como **fórmula** todo lo que empieza con `=`, `+`,
`@` o `-`. Algunas fórmulas pueden ejecutar programas.

El circuito completo existía de verdad: los nombres de los artículos **entran
por CSV**, se guardan tal cual (`normalizarNombre()` pone mayúsculas y junta
espacios, pero no saca el `=`), y **vuelven a salir** en cada reporte
exportado. Y toda esta app termina en Excel: es lo que hace la persona del
almacén con cada reporte.

**Ahora:** `exportarCsv()` le pone un apóstrofo delante a lo que parezca
fórmula, que es la marca de «esto es texto». Los **números negativos legítimos
no se tocan**: `-5` es un ajuste de stock, no un ataque. Lo vigilan dos pruebas
en `pruebas/nucleo-general.test.ts`.

---

## Lo que queda abierto, y por qué

### La base de datos NO está cifrada

**Esto es lo más importante de todo el documento.**

`sfida_inventario.db` es un archivo SQLite común. Cualquiera que pueda copiarlo
—con un pendrive, desde la red, o llevándose la computadora— puede abrirlo con
un programa gratuito y ver **todo**: artículos, precios, proveedores,
movimientos.

**La clave del Control Maestro no protege eso.** Protege una *sección de la
aplicación* (anular movimientos, cambiar mínimos en lote, borrar datos), no el
archivo.

Qué sí protege el archivo:
- que la PC del almacén tenga contraseña de Windows;
- que no quede abierta y sin llave cuando no hay nadie;
- que los respaldos que se llevan en pendrive no anden dando vueltas.

Cifrar la base es posible (SQLCipher), pero implica compilar un módulo nativo
distinto —justo lo que hoy hace que el instalador ande sin herramientas de
compilación— y agrega el problema de dónde guardar la llave: si queda en la
misma PC, el cifrado protege menos de lo que parece. **No se hizo, y hay que
saberlo.** Si en algún momento se manejan datos que ameriten el costo, se
discute aparte.

### La clave se compara sin tiempo constante

`verificarClave()` compara con `===` en vez de `timingSafeEqual`. En teoría eso
filtra información por el tiempo que tarda.

En este caso **no cambia nada**, y conviene decir por qué en vez de arreglarlo
por reflejo: para medir esos tiempos hay que estar sentado frente a la
computadora, y quien puede hacer eso puede directamente copiar el archivo y
leer el hash. El ataque cuesta más que el camino obvio.

Lo que **sí** está bien resuelto: PBKDF2-HMAC-SHA256 con **120 000
iteraciones**, sal aleatoria de 16 bytes por clave, y el hash nunca se guarda
en claro. Una prueba verifica que un hash generado por la versión Python sigue
validando, así que quien haya cambiado la clave en la app vieja entra con la
misma en la nueva.

La pantalla espera **30 segundos después de 5 intentos**, que es lo que hace
falta contra alguien probando claves a mano.

### El instalador no está firmado

Windows muestra la advertencia de «editor desconocido» al instalar. Se
soluciona comprando un certificado de firma de código (unos 200–400 USD al
año). Vale la pena solo si el instalador se va a repartir a más gente; para
copiarlo a una PC conocida, no.

### `sandbox: false`

Está apagado porque el preload necesita `require()` para armar el puente. Es la
configuración habitual de electron-vite y **no anula** el aislamiento: lo que
protege de verdad —`contextIsolation`— sigue encendido, y el preload es código
propio de 120 líneas que no ejecuta nada que venga de afuera.

---

## Lo que la persona del almacén debería hacer

Nada de esto es de programación, y es lo que más rinde:

1. **Contraseña de Windows en la PC del almacén.** Sin eso, todo lo demás sobra.
2. **Cambiar la clave de fábrica** (`sfida2026`). La app avisa en amarillo
   mientras siga puesta.
3. **Copia semanal a un pendrive o a la nube.** El respaldo automático guarda
   las últimas 10 copias, pero **en el mismo disco**: sirve contra un error de
   digitación, no contra un disco roto o un robo.
4. **Cuidar los pendrives con respaldos**: cada uno es una copia completa y sin
   cifrar de todo el inventario.

---

## Cómo se revisó

- Lectura de las tres configuraciones de `webPreferences`.
- Lectura del preload completo y del contrato de IPC (71 canales).
- Búsqueda de SQL armado con texto, uno por uno, con su origen.
- Búsqueda de `eval`, `executeJavaScript`, `shell.*`, `exec` y `spawn`.
- Revisión de cada interpolación en el HTML de los dos tickets.
- Revisión del camino completo del dato importado por CSV hasta el exportado.

Las dos correcciones quedaron con prueba. Si aparece algo nuevo, va acá con el
mismo formato: qué era, por qué importaba **en esta app**, y qué se hizo.
