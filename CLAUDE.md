# SFIDA · Control de Útiles de Oficina y Limpieza (Electron)

Aplicación de escritorio para el control de inventario de útiles de oficina y
limpieza de SFIDA. La usa **una sola persona en una sola PC con Windows**.
Sin internet, sin servidor.

Responde siempre **en español**, con lenguaje sencillo (el usuario no es
programador). Los textos de la interfaz van en español con tildes.

Es la reescritura en Electron de la versión Python + PySide6 que está en
`../SFIDA - UTILITARIOS/SFIDA/`. **Ese proyecto es de solo lectura.**

---

## Cómo se ejecuta y se prueba

```bash
npm install                  # verifica que better-sqlite3 cargue en Electron
npm run dev                  # la app, con recarga en caliente
npm test                     # 241 pruebas de lógica, sin abrir ninguna ventana
npm run typecheck            # TypeScript en los tres procesos
npm run demo                 # crea datos/sfida_demo.db con datos de ejemplo
npm run capturas             # capturas de las 7 pantallas en 1366×768 y 1920×1080
npm run verificar:impresion  # PDF de los 3 formatos + comprobaciones del ticket
npm run verificar:nativos    # comprueba better-sqlite3 dentro de Electron
npm run dist                 # instalador NSIS + portable en release/
```

**Antes de dar por terminado cualquier cambio, corré `npm test` y
`npm run typecheck` y dejá los dos en cero.** Si agregás una función, agregale
su prueba.

> **Si `npm install` avisa que Electron no se descargó**, es npm 11 bloqueando
> los scripts de instalación:
> ```bash
> node node_modules/electron/install.js
> node node_modules/esbuild/install.js
> node node_modules/vite/node_modules/esbuild/install.js
> ```

---

## Arquitectura

| Carpeta | Responsabilidad |
|---|---|
| `src/main/nucleo/` | **Todo lo que no es visual**: reglas del negocio, SQL, validaciones. Es el equivalente de `sfida_core.py`. **No importa nada de Electron**, para que se pueda probar sin abrir ninguna ventana. |
| `src/main/db/` | Esquema (copia literal del de Python), apertura de la base y respaldo previo. |
| `src/main/impresion/` | El vale: armado del ticket, documento HTML y envío a la impresora. |
| `src/main/rutas.ts` | Dónde vive el `.db`. Port de `carpeta_datos()` / `ruta_bd()`. |
| `src/main/ipc.ts` | Los canales. **Todo** el acceso a datos pasa por acá. |
| `src/main/captura.ts` | Modo captura, para los puntos de control. |
| `src/preload/` | El único puente. Expone `window.sfida` y nada más. |
| `src/compartido/` | `contrato.ts`: los tipos del IPC, importados por los tres lados. |
| `src/renderer/` | React + Tailwind. Las 7 pantallas y los 7 diálogos. |
| `src/renderer/src/ui/graficos.tsx` | Los dos gráficos, en SVG propio. **Sin librería**: las que sirven pesan entre 400 KB y 1 MB y viajarían enteras en el instalador de la PC vieja. |
| `src/renderer/src/estado/animaciones.tsx` | El interruptor **y el vocabulario común** de tiempos y curvas (`CURVA`, `RAPIDO`, `NORMAL`, `RESORTE`, `cascada()`). Ninguna pantalla inventa los suyos. |
| `pruebas/` | Vitest. Corren en Node, sin ventanas. |

### Reglas de oro al modificar

1. **Cálculos y datos → `src/main/nucleo/`.** Nada de SQL en las pantallas.
2. **`contextIsolation: true` y `nodeIntegration: false`. No se desactivan.**
   El renderer no ve Node ni `ipcRenderer`: solo `window.sfida`.
3. **Todo canal IPC devuelve `Respuesta<T>` y NUNCA lanza.** Un `ErrorNegocio`
   llega a la pantalla como texto para mostrar, no como traceback.
4. **Errores esperables → `throw new ErrorNegocio("mensaje para el usuario")`.**
   Nunca dejes que reviente con un error crudo delante de quien usa el almacén.
5. **Nada de colores sueltos en las pantallas**: la paleta está en
   `estilos.css`, y sale de `sfida_estilo.py`.
6. **Todo campo de texto que escribe la persona va en MAYÚSCULAS**
   (`<Campo mayusculas />`). La excepción es el **buscador**.
7. **Un canal nuevo se declara primero en `contrato.ts`**, y recién después se
   implementa en `ipc.ts` y se expone en el preload.

---

## Modelo de datos (SQLite)

**Hasta la v4 el archivo era el MISMO que usa la app de Python.** Desde la
**v5 ya no**: se agregaron columnas a propósito y la app vieja no las entiende.

`pruebas/esquema.test.ts` compara contra `fijos/esquema-v5.txt` y además deja
por escrito **en qué** se separó de Python: 5 columnas agregadas, **cero
borradas** (una base v4 migrada no pierde nada), 5 índices nuevos y un solo
default cambiado. Si esa lista crece, la prueba falla y hay que decidir a
conciencia si `migraciones.ts` lo cubre.

**El esquema va en DOS constantes**, `ESQUEMA_TABLAS` y `ESQUEMA_INDICES`, y
`conectar()` intercala la migración entre las dos. No es un capricho: algunos
índices se apoyan en columnas que la v4 no tenía, y creándolos antes de migrar
una base vieja no abriría nunca. Ver la trampa 24.

**El orden de `conectar()` importa y está comentado ahí mismo:**
tablas → respaldo → normalizar unidades → migrar → índices → semillas.

- `categorias` · `articulos` · `sucursales`
- `ingresos` + `ingreso_det` → la boleta de compra
- `salidas` + `salida_det` → el vale de reparto a una sucursal
- `ajustes` → correcciones por conteo físico
- `config` → clave maestra (PBKDF2 + sal), datos de la empresa y
  `esquema_version`
- `auditoria` → qué se hizo, cuándo

**El stock nunca se guarda como columna**: se calcula sumando ingresos, menos
salidas, más ajustes (`SQL_STOCK` en `nucleo/stock.ts`). No agregues un campo
`stock` en `articulos`: rompería el kardex.

**El precio tampoco vive en el artículo**: pertenece a cada línea de la boleta
(`ingreso_det.costo_unitario`).

**`articulos.unidad` es la unidad de STOCK**, la más chica de su familia. Las
cantidades de `ingreso_det` y `salida_det` están SIEMPRE en esa unidad;
`cantidad_origen` + `unidad_origen` guardan lo que se digitó de verdad.

**`PRAGMA foreign_keys = ON` se activa en cada conexión.** SQLite las trae
apagadas: sin esto, los `ON DELETE CASCADE` no se disparan y anular una boleta
dejaría líneas huérfanas.

### Dónde vive el archivo

| Cómo corre | Dónde queda |
|---|---|
| `npm run dev` | `datos/sfida_dev.db` (copia, nunca la real) |
| Empaquetado | `%LOCALAPPDATA%\SFIDA\sfida_inventario.db` |
| `SFIDA_DB=...` | donde se le indique (manda por encima de todo) |

**Nunca calcules la ruta a partir de la ubicación del código.** En la versión Qt
eso causó una pérdida total de datos. El equivalente peligroso acá es
`app.getAppPath()` o `process.resourcesPath`.

**Ojo: `app.getPath('userData')` en Windows es `%APPDATA%` (Roaming), NO
`%LOCALAPPDATA%`.** La ruta se arma explícita en `rutas.ts`.

### Los dos respaldos, que son distintos

| Cuál | Cuándo | Cuántos |
|---|---|---|
| `respaldarConBase()` | **una sola vez**, antes de la primera escritura sobre una base heredada de Python | 1, marcado en `config.respaldo_pre_electron` |
| `respaldoAutomatico()` | **en cada apertura** (v5) | los últimos 10, en `respaldos/` |

En el primero el orden importa: **primero se copia, después se marca.** Al
revés, si la copia fallara quedaría marcado como respaldado sin estarlo.

Los dos corren **antes** de migrar: si la migración sale mal, el archivo de
antes sigue estando. Y los dos son red contra el error humano, **no** contra un
disco roto: siguen en el mismo disco. Ver `SEGURIDAD.md`.

---

## Reglas del negocio que no se deben romper

### TODO se digita y se guarda en MAYÚSCULAS

Cualquier texto que escribe la persona se guarda en MAYÚSCULAS con
`normalizarNombre()`, que colapsa espacios y **conserva tildes y Ñ**.

Alcanza a: nombre y código del artículo, categorías, sucursales (código,
nombre, dirección, responsable), proveedor, número de documento, número de
vale, quién entrega, quién recibe, motivo del ajuste y los datos de la empresa.

**Excepciones, y son deliberadas:**
- **El buscador NO se pone en mayúsculas.**
- **La `observacion` de ingresos y salidas tampoco**: solo `strip()`. El
  CLAUDE.md de la versión Python la enumeraba entre los campos que sí, pero el
  código no lo hacía. **Manda el código.**
- **El código del artículo** usa `strip().toUpperCase()`, no
  `normalizarNombre()`: conserva los espacios internos.
- **`normalizarDatosExistentes()` NO toca `articulos.codigo`.**

Las búsquedas siguen sin distinguir mayúsculas ni tildes.

### Solo hay DOS categorías

`ÚTILES DE OFICINA` y `ÚTILES DE LIMPIEZA`. No se pueden crear más.
`migrarCategorias()` corre sola al abrir la base: manda a oficina lo que venga
de categorías viejas (a limpieza solo si el nombre contiene «LIMPIEZA»).

### Unidades de medida con equivalencia

Catálogo cerrado de 22 unidades en 4 familias, cada una con su base:
`CONTEO`→UND, `VOLUMEN`→L, `PESO`→KG, `LARGO`→M.
1 GAL = 3.785 L · 1 DOC = 12 UND · 1 BD20 = 20 L · 1 SAC = 50 KG.

**`equivalenciaUnidad()` devuelve vacío si el factor es 1**, por eso CJA, PQT,
BOL, JGO, ROL y BLQ no muestran equivalencia aunque no sean la base.
**`normalizarUnidad()` nunca falla: cae en UND.**

### Fraccionamiento (v5)

Se compra por galón y se reparte por litro o por 500 ml. El artículo se define
en su unidad **chica** y cada movimiento se digita en la unidad que convenga.

**`convertirLinea()` convierte DOS cosas, no una: la cantidad Y el precio.**
Si un galón costaba S/ 22, el litro cuesta 22 / 3.785. Convertir solo la
cantidad valorizaría el inventario 3.785 veces de más **sin que nada avise**.

`aUnidadStock()` devuelve `null` entre familias distintas (litros a kilos no
existe) y eso se transforma en un error para la persona, nunca en una
conversión inventada.

**La tabla de unidades está duplicada** en `compartido/conversion.ts` para no
ir al proceso principal en cada tecla. Si se toca una, hay que tocar la otra:
lo vigila `pruebas/unidades.test.ts`.

Vive en `compartido/` y no en `renderer/` porque ahí la ven los tres lados **y
la pueden importar las pruebas**. Estando en `renderer/ui/` no se podía probar
sin romper el límite entre los dos proyectos de TypeScript.

### Un artículo no se repite en un vale de salida

En **salidas** un artículo aparece una sola vez: `agregar()` lo suma a la fila
que ya está (`juntarEnVale()`), y si las unidades no coinciden pasa todo a la
unidad de stock.

En **ingresos** sí se puede repetir, y es a propósito: la misma boleta puede
traer el mismo artículo a dos precios distintos, y son dos líneas legítimas.
Por eso `registrarIngreso()` **no** agrupa y `registrarSalida()` **sí**.

**Al agrupar, `cantidad_origen`/`unidad_origen` se van a NULL si las dos filas
venían en unidades distintas.** Sumar «1 GAL» con «500 ML» daba 501 con la
etiqueta GAL, y el ticket salía impreso diciendo 501 galones. Cuando no hay una
respuesta honesta, el ticket cae en la unidad de stock, que nunca miente.

### Movimientos

- No se puede registrar dos veces la misma boleta del **mismo proveedor**
  (`proveedor` + `nro_proveedor`). Un número de proveedor vacío se deja pasar:
  hay compras sin comprobante.
- **El N° interno del ingreso y el del vale los genera el sistema** y no se
  pueden editar (`siguienteNroIngreso()`, `siguienteNroVale()`).
- **`registrarSalida()` agrupa las líneas repetidas del mismo artículo ANTES de
  validar el stock**, y guarda una sola línea por artículo.
- El orden de validación de `registrarSalida()` importa para los mensajes:
  vale → fecha → sucursal → ítems → agrupar → stock → **recién ahí** si el vale
  ya existe.
- No se puede anular un ingreso si dejaría el stock en negativo.
- Un artículo con movimientos **no se borra, se desactiva**.
- Los ajustes no pueden dejar el stock negativo, y no pueden ser cero.
- **Tolerancia de 0.0001 en todas las comparaciones de stock** (son flotantes).
- La clave del Control Maestro se guarda encriptada (**PBKDF2-HMAC-SHA256,
  120000 iteraciones, 32 bytes**, exactamente igual que Python: si alguien la
  cambió desde la app vieja, tiene que entrar en la nueva). La de fábrica es
  `sfida2026`.

### Precios

- El precio es **opcional**: 0 significa «sin precio» y se muestra `—`, nunca
  `S/ 0.00`.
- **La valorización usa el ÚLTIMO precio pagado**, no un promedio.
- **`historialPrecios()` calcula las variaciones sobre TODAS las compras y
  recién después filtra por período.**
- **`kardex()` acumula el saldo sobre todo el histórico y después filtra**, y
  ordena por `fecha, tipo` alfabético (AJUSTE < INGRESO < SALIDA).

### Dos búsquedas distintas, a propósito

- `listarArticulos()` filtra con **LIKE en SQL**: sí distingue tildes.
- `listarStock()` filtra **en memoria con `coincide()`**: no distingue tildes ni
  mayúsculas. Es la que usa el buscador de la pantalla de stock.

---

## Impresión de los vales

Vive en `src/main/impresion/`. El vale se arma con letra monoespaciada dentro
de un `<pre>` para que las columnas queden alineadas como en la boleta física.
Tres formatos: **80 mm**, **58 mm** y **A4**.

**El vale se imprime desde una ventana OCULTA aparte.** Si se imprimiera la
ventana de la aplicación, saldrían los botones y el menú en el papel.

### Las trampas, todas vigentes

1. **`webContents.print()` mide en MICRONES** (80 mm = 80000);
   **`printToPDF()` en PULGADAS** (80 mm = 3.1496). Si se confunden, el
   resultado sale con un tamaño absurdo y el error no lo dice.
2. **`silent: true` necesita `deviceName` explícito.**
3. **`margins: { marginType: 'none' }`** evita que el driver térmico agregue
   márgenes propios.
4. **NO usar `document.documentElement.scrollHeight` para medir el alto**:
   devuelve el máximo entre el contenido y el viewport, así que todos los vales
   darían el mismo alto y el rollo botaría papel de más en cada ticket. Hay que
   medir el elemento.
5. **Si se destruye la última `BrowserWindow`, Electron cierra la app** y la
   carga siguiente falla con `ERR_FAILED (-2)`, un error que habla del archivo
   y no tiene nada que ver con el archivo. Por eso `hayValesAbiertos()`.
6. **Esperar `document.fonts.ready` antes de medir.**
7. **El tamaño de letra se MIDE, no se fija**: 42 caracteres a 10 pt no entran
   en 74 mm, y cada PC tiene fuentes distintas.
8. **El alto de la hoja cambia entre versiones de Electron** (0,2 mm de la 32 a
   la 43). Nunca fijarlo como constante.

### Cuentas de columnas

El ancho del nombre y la sangría de las líneas de abajo salen **los dos de
`SANGRIA_ITEM`** (=12); los rótulos de la cabecera, de `SANGRIA_CAMPO` (=10).
Escribir esos números a mano desalinea el ticket. **Lo vigilan las pruebas de
`pruebas/ticket.test.ts`.**

**En papel angosto (< 38 columnas) las firmas van una debajo de la otra.**
El ticket termina con **3 líneas en blanco** para que la cuchilla no corte el
texto.

---

## better-sqlite3

**NO se usa `@electron/rebuild`.** better-sqlite3 13.x usa N-API
(`node-addon-api`), que es ABI-estable entre Node y Electron, y trae un solo
binario por plataforma en `prebuilds/` que sirve para los dos. Verificado:
carga en Electron 43.2.0 sin recompilar nada.

Peor: al probar `@electron/rebuild` 4.2.0 contra better-sqlite3 13.0.3 informó
`✔ Rebuild Complete` **sin generar ningún `.node`**. Un OK falso tapa justo el
problema que venía a resolver.

En su lugar, `scripts/verificar-nativos.mjs` **comprueba**: abre Electron de
verdad, carga el módulo, hace una consulta y mira el resultado. Corre en el
`postinstall`.

**Ojo si alguna vez hay que bajar a better-sqlite3 12.x**: esa serie todavía
compila con node-gyp, y vuelve a hacer falta tener las herramientas de
compilación de Visual Studio en cualquier PC donde se haga `npm install`.

En el empaquetado, `asarUnpack` saca `better-sqlite3` del asar: el `.node` no
se puede cargar desde adentro del archivo empaquetado.

---

## Por qué Electron 43.2.0

**Exacta, sin `^`.** Es la versión que ya corre en producción en las otras dos
apps de almacén, en la misma PC de **Windows 10 build 14393** que originó la
migración (Qt 6 exige build 17763 y por eso el `.exe` viejo no abría ahí).
Está probada en las máquinas reales; la última del registro no.

Va sin cursor para que un `npm install` en otra PC no traiga una versión
distinta de la probada. Lo mismo con `electron-builder 26.15.3`.

**El resto del stack también va fijo**, y además porque `electron-vite 5` y
`@vitejs/plugin-react 6` piden versiones de Vite incompatibles entre sí. El
conjunto que encaja: `vite 7.3.6 · electron-vite 5.0.0 ·
@vitejs/plugin-react 5.2.0 · tailwindcss 4.3.3 · vitest 4.1.11 ·
typescript 5.9.3 · react 19.2.18 · framer-motion 13.1.1`.

---

## Animaciones

Con Framer Motion. **A diferencia de Qt, acá el CSS sí anima**, así que no hay
que construir cada movimiento a mano.

**Los tiempos y las curvas NO se escriben en cada pantalla.** Salen todos de
`estado/animaciones.tsx`, que es el vocabulario común:

| Constante | Para qué |
|---|---|
| `RAPIDO` (0.14 s) | lo que la persona **toca**: si el clic tarda, vuelve a hacer clic |
| `NORMAL` (0.22 s) | lo que **aparece** solo |
| `PAUSADO` (0.34 s) | barras y trazos de los gráficos |
| `RESORTE` | lo que se **desplaza** de un lugar a otro |
| `cascada(i)` | entrada escalonada de una lista, **topeada** a 14 filas |

Cuando cada pantalla elige los suyos, el conjunto se siente desprolijo aunque
cada parte por separado esté bien.

| Qué | Cómo |
|---|---|
| Cambio de página | Deslizamiento horizontal + 2 % de escala. La dirección sale del orden del menú. |
| Pastilla del menú y chips | `RESORTE`, para que **viajen** en vez de desplazarse a velocidad constante. |
| Filas de tabla | Entran en cascada. Como la clave es el id, **al filtrar solo se animan las nuevas**: si se animara todo en cada tecla, escribir sería mareante. |
| Avisos | `layout` + resorte: al irse uno, los de abajo se deslizan a su lugar. Se van a los **6 segundos**. |
| Diálogos | Entran con resorte, salen con curva simple: un resorte al cerrar rebota cuando la persona ya dejó de mirar. |
| Gráfico de línea | La línea se traza de izquierda a derecha. Es el único movimiento largo y se justifica: es lo que hace mirar el gráfico. |

**`layoutId` tiene que ser único por grupo.** Es un identificador global de
Framer Motion: dos grupos de chips visibles a la vez con el mismo `layoutId`
hacen que la pastilla salte de un grupo al otro. Por eso `Chips` usa `useId()`.

**El interruptor** vive en Control Maestro → Respaldos y datos, se guarda en
`config` y de fábrica viene **encendido**. Además se respeta **siempre**
`prefers-reduced-motion` del sistema: `useAnimaciones()` combina los dos.

---

## Layout: la app tiene que entrar en 1366×768

Es lo que hay en el almacén, y es donde la versión Qt se rompía: los botones se
montaban encima de las tablas porque Qt no achica por debajo del mínimo de los
hijos.

En web no pasa igual, pero hay que hacerlo bien:

- Las barras de controles usan `flex-wrap`.
- **El ancho de un control va en un `<div>` contenedor, no en el `<input>`**:
  si se pone en el mismo elemento, `w-full` y la clase de ancho compiten y gana
  el orden de la hoja de estilos, no el del atributo `class`. Eso rompía las
  barras de filtros.
- Las tablas anchas scrollean dentro de su caja (`overflow-auto`).
- `npm run capturas` deja un informe `[layout]` con los desbordes: tiene que
  dar `desbordes: []` en los dos tamaños. **Pero las capturas hay que
  mirarlas**: el verificador no ve que algo quede feo, solo que no desborde.

---

## Cambios deliberados respecto de la versión Python

Están en `CAMBIOS_DELIBERADOS.md`, en dos partes.

**La v4 fue un port fiel**, con tres excepciones:

1. **El correlativo del vale usa MAX del sufijo, no `COUNT(*)+1`.** Con COUNT,
   al anular un vale del medio el sistema proponía un número ya ocupado y
   avisaba «ya existe» sobre su propia sugerencia. *Límite conocido: anular el
   vale más alto sí libera su número.*
2. **La observación de la salida se conecta.** La columna existía y el ticket
   ya la imprimía; solo faltaba que la pantalla la llenara.
3. **La casilla «Imprimir el vale al guardar» sigue marcada de fábrica.**

**La v5 ya no es un port**: rompe la compatibilidad con Python a propósito.
Fraccionamiento, N° de ingreso automático + N° del proveedor aparte, vale no
editable, tickets nuevos, las tres supermejoras y dos correcciones de
seguridad. Cada una con su motivo en `CAMBIOS_DELIBERADOS.md`.

Cualquier diferencia que **no** esté en ese archivo es un error, no una
decisión.

---

## El registro de trampas

`TRAMPAS.md` tiene 24 entradas, cada una con **cómo se detectó**. Esa parte
suele ser más útil que la solución. Si encontrás algo que falló de una forma
que no se parecía al problema real, o que funcionó dando un resultado falso,
sumalo ahí.

---

## Estilo de código

- **Español** en nombres de funciones y variables del dominio
  (`registrarSalida`, `stockDe`, `alertasStockMinimo`).
- Comentarios breves y en español, explicando **por qué**, no qué.
- TypeScript estricto. `npm run typecheck` en cero antes de terminar.
- Sin dependencias nuevas salvo que sea imprescindible. Si vas a agregar una,
  avisá primero por qué.
