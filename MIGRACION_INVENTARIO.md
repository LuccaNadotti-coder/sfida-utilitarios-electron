# MIGRACIÓN SFIDA · Inventario del proyecto Python

Especificación de la aplicación actual (PySide6 + SQLite), leída del código
real en `Proyectos/SFIDA - UTILITARIOS/SFIDA/`, no de la memoria ni del
CLAUDE.md solamente. **Lo que no esté en este documento se pierde en la
migración.**

- Versión de origen: `sc.VERSION = "3.1"` (el docstring de `SFIDA.py` todavía
  dice 3.0: está desactualizado, la fuente de verdad es `sfida_core.py`).
- Fecha del inventario: 21/08/2026.
- Proyecto Python: **solo lectura**. No se modificó ningún archivo.

---

## 0. Mapa de archivos

| Archivo | Líneas aprox. | Responsabilidad |
|---|---|---|
| `sfida_core.py` | 1580 | Toda la lógica y los datos. No importa PySide6. **Es lo que hay que portar al proceso principal de Electron.** |
| `sfida_estilo.py` | 1690 | Paleta, QSS, iconos dibujados por código, controles reutilizables, animaciones. |
| `sfida_paginas.py` | 1180 | Las 6 pantallas operativas. |
| `sfida_dialogos.py` | 538 | 5 diálogos. |
| `sfida_maestro.py` | 610 | Control Maestro (5 pestañas) + diálogo de clave. |
| `sfida_impresion.py` | 671 | Vales: ticket 80/58 mm, A4, ventana de impresión. |
| `SFIDA.py` | 511 | Ventana principal, menú lateral, navegación, avisos, exportación. |
| `test_core.py` | ~610 | Pruebas de lógica. |
| `test_app.py` | ~625 | Pruebas de interfaz + generación de capturas. |

Archivos de apoyo: `SFIDA.spec` (PyInstaller), `instalador.iss` (Inno Setup),
`CREAR_INSTALADOR.bat`, `MANUAL DE USO.txt`, `sfida.ico` / `sfida.png`,
`capturas/` (11 PNG generados por `test_app.py`).

---

## 1. Esquema exacto de la base de datos

Definido en la constante `ESQUEMA` (`sfida_core.py:100-193`) y **verificado
contra el archivo real** `%LOCALAPPDATA%\SFIDA\sfida_inventario.db` con
`PRAGMA table_info` / `PRAGMA foreign_key_list`. Coinciden exactamente.

> **Regla para el port: mismos nombres de tabla, columna e índice. Sin
> renombrar, sin normalizar distinto.** Las dos apps comparten el archivo.

### 1.1 Tablas

```sql
CREATE TABLE IF NOT EXISTS categorias (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS articulos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo        TEXT NOT NULL UNIQUE,
    nombre        TEXT NOT NULL,
    categoria_id  INTEGER REFERENCES categorias(id),
    unidad        TEXT NOT NULL DEFAULT 'UNIDAD',
    stock_minimo  REAL NOT NULL DEFAULT 0,
    activo        INTEGER NOT NULL DEFAULT 1,
    creado_en     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sucursales (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo       TEXT NOT NULL UNIQUE,
    nombre       TEXT NOT NULL,
    direccion    TEXT DEFAULT '',
    responsable  TEXT DEFAULT '',
    activo       INTEGER NOT NULL DEFAULT 1,
    creado_en    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS ingresos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_doc      TEXT NOT NULL DEFAULT 'BOLETA',
    nro_documento TEXT NOT NULL,
    fecha         TEXT NOT NULL,
    proveedor     TEXT DEFAULT '',
    observacion   TEXT DEFAULT '',
    creado_en     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE (tipo_doc, nro_documento)
);

CREATE TABLE IF NOT EXISTS ingreso_det (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ingreso_id     INTEGER NOT NULL REFERENCES ingresos(id) ON DELETE CASCADE,
    articulo_id    INTEGER NOT NULL REFERENCES articulos(id),
    cantidad       REAL NOT NULL CHECK (cantidad > 0),
    costo_unitario REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS salidas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nro_vale      TEXT NOT NULL UNIQUE,
    fecha         TEXT NOT NULL,
    sucursal_id   INTEGER NOT NULL REFERENCES sucursales(id),
    entregado_por TEXT DEFAULT '',
    recibido_por  TEXT DEFAULT '',
    observacion   TEXT DEFAULT '',
    creado_en     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS salida_det (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    salida_id   INTEGER NOT NULL REFERENCES salidas(id) ON DELETE CASCADE,
    articulo_id INTEGER NOT NULL REFERENCES articulos(id),
    cantidad    REAL NOT NULL CHECK (cantidad > 0)
);

CREATE TABLE IF NOT EXISTS ajustes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha       TEXT NOT NULL,
    articulo_id INTEGER NOT NULL REFERENCES articulos(id),
    cantidad    REAL NOT NULL,          -- positivo suma, negativo resta
    motivo      TEXT DEFAULT '',
    creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT
);

CREATE TABLE IF NOT EXISTS auditoria (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    momento TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    accion  TEXT NOT NULL,
    detalle TEXT DEFAULT ''
);
```

### 1.2 Índices

Explícitos (los únicos tres):

```sql
CREATE INDEX IF NOT EXISTS ix_ing_det_art ON ingreso_det(articulo_id);
CREATE INDEX IF NOT EXISTS ix_sal_det_art ON salida_det(articulo_id);
CREATE INDEX IF NOT EXISTS ix_sal_suc     ON salidas(sucursal_id);
```

Implícitos que crea SQLite por los `UNIQUE` / `PRIMARY KEY TEXT` (aparecen en
el archivo real, no hay que escribirlos): `sqlite_autoindex_articulos_1`,
`sqlite_autoindex_categorias_1`, `sqlite_autoindex_config_1`,
`sqlite_autoindex_ingresos_1`, `sqlite_autoindex_salidas_1`,
`sqlite_autoindex_sucursales_1`.

### 1.3 Detalles del esquema que se rompen fácil

- **`PRAGMA foreign_keys = ON` se activa en cada conexión** (`conectar()`).
  SQLite lo trae apagado de fábrica: en better-sqlite3 hay que hacer
  `db.pragma('foreign_keys = ON')` explícitamente o los `ON DELETE CASCADE`
  de `ingreso_det` / `salida_det` **no se disparan** y anular una boleta
  dejaría líneas huérfanas.
- Las fechas son `TEXT` en ISO `AAAA-MM-DD` (se comparan como cadenas: por eso
  funcionan los `fecha >= ?`). Los `creado_en` / `momento` son
  `AAAA-MM-DD HH:MM:SS` en hora **local**, no UTC (`datetime('now','localtime')`).
- `activo` es `INTEGER` 0/1, no booleano.
- **No hay columna `stock` en `articulos` y no debe agregarse.** El stock se
  calcula (ver 3.5).
- **No hay columna `precio` en `articulos` y no debe agregarse.** El precio
  vive en `ingreso_det.costo_unitario`.
- `sqlite_sequence` existe porque se usa `AUTOINCREMENT`.

### 1.4 Claves conocidas de la tabla `config`

| Clave | Valor | Quién la escribe |
|---|---|---|
| `clave_maestra` | hash PBKDF2-HMAC-SHA256, 120000 iteraciones, hex | `cambiar_clave` |
| `clave_sal` | sal aleatoria de 16 bytes en hex | `cambiar_clave` |
| `animaciones` | `"1"` / `"0"` | `set_animaciones` |
| `empresa` | nombre del membrete del vale | Control Maestro → Datos |
| `empresa_dir` | dirección del membrete | Control Maestro → Datos |
| `empresa_ruc` | RUC del membrete | Control Maestro → Datos |
| `impresora_vales` | última impresora usada | `DlgImprimir._recordar` |
| `papel_vales` | último ancho usado (`80` / `58` / `210`) | `DlgImprimir._recordar` |

### 1.5 Estado real de la base de producción (al 21/08/2026)

`%LOCALAPPDATA%\SFIDA\sfida_inventario.db` — 86 016 bytes:

| Tabla | Filas |
|---|---|
| `articulos` | 34 |
| `categorias` | 2 |
| `ingresos` / `ingreso_det` | 0 / 0 |
| `salidas` / `salida_det` | 0 / 0 |
| `ajustes` | 0 |
| `auditoria` | 0 |
| `config` | 0 |
| `sucursales` | 0 |

Los 34 artículos son exactamente el `CATALOGO_SUGERIDO` que ofrece cargar la
app al primer uso. **La base de producción todavía no tiene movimientos, ni
sucursales, ni datos de la empresa.** → Ver la pregunta 1 en la sección 9.

---

## 2. Las pantallas

Menú lateral, en este orden (`MENU` en `SFIDA.py:80-86`). El acceso rápido es
`Ctrl+1` … `Ctrl+7` según ese mismo orden.

| Clave | Título | Subtítulo | Icono | Clase |
|---|---|---|---|---|
| `panel` | Panel de control | Resumen del almacén al día de hoy | panel | `PanelPage` |
| `stock` | Artículos y stock | Todo lo que hay en el almacén | caja | `StockPage` |
| `ingresos` | Ingresos por boleta | Mercadería que entra al almacén | entrada | `IngresoPage` |
| `salidas` | Salidas a sucursal | Reparto de mercadería a los locales | salida | `SalidaPage` |
| `sucursales` | Sucursales | Locales a los que se reparte la mercadería | tienda | `SucursalPage` |
| `reportes` | Reportes | Consumo por sucursal, kardex, ranking e historial de precios | reporte | `ReportePage` |
| `maestro` | Control Maestro | Sección restringida: solo con contraseña | candado | `MaestroPage` |

> El texto del menú lateral difiere del título de la página en dos casos:
> el menú dice «Ingresos (boletas)» y «Salidas a sucursal», la página dice
> «Ingresos por boleta» y «Salidas a sucursal».

### 2.1 Chasis común (`SFIDA.py`)

- **Barra lateral** de 238 px de ancho fijo: logo «SFIDA», subtítulo «Control
  de útiles», los 7 ítems (con un espacio extra de 12 px después de
  «Reportes»), y al pie «SFIDA v3.1 / Base de datos local» con la ruta del
  `.db` en el tooltip.
- **Pastilla activa**: un widget aparte (`#navActivo`, coral) que se desliza
  hasta el botón elegido. Va *detrás* de los botones; el botón marcado tiene
  fondo transparente para que no se vean dos pastillas.
- **Barra superior** de 78 px: título + subtítulo de la página (elididos con
  `EtiquetaElidida` para no imponer un ancho mínimo a la ventana), buscador
  global («Buscar en todo el sistema · Ctrl+B», 210–340 px) y la fecha de hoy
  en `dd/MM/yyyy`.
- **Toast de avisos** abajo del contenido, con margen 26/16. Tres tonos:
  `ok` (verde), `err` (rojo), `info` (ámbar). Se oculta a los **6000 ms**.
  Cada aviso lleva un número correlativo (`_aviso_id`): si aparece otro
  mientras el anterior se está por ir, el temporizador viejo no apaga el nuevo.
- **Atajos**: `Ctrl+B` y `Ctrl+F` → búsqueda global; `F5` → refrescar todo;
  `Ctrl+1..7` → ir a la sección.
- **Tamaños de ventana**: mínimo `(1300, 560)`; abre en `1360×860` pero nunca
  más grande que `pantalla disponible − 60 px` (`_abrir_adaptada`).
- **`refrescar_todo()`** solo refresca la página actual y el Panel; las demás
  se refrescan al entrar.
- **Al cerrar** pide confirmación («¿Desea cerrar SFIDA?»).
- **Primer uso**: 400 ms después de abrir, si no hay artículos, ofrece cargar
  el catálogo sugerido; si acepta, avisa y navega a «Artículos y stock».
- **`ir_a()` bloquea el Control Maestro** al salir de esa sección.

### 2.2 Panel de control

De arriba hacia abajo:

1. **Fila de 6 tarjetas** (`Tarjeta`: título, valor grande, pie, color, icono):

   | Tarjeta | Color | Icono | Valor | Pie |
   |---|---|---|---|---|
   | Artículos | AZUL | caja | activos | «activos en el almacén» |
   | Sucursales | AZUL_CLR | tienda | activas | «locales atendidos» |
   | Ingresos | VERDE | entrada | nº de boletas | «boletas registradas» |
   | Salidas | AZUL | salida | nº de vales | «vales de reparto» |
   | Alertas | ROJO | alerta | nº de alertas | «artículos por comprar» / «todo abastecido» |
   | Valorizado | AMBAR_OSC | etiqueta | `fmt_money` | «según el último precio» |

2. **«Nivel del inventario»** (proporción 4): gráfico de dona `GraficoDona` con
   tres segmentos — En buen nivel (verde), Por agotarse (ámbar), Bajo el
   mínimo (rojo). Leyenda central «en buen nivel».
3. **«Movimiento de los últimos 6 meses»** (proporción 5): `MiniGrafico` con
   entradas y salidas por mes.
4. **«Artículos más repartidos»** (proporción 5): `BarrasProporcion`, top 6,
   etiqueta «cantidad + unidad en minúscula».
5. **«Necesitan reposición»** (proporción 6): tabla `Código · Artículo · Stock
   · Mínimo · Faltan` (anchos 90/auto/70/70/70, alto mín. 150). Stock y
   «Faltan» en rojo. **Si no hay alertas se pinta una fila con el texto «Sin
   alertas: todo el stock está sobre el mínimo»** — no se deja la tabla vacía.
6. **«Últimos movimientos»**: tabla `Fecha · Tipo · Documento · Detalle ·
   Unidades` (110/120/180/auto/100). Mezcla los 12 últimos ingresos y las 12
   últimas salidas, ordena por fecha descendente y **muestra 10**. El «Tipo»
   va como etiqueta redondeada verde (Ingreso) o azul (Salida).

### 2.3 Artículos y stock

- **Barra**: buscador («Buscar por nombre, código o categoría…», 38 px de alto,
  mín. 290 px) + combo de categoría («Todas las categorías» + las dos) +
  segmentado de 3 chips exclusivos **Todos / Bajo el mínimo / Sin stock** +
  botón verde «Nuevo artículo».
- **Tabla** de 10 columnas: `Código · Artículo · Categoría · Unidad · Stock ·
  Equivale a · Mínimo · Estado · Último precio · Fecha`
  (92/auto/104/68/68/96/72/108/112/108). Doble clic edita.
  - «Categoría» usa `categoria_corta()` → OFICINA / LIMPIEZA.
  - «Equivale a» es el stock convertido a la unidad base, o `—` si la unidad
    ya es la base.
  - «Estado» es una etiqueta de color según `color_estado()`.
  - «Último precio» con `fmt_precio()` (guion si nunca tuvo precio) y «Fecha»
    en `dd/mm/aaaa`, o `—` si no hay precio.
  - Alineados a la derecha: Stock, Equivale a, Mínimo, Último precio.
- **Pie**: contador «N artículos» + 7 botones: Editar · **Ajustar stock**
  (ámbar) · Ver kardex · Ver precios · Importar de Excel · Plantilla de carga
  · Exportar.
  - «Ver kardex» y «Ver precios» navegan a Reportes con la pestaña y el
    artículo ya seleccionados.
- Los filtros «Bajo el mínimo» y «Sin stock» se aplican distinto: el primero
  va en el SQL (`solo_bajo_minimo`), el segundo se filtra en memoria
  (`stock <= 0`).
- **Exportar** genera 11 columnas: Código, Artículo, Categoría, Unidad, Nombre
  de la unidad, Stock, Equivale a, Unidad base, Mínimo, Último precio, Fecha
  del precio.

### 2.4 Ingresos por boleta

Tres bloques apilados:

1. **«Datos del documento de compra»** — grilla de 5 columnas: Tipo (combo
   `BOLETA / FACTURA / GUÍA / OTRO`), N° de documento (mayúsculas,
   placeholder `B001-1234`), Fecha (calendario propio), Proveedor
   (mayúsculas), Observación (mayúsculas). Las columnas 3 y 4 estiran ×2.
2. **«Artículos que ingresan»** — combo de búsqueda de artículo (proporción 5,
   40 px de alto) + botón `+` (44 px, crea un artículo nuevo sin salir) +
   Cantidad (`SpinNumero` 0–999999, 0 decimales, 148 px) + Precio
   (`SpinNumero` 0–999999, 2 decimales, paso 0.5, prefijo `S/ `, 168 px) +
   botón verde «Agregar».
   - Debajo, en gris, **el último precio pagado como ayuda**: «Último precio:
     S/ X · PROVEEDOR · dd/mm/aaaa», o «Sin precio registrado». **Nunca
     rellena el campo del precio.**
   - Tabla del detalle: `Artículo · Cantidad · Unidad · Precio unit. ·
     Subtotal` (auto/100/110/120/120, alto mín. 150). Subtotal `—` si no hay
     precio.
   - Fila inferior: «Quitar línea» (rojo) · total «Total: S/ 0.00» en 19 px ·
     «Limpiar» (gris) · «Guardar ingreso» (verde).
3. **«Historial de ingresos»** — buscador («Buscar por documento o
   proveedor…») + «Ver detalle» + «Anular ingreso» (rojo). Tabla `Fecha ·
   Documento · Proveedor · Ítems · Unidades · Total S/`
   (110/175/auto/85/105/115). Doble clic abre el detalle.

Comportamiento:
- Al guardar, el aviso dice cuántas unidades se sumaron y **cuántas líneas
  quedaron sin precio**, si las hubo.
- «Anular ingreso» pide la clave del Control Maestro y después confirma.
- «Ver detalle» abre `DlgDetalleIngreso` (precios editables).

### 2.5 Salidas a sucursal

1. **«Vale de salida»** — grilla de 5 columnas: N° de vale (editable,
   mayúsculas), Fecha, Sucursal destino (combo, mín. 230 px), Entregado por,
   Recibido por.
   - Debajo, una **línea de estado del número de vale** en 12 px, con cuatro
     mensajes posibles:
     - vacío → «Escriba el número del vale.» (rojo)
     - ya existe → «Ojo: el vale X ya fue registrado antes.» (rojo)
     - escrito a mano → «Número escrito a mano (el de su boleta física).» (gris)
     - automático → «Correlativo del sistema. Puede cambiarlo si su boleta
       física tiene otro número.» (gris)
   - Botón «Usar el correlativo del sistema» que vuelve al automático.
2. **«Artículos que se reparten»** — combo de artículo + **etiqueta de
   disponible** (mín. 210 px, centrada, fondo `#eef1f6`, negrita) que muestra
   «Disponible: 3 GAL (11.36 L)» y cambia de color: rojo si ≤ 0, ámbar si ≤ el
   mínimo, verde si no + Cantidad + «Agregar» (verde).
   - Tabla: `Artículo · Cantidad · Unidad · Queda en almacén`
     (auto/110/120/150, alto mín. 140). La columna «Queda en almacén»
     descuenta lo ya cargado en el vale en curso.
   - Fila inferior: «Quitar línea» (rojo) · «Limpiar» (gris) · casilla
     **«Imprimir el vale al guardar» (marcada de fábrica)** · «Guardar salida»
     (verde, 42 px).
3. **«Historial de repartos»** — buscador («Buscar por vale o quién
   recibió…») + combo de sucursal («Todas las sucursales») + «Ver detalle» +
   **«Imprimir vale»** (azul, con icono de impresora, 40 px) + «Anular salida»
   (rojo). Tabla `Fecha · Vale · Sucursal · Recibió · Ítems · Unidades`
   (110/130/auto/175/85/105).

Comportamiento:
- **La validación de stock se hace dos veces**: al agregar la línea (avisa
  «Stock insuficiente: solo quedan X de Y») y otra vez en `registrar_salida`.
- «Ver detalle» abre un `QMessageBox` con texto plano (no es un diálogo
  propio). En Electron conviene hacerlo un modal decente.
- «Anular salida» pide clave + confirmación; los artículos vuelven al stock.
- Al guardar, si la casilla está marcada, abre la ventana de impresión.

### 2.6 Sucursales

- Barra: buscador («Buscar sucursal…») + «Editar» + «Nueva sucursal» (verde).
- Tabla: `Código · Sucursal · Dirección · Responsable · Vales · Unidades
  recibidas · Último reparto` (90/200/auto/170/80/150/130). Doble clic edita.
- Los totales salen de `consumo_por_sucursal` **cruzados por `codigo`**, no
  por id. El «Último reparto» es la fecha de la salida más reciente, o `—`.
- El filtro del buscador usa `coincide()` sobre código, nombre y responsable
  (insensible a tildes y mayúsculas).

### 2.7 Reportes

- **Barra de período**: Desde (por defecto hoy − 90 días) · Hasta (hoy) ·
  «Actualizar» · tres chips: **Este mes** (día 1 del mes actual), **Últimos 3
  meses** (hoy − 90), **Todo** (desde 2000-01-01) · «Exportar reporte».
- **4 pestañas**:

  1. **Consumo por sucursal** — tabla `Código · Sucursal · Vales · Unidades ·
     Valor S/` (90/auto/90/110/120, alto mín. 170). Al seleccionar una fila se
     llena la tabla de abajo: `Código · Artículo · Unidad · Cantidad`, con el
     rótulo «Detalle entregado a X» (o «Detalle — seleccione una sucursal»).
     **El «Valor S/» se calcula en la pantalla**, no en el core: suma
     `cantidad × último precio` de cada artículo entregado.
  2. **Kardex por artículo** — combo de artículo + etiqueta «Stock actual: 3
     GAL (11.36 L)» en azul. Tabla `Fecha · Tipo · Documento · Destino /
     proveedor · Entrada · Salida · Saldo` (110/100/175/auto/95/95/100).
     Entradas en verde, salidas en rojo.
  3. **Artículos más usados** — tabla `# · Código · Artículo · Unidad · Total
     repartido` (45/100/auto/120/150), top 40 en pantalla, top 200 al exportar.
  4. **Historial de precios** — combo de artículo + 3 tarjetas (Precio más
     bajo/verde, Precio más alto/rojo, Precio promedio/azul, 96 px de alto
     mínimo) + tabla `Fecha · Documento · Proveedor · Cantidad · Precio unit. ·
     Variación` (110/165/auto/100/120/110). La variación va en rojo si subió y
     verde si bajó. Nota al pie: «Cada compra puede tener un precio distinto.
     En verde bajó respecto de la compra anterior, en rojo subió.»
     Si no hay artículo elegido, las tres tarjetas muestran `—` / «elija un
     artículo».

- **«Exportar reporte» exporta la pestaña activa**, con columnas distintas en
  cada caso (ver `ReportePage.exportar`).

### 2.8 Control Maestro

Protegida por clave. `con_scroll = False`: **scrollea cada pestaña por
separado** para que la fila de pestañas no se vaya de la vista.

**Vista bloqueada**: caja centrada (mín. 520 / máx. 560 px) con icono de
candado de 56 px, título, explicación, campo de clave, botón «Entrar» y —si la
clave sigue siendo la de fábrica— el recordatorio «Clave de fábrica:
sfida2026».
- Cuenta los intentos: «Clave incorrecta (intento N)».
- **A los 5 intentos fallidos deshabilita el campo 30 segundos** («Demasiados
  intentos. Espere 30 segundos.»).
- Cada fallo queda en auditoría como `ACCESO DENEGADO`.
- Al entrar: auditoría `CONTROL MAESTRO / acceso concedido` y aviso «Control
  Maestro abierto. Se cerrará al salir de la sección.»
- **Se re-bloquea automáticamente al navegar a otra sección** y con el botón
  «Bloquear ahora».

**5 pestañas**:

1. **Seguridad** — cambiar la clave (actual / nueva / repetir). Valida que las
   dos nuevas coincidan (mensaje propio de la pantalla) y delega el resto al
   core. Nota: «La clave se guarda encriptada. Si la olvida no se puede
   recuperar: anótela en un lugar seguro.»
2. **Stock mínimo en lote** — «Calcular según el consumo de los últimos [N]
   meses» (1–24, por defecto 3) + «Factor de seguridad» (0.1–5.0, 1 decimal,
   por defecto 1.0) + «Calcular». Segunda fila: nota + «Copiar sugeridos» +
   «Guardar cambios». Tabla `Artículo · Consumo prom. / mes · Mínimo actual ·
   Sugerido · Nuevo mínimo`; **solo la última columna es editable** (fondo
   `#f7fbff`). Al guardar ignora las celdas inválidas y las cuenta en el aviso.
   > **Está repartido en dos filas a propósito**: en una sola línea sumaba
   > 1116 px y no entraba en 1366.
3. **Catálogos** — dos columnas.
   - Izquierda (proporción 1): lista de categorías con «N artículo(s)»
     (máx. 90 px de alto) + nota de que son fijas; tabla de unidades `Unidad ·
     Nombre · Tipo · Equivale a` (mín. **132 px** de alto — 230 px empujaba el
     botón fuera de la pestaña) + nota; botón ámbar **«Pasar todo a
     MAYÚSCULAS»** con confirmación previa.
   - Derecha (proporción 2): «Artículos desactivados», tabla `Código ·
     Artículo · Categoría` + botón «Reactivar».
4. **Auditoría** — buscador + «Exportar» + «Limpiar antiguos». Tabla
   `Fecha y hora · Acción · Detalle` (**185**/170/auto — 150 px cortaba la
   hora). Se pintan en rojo las filas cuya acción contiene `DENEGADO`,
   `ANULA` o `BORRADO`. Muestra 400 registros; exporta 5000.
   «Limpiar antiguos» deja los últimos 200, con confirmación.
5. **Respaldos y datos** — cuatro cajas:
   - **Datos de la empresa**: nombre (sale en los vales), dirección, RUC
     (opcional). Todos en mayúsculas. Botón «Guardar datos».
   - **Copia de seguridad**: muestra la ruta del `.db` + «Crear copia de
     seguridad» / «Restaurar desde una copia» (ámbar) / «Abrir la carpeta».
     Restaurar advierte, guarda un `.antes_de_restaurar` y **cierra la app**.
   - **Apariencia**: casilla «Animaciones suaves» + explicación. Se aplica al
     instante (corta cualquier transición en curso) y queda en auditoría.
   - **Zona de riesgo**: «Borrar todos los movimientos» (rojo). Pide escribir
     literalmente **`BORRAR`** en un cuadro de texto. Conserva artículos y
     sucursales.

### 2.9 Diálogos

| Diálogo | Archivo | Qué hace |
|---|---|---|
| `DlgArticulo` | `sfida_dialogos.py` | Alta/edición de artículo. |
| `DlgSucursal` | `sfida_dialogos.py` | Alta/edición de sucursal. |
| `DlgAjuste` | `sfida_dialogos.py` | Ajuste por conteo físico. |
| `DlgDetalleIngreso` | `sfida_dialogos.py` | Detalle de boleta con precios editables. |
| `DlgBusquedaGlobal` | `sfida_dialogos.py` | Búsqueda general (Ctrl+B). |
| `DlgClave` | `sfida_maestro.py` | Pide la clave para una acción puntual. |
| `DlgImprimir` | `sfida_impresion.py` | Ventana de impresión del vale. |

**`DlgArticulo`** (mín. 520 px de ancho) — pensado para cargar muchos rápido:
- Nombre (mayúsculas), y debajo un **aviso de parecidos en vivo**: con 3 o más
  letras busca con `coincide()` entre todos los artículos (activos e
  inactivos) y muestra «Ya existe algo parecido: A, B, C» (hasta 3). Es un
  aviso, **no bloquea**.
- Categoría (combo con las dos) y Unidad (combo del catálogo completo, **con
  separadores entre familias**, máx. 14 visibles). Debajo del combo de unidad,
  en azul, una de tres frases: «Equivale a: 1 GAL = 3.785 L» / «Se cuenta de a
  uno (no se convierte).» / «Es la unidad base de volumen.»
- Código + casilla **«Automático»** (marcada al crear, desmarcada al editar).
  El prefijo sale de `PREFIJOS`: `OFI` para oficina, `LIM` para limpieza.
  Al cambiar de categoría, re-sugiere el código.
- Stock mínimo.
- **«Stock inicial que ya tiene en el almacén (opcional)»** — solo al crear.
  Si es > 0 registra un ajuste con motivo «Stock inicial».
- Botones: Cancelar · **«Guardar y crear otro»** (oculto al editar) · Guardar.
  «Guardar y crear otro» limpia el nombre y el stock inicial, re-sugiere el
  código y deja el foco en el nombre.
- Al crear arranca en la categoría **más usada** (la que tiene más artículos
  activos), o en oficina.
- Cuenta los creados en `creados` para que la pantalla avise «Se registraron N
  artículo(s)».

**`DlgSucursal`** (mín. 460 px): Código, Nombre, Dirección, Responsable, todos
en mayúsculas. Al crear propone `SUC01`, `SUC02`… según la cantidad existente
(**incluyendo las inactivas**).

**`DlgAjuste`** (mín. 440 px): muestra el nombre y «Stock según el sistema: 3
GAL (11.36 L)». Se escribe **la cantidad real contada**, no la diferencia. En
vivo muestra «Sin diferencia» / «Sumará N unidades» (verde) / «Descontará N
unidades» (rojo). Motivo: combo **editable** con 5 sugerencias — INVENTARIO
FÍSICO, MERMA O DETERIORO, ERROR DE DIGITACIÓN, PÉRDIDA, DEVOLUCIÓN DE
SUCURSAL. Si la diferencia es 0, cierra sin hacer nada.

**`DlgDetalleIngreso`** (mín. 720×480): cabecera «BOLETA B001-1234 ·
dd/mm/aaaa · PROVEEDOR». Tabla `Artículo · Cantidad · Unidad · Precio unit. ·
Subtotal`; **solo la columna «Precio unit.» (índice 3) es editable**, con
fondo `#eaf1ff`. Al guardar limpia el texto (`S/`, comas por puntos, el guion
`—` → 0) y llama a `actualizar_costo_linea` fila por fila; junta los errores y
los muestra sin cerrar. Total de la boleta al pie. Nota: «Las cantidades no se
editan aquí: para eso anule la boleta.»

**`DlgBusquedaGlobal`** (mín. 680×460): un solo campo que busca a la vez en
artículos (hasta 12, vía `listar_stock`), ingresos (revisa 40, filtra con
`coincide` sobre documento/proveedor/tipo) y salidas (revisa 40, filtra sobre
vale/sucursal/quién recibió). **Exige 2 letras mínimo** («Escriba al menos 2
letras…»). Sin resultados: «Sin resultados para «X»». Doble clic o «Ir al
resultado» navega a la sección y **selecciona la fila**.

**`DlgClave`** (mín. 420 px): icono de candado, «Se necesita la clave del
Control Maestro», el motivo de la acción, campo de contraseña. Si el Control
Maestro ya está desbloqueado, `pedir_clave()` devuelve `True` **sin preguntar**.

---

## 3. `sfida_core.py` función por función

Convención: `con` es la conexión SQLite. Los errores esperables se lanzan como
`ErrorNegocio(mensaje_para_el_usuario)`; en Electron eso debe viajar por IPC
como un error tipado, no como un `Error` genérico ni un traceback.

### 3.1 Constantes

| Nombre | Valor |
|---|---|
| `APP_NOMBRE` | `"SFIDA - Control de Utiles"` |
| `VERSION` | `"3.1"` |
| `NOMBRE_BD` | `"sfida_inventario.db"` |
| `CAT_OFICINA` | `"ÚTILES DE OFICINA"` |
| `CAT_LIMPIEZA` | `"ÚTILES DE LIMPIEZA"` |
| `CATEGORIAS_FIJAS` | tupla de las dos |
| `CANON_CATEGORIA` | sin tilde → con tilde |
| `_CAT_VIEJAS` | mapa de migración (7 entradas) |
| `CLAVE_POR_DEFECTO` | `"sfida2026"` |
| `CFG_ANIMACIONES` | `"animaciones"` |
| `UNIDADES` | 22 tuplas `(codigo, nombre, familia, factor)` |
| `BASE_FAMILIA` | `{CONTEO: UND, VOLUMEN: L, PESO: KG, LARGO: M}` |
| `ALIAS_UNIDAD` | 48 alias de nombres viejos |
| `CATALOGO_SUGERIDO` | 34 artículos (18 oficina + 16 limpieza) |
| `_SQL_STOCK` | subconsulta del stock |
| `_SQL_ULT_PRECIO` | subconsulta del último precio |

### 3.2 Ubicación de la base y conexión

| Función | Firma | Regla |
|---|---|---|
| `carpeta_datos` | `() -> str` | Si `sys.frozen` → `%LOCALAPPDATA%\SFIDA\` (o `~` si no existe la variable). Si no → la carpeta del `.py`. **Crea la carpeta si no existe.** |
| `ruta_bd` | `(carpeta=None) -> str` | `carpeta_datos()/sfida_inventario.db`. |
| `carpetas_anteriores` | `() -> list[str]` | Solo si `sys.frozen`: la carpeta del ejecutable. |
| `migrar_bd_anterior` | `(destino=None) -> str\|None` | Si en el destino **ya hay** base, no hace nada (**nunca pisa**). Si no, copia la que haya junto al `.exe`, **y también sus `-journal`, `-wal`, `-shm`**. Devuelve el origen o `None`. |
| `conectar` | `(ruta=None) -> Connection` | Con `ruta=None` resuelve `ruta_bd()` **y corre `migrar_bd_anterior`**. Fija `row_factory`, `PRAGMA foreign_keys = ON` y llama a `crear_esquema`. |
| `crear_esquema` | `(con)` | Ejecuta `ESQUEMA`, después `_datos_iniciales`, `_migrar_categorias` y `_migrar_unidades`. |

> **Nunca calcular la ruta con `__file__`/`__dirname`.** Ya causó una pérdida
> total de datos: con PyInstaller `--onefile` el `.exe` corría desde
> `%TEMP%\_MEIxxxxx`, que Windows borra al cerrar. En Electron el equivalente
> peligroso es `app.getAppPath()` o `process.resourcesPath`.

### 3.3 Migraciones automáticas (corren solas al abrir)

| Función | Qué hace |
|---|---|
| `_datos_iniciales(con)` | Si `categorias` está vacía, inserta las dos fijas. |
| `_migrar_categorias(con)` | 1) Asegura que existan las dos fijas (y **corrige el nombre** al canónico con tilde si difiere solo en mayúsculas). 2) Mueve los artículos de cualquier otra categoría según `_CAT_VIEJAS`; **lo desconocido va a limpieza si el nombre contiene «LIMPIEZA», si no a oficina**; borra la categoría sobrante. 3) Los artículos con `categoria_id IS NULL` van a oficina. Si movió algo, deja auditoría `CATEGORIAS`. **Sale temprano si no hay ni categorías ni artículos.** |
| `_migrar_unidades(con)` | Pasa cada `articulos.unidad` por `normalizar_unidad` y guarda si cambió. Devuelve cuántas cambió. |

### 3.4 Utilidades de texto y formato

| Función | Firma | Comportamiento |
|---|---|---|
| `hoy` | `() -> str` | Fecha local ISO. |
| `ahora` | `() -> str` | `"AAAA-MM-DD HH:MM"`. |
| `sin_tildes` | `(txt) -> str` | Normaliza NFD, quita las marcas diacríticas y **pasa a MAYÚSCULAS**. Ojo: `Ñ` → `N`. Es para comparar, no para guardar. |
| `coincide` | `(busqueda, *campos) -> bool` | `True` si **todas** las palabras buscadas aparecen en la concatenación de los campos (sin tildes, sin distinguir mayúsculas). Búsqueda vacía → `True`. |
| `_norm` | `(txt) -> str` | `strip()` con tolerancia a `None`. |
| `normalizar_nombre` | `(texto) -> str` | `upper()` + colapsa espacios (`" ".join(split())`). **Conserva tildes y Ñ.** |
| `fmt_num` | `(v) -> str` | Entero si la parte decimal es < 0.0001, si no 2 decimales. |
| `fmt_money` | `(v) -> str` | `"S/ 1,234.56"` (separador de miles con coma). |
| `fmt_precio` | `(v) -> str` | **`"—"` si es `None` o ≤ 0**; si no, `fmt_money`. |
| `fmt_variacion` | `(v) -> str` | `"—"` si `None`; `"="` si `abs(v) < 0.005`; si no `"+10.3%"` / `"-25.0%"`. |
| `_valida_fecha` | `(f)` | Exige `%Y-%m-%d`; si no, `ErrorNegocio("La fecha debe tener el formato AAAA-MM-DD (ej. …)")`. |
| `normalizar_datos_existentes` | `(con) -> int` | Reescribe en mayúsculas 5 tablas / 13 campos: `categorias.nombre`; `articulos.nombre`; `sucursales.nombre, responsable, direccion`; `ingresos.proveedor, nro_documento, tipo_doc, observacion`; `salidas.entregado_por, recibido_por, nro_vale, observacion`. **Si una fila chocaría con un `UNIQUE`, la deja como está y sigue** (captura `IntegrityError`). Devuelve cuántas filas cambiaron y audita `ORDENAR TEXTOS`. **No toca `articulos.codigo`.** |

### 3.5 Stock

`_SQL_STOCK` es la única fuente del stock:

```sql
SELECT articulo_id, SUM(cant) AS stock FROM (
    SELECT articulo_id,  cantidad FROM ingreso_det
    UNION ALL
    SELECT articulo_id, -cantidad FROM salida_det
    UNION ALL
    SELECT articulo_id,  cantidad FROM ajustes
) GROUP BY articulo_id
```

| Función | Firma | Comportamiento |
|---|---|---|
| `stock_de` | `(con, articulo_id) -> float` | 0.0 si no hay movimientos. |
| `listar_stock` | `(con, texto="", categoria_id=None, solo_bajo_minimo=False)` | Solo activos. Devuelve `id, codigo, nombre, unidad, stock_minimo, categoria, stock, ultimo_precio, ultima_fecha`. **El filtro de texto se aplica en Python con `coincide()`** (sobre código, nombre, categoría y unidad), no en SQL: por eso tolera tildes y palabras sueltas. `solo_bajo_minimo` usa `stock <= stock_minimo` (**incluye el igual**). Ordena por nombre. |
| `alertas_stock_minimo` | `(con)` | Activos con `stock_minimo > 0` y `stock <= stock_minimo`. Ordena por `(stock − minimo)` ascendente, luego por nombre → **primero el más urgente**. |
| `niveles_stock` | `(con) -> dict` | Para la dona: `bajo` si `stock <= 0` **o** (`min > 0` y `stock <= min`); `por_agotarse` si `min > 0` y `stock <= min × 1.3`; si no `ok`. |
| `resumen_panel` | `(con) -> dict` | `articulos`, `sucursales` (ambos solo activos), `ingresos`, `salidas`, `alertas`, `valorizado`. **El valorizado usa el ÚLTIMO precio, no un promedio.** |

### 3.6 Precios

`_SQL_ULT_PRECIO`: por artículo, la línea de ingreso más nueva **con
`costo_unitario > 0`**, desempatando por `i.fecha DESC, i.id DESC, d.id DESC`.

| Función | Firma | Comportamiento |
|---|---|---|
| `ultimo_precio` | `(con, articulo_id) -> dict\|None` | `{precio, fecha, proveedor, documento}`. `None` si nunca tuvo precio. `documento` = `"tipo_doc nro_documento"`. |
| `historial_precios` | `(con, articulo_id, desde=None, hasta=None) -> list[dict]` | Recorre **de la más vieja a la más nueva** para calcular la variación %, y **al final invierte** (la más nueva primero). Las líneas sin precio quedan con `precio=None` y **no rompen la cadena de comparación** (el «anterior» sigue siendo el último precio real). El filtro por fechas se aplica **después** de calcular las variaciones. |
| `resumen_precios` | `(con, articulo_id, desde, hasta) -> dict` | `{minimo, maximo, promedio, compras}`, todos `None` y `compras=0` si no hay precios. Ignora las líneas sin precio. |
| `actualizar_costo_linea` | `(con, ingreso_det_id, nuevo_costo) -> bool` | Acepta coma decimal. Rechaza no-numérico y negativo. **Devuelve `False` sin tocar nada si la diferencia es < 0.0001.** Si cambió, audita `PRECIO CORREGIDO` con el valor anterior y el nuevo. Error si la línea no existe. |

### 3.7 Configuración, clave y auditoría

| Función | Firma | Comportamiento |
|---|---|---|
| `get_config` | `(con, clave, por_defecto=None)` | — |
| `set_config` | `(con, clave, valor)` | `UPSERT`. **Guarda siempre `str(valor)`.** |
| `animaciones_activas` | `(con) -> bool` | `True` salvo que valga exactamente `"0"`. **De fábrica: encendidas.** |
| `set_animaciones` | `(con, encendidas)` | Guarda `"1"` / `"0"`. |
| `_hash_clave` | `(clave, sal) -> str` | **PBKDF2-HMAC-SHA256, 120 000 iteraciones**, salida hex. |
| `verificar_clave` | `(con, clave) -> bool` | Si no hay hash ni sal guardados, compara contra `"sfida2026"`. |
| `clave_es_la_de_fabrica` | `(con) -> bool` | — |
| `cambiar_clave` | `(con, actual, nueva)` | Verifica la actual; exige **mínimo 4 caracteres**; genera sal nueva de 16 bytes; audita `CAMBIO DE CLAVE`. |
| `auditar` | `(con, accion, detalle="")` | **Trunca el detalle a 400 caracteres** y **se traga cualquier excepción**: auditar nunca debe romper la operación. |
| `listar_auditoria` | `(con, limite=300, texto="")` | Filtro `LIKE` en mayúsculas sobre acción y detalle. `ORDER BY id DESC`. |
| `limpiar_auditoria` | `(con, dejar_ultimos=200)` | Borra todo menos los N más nuevos. |

### 3.8 Unidades de medida

**Catálogo cerrado de 22 unidades.** `(codigo, nombre, familia, factor)`:

| Familia | Base | Unidades (código = factor) |
|---|---|---|
| `CONTEO` | `UND` | UND 1 · PAR 2 · **DOC 12** · CTO 100 · MLL 1000 · CJA 1 · PQT 1 · BOL 1 · JGO 1 · ROL 1 · BLQ 1 |
| `VOLUMEN` | `L` | ML 0.001 · L 1 · **GAL 3.785** · BD5 5 · **BD20 20** |
| `PESO` | `KG` | GR 0.001 · KG 1 · **SAC 50** |
| `LARGO` | `M` | MM 0.001 · CM 0.01 · M 1 |

Nombres para mostrar: Unidad, Par, Docena, Ciento, Millar, Caja, Paquete,
Bolsa, Juego, Rollo, Blíster, Mililitro, Litro, Galón, Bidón de 5 litros,
Bidón de 20 litros, Gramo, Kilogramo, Saco de 50 kilos, Milímetro, Centímetro,
Metro.

`ALIAS_UNIDAD` (48 entradas) traduce nombres viejos y variantes: `UNIDAD/UNIDADES/U/UN/PZA/PIEZA→UND`,
`CAJA/CAJAS→CJA`, `PAQUETE/PAQ/PAQUETES→PQT`, `DOCENA/DOCENAS→DOC`,
`CIENTO→CTO`, `MILLAR→MLL`, `BOLSA/BOLSAS→BOL`, `JUEGO/SET→JGO`,
`ROLLO/ROLLOS→ROL`, `PARES→PAR`, `BLISTER→BLQ`, `LITRO/LITROS/LT/LTS→L`,
`MILILITRO/MILILITROS/CC→ML`, **`GALON/GALONES/GALONERA/GLN→GAL`**,
`BIDON→BD20`, `BIDON DE 5→BD5`, `BIDON DE 20→BD20`,
`KILO/KILOS/KILOGRAMO/KGS→KG`, `GRAMO/GRAMOS/G→GR`, `SACO→SAC`,
`METRO/METROS/MT/MTS→M`, `CENTIMETRO→CM`, `MILIMETRO→MM`.

| Función | Firma | Comportamiento |
|---|---|---|
| `normalizar_unidad` | `(texto) -> str` | Orden: código exacto → alias → **nombre completo sin tildes** → **`"UND"` como último recurso**. Nunca falla. |
| `info_unidad` | `(codigo) -> dict` | `{codigo, nombre, familia, factor}`; cae en UND si no reconoce. |
| `equivalencia_unidad` | `(codigo) -> str` | `"1 GAL = 3.785 L"`. **Cadena vacía si la unidad es la base o su factor es 1** (por eso CJA, PQT, BOL, JGO, ROL, BLQ no muestran equivalencia). Formatea el factor como entero si es casi entero, si no con 3 decimales **quitando los ceros de la derecha**. |
| `etiqueta_unidad` | `(codigo) -> str` | `"GAL · Galón  (1 GAL = 3.785 L)"`. |
| `convertir_a_base` | `(cantidad, codigo) -> (float, str)` | `2 GAL → (7.57, 'L')`. |
| `fmt_cantidad` | `(cantidad, codigo, con_equivalencia=True) -> str` | `"3 GAL (11.36 L)"`; solo `"3 L"` si ya es la base o el factor es 1. |

### 3.9 Categorías

| Función | Firma | Comportamiento |
|---|---|---|
| `listar_categorias` | `(con)` | Ordenadas por nombre. |
| `buscar_categoria` | `(con, nombre)` | `COLLATE NOCASE`. |
| `id_categoria` | `(con, nombre, crear=True)` | Devuelve el id; la crea si falta. |
| `guardar_categoria` | `(con, nombre, cat_id=None)` | Normaliza a mayúsculas y **exige que sea una de las dos** (vía `CANON_CATEGORIA` sobre el nombre sin tildes): si no, `ErrorNegocio("Solo existen dos categorias: …")`. Devuelve la forma canónica **con tilde**. Rechaza duplicados. |
| `eliminar_categoria` | `(con, cat_id)` | **Bloquea si hay artículos** en esa categoría, diciendo cuántos. |
| `categoria_corta` | `(nombre) -> str` | `"LIMPIEZA"` / `"OFICINA"` / el nombre tal cual; `"-"` si viene vacío. |

### 3.10 Artículos

| Función | Firma | Comportamiento |
|---|---|---|
| `listar_articulos` | `(con, texto="", solo_activos=True, categoria_id=None)` | Trae `stock` y `categoria`. **El filtro de texto acá sí es `LIKE` en SQL** (sobre nombre y código) — a diferencia de `listar_stock`, **no tolera tildes**. Ordena por nombre. |
| `obtener_articulo` | `(con, art_id)` | — |
| `codigo_sugerido` | `(con, prefijo="ART") -> str` | Toma el último código con ese prefijo **por `id DESC`** (no por número), le suma 1 al sufijo y devuelve `"OFI-0001"` (4 dígitos). Si el sufijo no es numérico, cae en `COUNT(*) + 1`. |
| `guardar_articulo` | `(con, codigo, nombre, categoria_id, unidad, stock_minimo, activo=1, art_id=None) -> int` | **Código: `strip().upper()` (no pasa por `normalizar_nombre`, así que conserva los espacios internos).** Nombre: `normalizar_nombre`. Unidad: `normalizar_unidad`. Exige código y nombre; el mínimo debe ser numérico y **no negativo**. Duplicado → `"Ya existe otro articulo con el codigo X."` |
| `eliminar_articulo` | `(con, art_id) -> str` | Cuenta movimientos en `ingreso_det + salida_det + ajustes`. **Si tiene → `activo=0` y devuelve `"desactivado"`; si no → `DELETE` y devuelve `"eliminado"`.** |
| `reactivar_articulo` | `(con, art_id)` | `activo=1` + auditoría. |
| `cargar_catalogo_sugerido` | `(con) -> int` | Inserta los 34 del `CATALOGO_SUGERIDO` **salteando los que ya existen por código o por nombre** (`COLLATE NOCASE`). Devuelve cuántos agregó. |

### 3.11 Sucursales

| Función | Firma | Comportamiento |
|---|---|---|
| `listar_sucursales` | `(con, solo_activas=True)` | Ordenadas por nombre. |
| `guardar_sucursal` | `(con, codigo, nombre, direccion="", responsable="", activo=1, suc_id=None) -> int` | Código `strip().upper()`; nombre, responsable **y dirección** por `normalizar_nombre`. Exige código y nombre. Duplicado → error. |
| `eliminar_sucursal` | `(con, suc_id) -> str` | **Si tiene salidas → `"desactivada"`; si no → `"eliminada"`.** |

### 3.12 Ingresos

| Función | Firma | Comportamiento |
|---|---|---|
| `registrar_ingreso` | `(con, tipo_doc, nro_documento, fecha, proveedor, observacion, items) -> int` | `items = [(articulo_id, cantidad, costo_unitario)]`. Orden de validación: normaliza (`tipo_doc` `strip().upper()` con **`"BOLETA"` por defecto si viene vacío**; `nro_documento` `strip().upper()`; proveedor por `normalizar_nombre`; **observación solo `strip()`, NO se pasa a mayúsculas**) → exige número → valida fecha → exige al menos un ítem → cada cantidad > 0 y cada costo ≥ 0 → **rechaza el duplicado `tipo_doc + nro_documento`** con el mensaje «La BOLETA N° X ya fue registrada antes. Revise el historial de ingresos.» → inserta cabecera y líneas → audita `INGRESO`. Con error, `rollback`. |
| `listar_ingresos` | `(con, desde=None, hasta=None, texto="")` | Agrega `items` (nº de líneas), `unidades` (suma de cantidades) y `total` (suma de `cantidad × costo`). Filtro `LIKE` sobre documento y proveedor. `ORDER BY fecha DESC, id DESC`. |
| `cabecera_ingreso` | `(con, ingreso_id)` | — |
| `detalle_ingreso` | `(con, ingreso_id)` | Con `codigo`, `nombre`, `unidad`. Ordenado por nombre. |
| `eliminar_ingreso` | `(con, ingreso_id)` | **Antes de borrar, comprueba línea por línea que el stock no quede negativo** (tolerancia 0.0001); si no, error nombrando el artículo. Borra la cabecera (el `CASCADE` se lleva el detalle) y audita `ANULA INGRESO`. |

### 3.13 Salidas

| Función | Firma | Comportamiento |
|---|---|---|
| `siguiente_nro_vale` | `(con) -> str` | `"V{año}-{correlativo:04d}"` donde el correlativo es **`COUNT(*) + 1` de los vales `V{año}-%`**. ⚠️ Contar, no tomar el máximo: si se anula un vale, el número se repite (ver 9). |
| `existe_vale` | `(con, nro_vale) -> bool` | Compara con `strip().upper()`. |
| `registrar_salida` | `(con, nro_vale, fecha, sucursal_id, entregado_por, recibido_por, observacion, items) -> int` | `items = [(articulo_id, cantidad)]`. Orden: normaliza el vale → exige vale → valida fecha → exige sucursal → exige ítems → **agrupa las líneas repetidas del mismo artículo en un dict `pedido`** → valida el stock **de la cantidad agrupada** (tolerancia 0.0001) con el mensaje «Stock insuficiente de X. Disponible: … \| Solicitado: …» → **recién ahí** comprueba que el vale no exista → inserta **una línea por artículo agrupado** → audita `SALIDA`. Nombres por `normalizar_nombre`; **observación solo `strip()`**. |
| `listar_salidas` | `(con, desde, hasta, sucursal_id, texto)` | Agrega `sucursal`, `suc_codigo`, `items`, `unidades`. Filtro `LIKE` sobre vale y quién recibió. `ORDER BY fecha DESC, id DESC`. |
| `detalle_salida` | `(con, salida_id)` | Con `codigo`, `nombre`, `unidad`. Ordenado por nombre. |
| `cabecera_salida` | `(con, salida_id)` | Incluye `sucursal`, `suc_codigo`, `direccion`, `responsable` de la sucursal. **Es lo que consume la impresión.** |
| `eliminar_salida` | `(con, salida_id)` | Borra sin validar nada (devolver stock nunca lo deja negativo) y audita `ANULA SALIDA`. |

### 3.14 Ajustes

| Función | Firma | Comportamiento |
|---|---|---|
| `registrar_ajuste` | `(con, articulo_id, cantidad, motivo, fecha=None)` | Cantidad con signo (positivo suma, negativo resta). **Rechaza cero.** Fecha por defecto hoy, validada. **Rechaza si dejaría el stock negativo** (tolerancia 0.0001). Motivo solo `strip()`. Audita `AJUSTE` con el signo explícito. |

### 3.15 Reportes

| Función | Firma | Comportamiento |
|---|---|---|
| `kardex` | `(con, articulo_id, desde=None, hasta=None) -> list[dict]` | Une ingresos, salidas y ajustes. `ORDER BY fecha, tipo` (**alfabético: AJUSTE < INGRESO < SALIDA dentro del mismo día**). **El saldo se acumula sobre TODOS los movimientos y recién después se filtra por fecha**, así que el saldo de la primera fila del período ya arrastra el histórico. Los ajustes negativos se muestran como salida positiva. Campos: `fecha, tipo, documento, referencia, entrada, salida, saldo`. |
| `consumo_por_sucursal` | `(con, desde, hasta)` | `LEFT JOIN` desde `sucursales` → **las sucursales sin movimientos aparecen con 0**. Solo activas. `vales` es `COUNT(DISTINCT s.id)`. Ordena por unidades desc, luego nombre. |
| `detalle_consumo_sucursal` | `(con, sucursal_id, desde, hasta)` | Agrupado por artículo, ordenado por cantidad desc. |
| `articulos_mas_movidos` | `(con, desde, hasta, limite=15)` | Solo salidas. Agrupado por artículo, ordenado por cantidad desc. |
| `estadisticas_mensuales` | `(con, meses=6) -> list[dict]` | Del mes más viejo al actual. `{mes: "08/26", entradas, salidas}`. Calcula el rango de cada mes a mano (maneja el cruce de año). |
| `minimos_sugeridos` | `(con, meses=3, factor=1.0)` | `desde = hoy − 30×meses`. Promedio mensual = `total / max(1, meses)`. Sugerido = `round(promedio × factor, 0)`. Devuelve `{id, nombre, actual, sugerido}` de los activos. |
| `actualizar_minimos` | `(con, pares) -> int` | `pares = [(articulo_id, minimo)]`. Audita `STOCK MINIMO`. |

### 3.16 Import / export / respaldo

| Función | Firma | Comportamiento |
|---|---|---|
| `exportar_csv` | `(ruta, encabezados, filas) -> str` | **Delimitador `;`, codificación `utf-8-sig`** (para que Excel en español lo abra bien). |
| `plantilla_articulos_csv` | `(ruta) -> str` | Exporta 3 filas de ejemplo con encabezados Código/Nombre/Categoría/Unidad/Stock mínimo. |
| `importar_articulos_csv` | `(con, ruta) -> (nuevos, actualizados, errores)` | Lee `utf-8-sig`, **detecta el delimitador con `csv.Sniffer` entre `;,\t\|`** y cae en `;`. Descarta filas totalmente vacías. **Descarta la primera fila si contiene NOMBRE / ARTICULO / DESCRIPCION.** Por fila: sin nombre → error y sigue; **la categoría es limpieza solo si el texto contiene «LIMPIEZA», si no oficina**; el mínimo acepta coma decimal y cae en 0 si no es número; **busca por código O por nombre (`COLLATE NOCASE`)** → si existe actualiza (y **lo reactiva**), si no inserta generando código `ART-000N` cuando viene vacío. Audita `IMPORTACION`. |
| `respaldar_bd` | `(destino, origen=None) -> str` | `shutil.copy2`. |
| `restaurar_bd` | `(origen, destino=None) -> str` | **Valida que el archivo sea una base de SFIDA** abriéndolo y consultando `articulos`; si no, «Ese archivo no es un respaldo valido de SFIDA.» **Antes de pisar, guarda el actual como `<destino>.antes_de_restaurar`.** |
| `borrar_movimientos` | `(con)` | Vacía `ingreso_det, ingresos, salida_det, salidas, ajustes`. **Conserva artículos, sucursales, config y auditoría.** Audita `BORRADO TOTAL`. |

### 3.17 Acciones que quedan en auditoría

`CATEGORIAS`, `ORDENAR TEXTOS`, `ARTICULO`, `SUCURSAL`, `INGRESO`,
`ANULA INGRESO`, `SALIDA`, `ANULA SALIDA`, `AJUSTE`, `PRECIO CORREGIDO`,
`STOCK MINIMO`, `IMPORTACION`, `RESPALDO`, `BORRADO TOTAL`,
`CAMBIO DE CLAVE`, `CONTROL MAESTRO`, `ACCESO DENEGADO`, `ANIMACIONES`,
`IMPRESION`.

---

## 4. Impresión de los vales (`sfida_impresion.py`)

### 4.1 Formatos

`PAPELES` — tres opciones, en este orden:

| Texto que ve el usuario | mm | Columnas de texto | Margen |
|---|---|---|---|
| `Ticket 80 mm  (impresora térmica)` | 80 | **42** | 3 mm |
| `Ticket 58 mm  (impresora térmica chica)` | 58 | **30** | 3 mm |
| `Hoja A4  (impresora normal)` | 210 | 80 | 12 mm |

Fuente monoespaciada, en orden de preferencia: **Consolas, Courier New,
DejaVu Sans Mono, Liberation Mono, monospace**. `font-weight: 600`,
`line-height: 116%`, color `#000000`.

### 4.2 Estructura del ticket (80 / 58 mm)

En orden, todo dentro de un `<pre>`:

1. **Membrete centrado**: nombre de la empresa (`config.empresa`, por defecto
   `SFIDA`), dirección (`empresa_dir`) si la hay, y `RUC XXXXX` si lo hay.
   Todo en mayúsculas.
2. Línea `-` × columnas.
3. Título `VALE DE SALIDA DE ALMACEN` + línea.
4. **Cabecera** — campos con rótulo de ancho `SANGRIA_CAMPO = 10`:
   - `N° VALE :`
   - `FECHA   :` (en `dd/mm/aaaa`)
   - `DESTINO :` → `CÓDIGO - NOMBRE`
   - `DIRECC. :` (solo si la sucursal tiene dirección)
   - `ENTREGA :` (o `-`)
   - `RECIBE  :` (o `-`)
   - `OBSERV. :` (solo si hay observación)
5. Línea + encabezado `CANT   UND   ARTICULO` + línea.
6. **Detalle**, por artículo:
   - `%5s %-5s %s` → cantidad (`ANCHO_CANT = 5`), código de unidad
     (`ANCHO_UND = 5`), nombre. **El nombre arranca en la columna
     `SANGRIA_ITEM = 5 + 1 + 5 + 1 = 12`.**
   - Si el nombre no entra, sigue en las líneas de abajo **sangrado 12**.
   - Debajo, **sangrado 12**: el código del artículo, y si la unidad tiene
     equivalencia, `  =  7.57 L`.
7. Línea + `TOTAL DE ARTICULOS: %8d` + `TOTAL DE UNIDADES: %8s` + línea `=`.
8. **Firmas** (`_bloque_firmas`): 3 líneas en blanco y después
   - **si hay 38 columnas o más → las dos firmas lado a lado**, cada una
     centrada en su media columna;
   - **si hay menos de 38 (o sea, en 58 mm) → una debajo de la otra**, con dos
     líneas en blanco entre medio.
   - Rótulos: `ENTREGUE CONFORME` y `RECIBI CONFORME` (sin tildes, a propósito).
9. Línea en blanco + `Impreso el dd/mm/aaaa HH:MM` centrado + `SFIDA - Control
   de Utiles` centrado + **3 líneas en blanco** (para que la cuchilla no corte
   el texto).

**`_limitar()` es la red de seguridad final**: recorre todas las líneas y
parte en varias cualquiera que se pase del ancho.

### 4.3 Estructura del A4

Documento HTML con tablas de verdad (no monoespaciado):
- Encabezado a dos columnas: a la izquierda el nombre de la empresa en 20 pt +
  dirección y `· RUC X` en 8 pt gris; a la derecha `VALE DE SALIDA`, `N° X` en
  14 pt y la fecha.
- Regla horizontal negra de 2 px.
- Bloque de datos 2×2: Sucursal destino / Dirección · Entregado por / Recibido
  por.
- Tabla de artículos con **encabezado azul oscuro `#1c2536` con texto blanco**:
  `Código (16%) · Artículo · Cantidad (12%, derecha) · Unidad (22%)`. La
  equivalencia va en gris al lado de la unidad.
- Totales: «Total de artículos: N   Total de unidades: N».
- Dos firmas **lado a lado**: `Entregué conforme` / `Recibí conforme`
  (acá **sí** con tilde).
- Pie en 7.5 pt gris: «SFIDA · Control de Útiles de Oficina y Limpieza ·
  Impreso el …».

### 4.4 Los tres bugs de la versión Qt (lo que el HTML resuelve gratis)

Documentados en el CLAUDE.md viejo y en los comentarios del código:

1. **Unidades.** Un `QTextDocument` sin dispositivo de pintado mide todo en
   **píxeles de 96 ppp** (`DPI_DOC = 96.0`). Pasarle el ancho en milímetros o
   en puntos desbordaba el texto del papel. → En HTML se escribe `80mm` y el
   navegador convierte.
2. **Proporción.** Qt estira el documento hasta llenar la hoja, **por separado
   a lo ancho y a lo alto**: si las proporciones no coincidían, las letras
   salían achatadas. Por eso `_ajustar()` arma una hoja a la medida exacta del
   vale (y en rollo continuo, además, no bota papel de más). → En HTML
   `@page { size: 80mm auto }` hace exactamente eso.
3. **Cuantización del tamaño de letra.** `_tam_letra()` no puede ser un número
   fijo (42 caracteres a 10 pt no entran en 74 mm): parte de una estimación
   (`util_pt / (columnas × 0.60)`, acotada a 5.5–12 pt), **mide el texto de
   verdad** con `doc.idealWidth()`, itera hasta 8 veces buscando llenar el 99 %
   (`LLENADO`), y después baja de a 0.1 pt hasta 40 veces como garantía final.
   - **La garantía final compara contra el ancho real, no contra `LLENADO`**,
     porque Qt redondea la letra a píxeles enteros y exigir el objetivo exacto
     hacía saltar un escalón entero.
   - **El piso baja hasta 3 pt a propósito**: si la PC no tiene ninguna fuente
     monoespaciada, Qt cae en una proporcional mucho más ancha y con piso de
     5 pt el vale salía cortado. Entre letra chica y letra cortada, gana la que
     se lee entera.
   → En HTML esto desaparece: con `ch` o un `font-size` fijo en pt y una fuente
   monoespaciada garantizada, 42 caracteres entran por construcción. **Pero
   hay que verificar que la fuente elegida exista en la PC del almacén** o
   embeberla.
4. **(Cuarto, el de las columnas.)** El ancho del nombre y la sangría de las
   líneas de abajo salen **los dos de `SANGRIA_ITEM`**; los rótulos de la
   cabecera, de `SANGRIA_CAMPO`. Escribir esos números a mano (un `%11s`
   suelto) desalineaba el ticket. **Lo vigilan dos pruebas de `test_app.py`.**

### 4.5 La ventana `DlgImprimir`

Mínimo 600×680. De arriba a abajo:
- Título «Imprimir vale X».
- **Impresora**: combo (mín. 280 px) con las instaladas, **la predeterminada
  primero y marcada «(predeterminada)»**; si no hay ninguna, «No se encontró
  ninguna impresora instalada» y el combo deshabilitado. Botón «Actualizar
  lista».
- **Tamaño del papel** (los 3 de `PAPELES`) + **Copias** (1–9, **por defecto
  2**, tooltip «una se queda en el almacén y la otra viaja con la mercadería»).
- **Vista previa** («Así va a salir impreso»), fondo blanco, borde, radio 10.
- Nota: «Si la impresora térmica corta el texto por los costados, pruebe con
  el ancho de 58 mm. Para archivar el vale en papel normal elija «Hoja A4».»
- Botones: Cerrar · **Guardar PDF** · **Vista previa** (la del sistema) ·
  **Imprimir ahora** (verde, con icono, 42 px).

**Recuerda la última impresora y el último papel** en `config.impresora_vales`
y `config.papel_vales`, y los restaura al abrir. Al imprimir audita
`IMPRESION / Vale X en IMPRESORA (N copias)`.

**Plan B**: si la ventana de impresión falla entera, `abrir_en_navegador()`
escribe el HTML en `vales/vale_<id>.html` y lo abre en el navegador. En
Electron esto deja de tener sentido: el renderer **es** el navegador.

---

## 5. Diseño visual

### 5.1 Paleta (`sfida_estilo.py:25-49`)

| Constante | Hex | Uso |
|---|---|---|
| `LATERAL` | `#1c2536` | Barra lateral |
| `LATERAL_TXT` | `#9fb0c9` | Texto de la barra lateral |
| `LATERAL_HOV` | `#26324a` | Ítem del menú al pasar el mouse |
| `CORAL` / `ROJO` | `#e5484d` | Ítem activo, rojo del sistema |
| `CORAL_CLR` / `ROJO_CLR` | `#fdecec` | Fondo de avisos de error |
| `AZUL` | `#2f6fed` | Acción principal |
| `AZUL_OSC` | `#2559c9` | Azul presionado |
| `AZUL_CLR` | `#5a8df3` | Azul hover |
| `CELESTE` | `#e8f0fe` | Selección en tablas y listas |
| `VERDE` | `#22a06b` | Confirmar, entradas |
| `VERDE_CLR` | `#e5f6ee` | Fondo de avisos ok |
| `AMBAR` | `#f5a623` | Advertencia |
| `AMBAR_OSC` | `#a76c05` | **El ámbar puro no se lee sobre blanco** |
| `AMBAR_CLR` | `#fdf3e1` | Fondo de avisos info |
| `GRIS_FONDO` | `#f6f8fb` | Fondo de las páginas |
| `GRIS_CAB` | `#f1f4f9` | Encabezado de las tablas |
| `BLANCO` | `#ffffff` | Tarjetas |
| `BORDE` | `#e6eaf0` | Bordes |
| `SEPARADOR` | `#eef1f6` | Separadores, chips, fondos suaves |
| `TEXTO` / `TITULO` | `#1f2733` | Texto principal |
| `SUAVE` | `#7b8794` | Texto secundario |

Colores sueltos que aparecen en el QSS y conviene conservar: `#d9dfe8` (borde
de campo), `#c3ccda` (borde hover), `#f2f5f9` (campo deshabilitado),
`#cbd3df` (barra de scroll), `#3a4553` / `#4a5563` (texto de botones grises),
`#eaf1ff` (celda editable del detalle de ingreso), `#f7fbff` (celda editable
de mínimos), `#2b3648` (fondo del tooltip), `#14724a` / `#b3282c` (texto de
los avisos ok / error).

### 5.2 Tipografía y medidas

- Fuente: `'Segoe UI Variable Display', 'Segoe UI', 'SF Pro Display', 'Inter',
  'DejaVu Sans', Arial`. Base 14 px.
- Tamaños: título de página 23 px/600; subtítulo 13 px; valor de tarjeta
  30 px/700; título de tarjeta 12 px/500; título de caja 14 px/600; botón
  13 px/600; encabezado de tabla 12 px/600; nota al pie 12 px.
- **Radios**: tarjetas y tablas 12 px; botones, campos y pastilla del menú
  8 px; chips 7 px; tooltip 6 px.
- `ALTO_FILA = 44` px.
- `MARGEN_PAGINA = (20, 16, 20, 16)`, `ESPACIO_PAGINA = 12`,
  `ALTO_TABLA_MIN = 130`.
- Barra lateral 238 px; barra superior 78 px; ítem del menú con
  `padding: 11px 12px 11px 14px` y `margin: 2px 12px` (la pastilla se dibuja
  con ese mismo `adjusted(12, 2, -12, -2)`).
- Barras de scroll de 10 px, manija `#cbd3df` con radio 5.

### 5.3 Animaciones (referencia para Framer Motion)

`DURACION = 220 ms`, `CURVA = OutCubic`.

| Qué | Cómo | Duración |
|---|---|---|
| Cambio de página | Deslizamiento horizontal; **la dirección sale del orden del `MENU`** (bajando entra por la derecha, subiendo por la izquierda) | 220 ms, OutCubic |
| Pastilla del menú | Animación de geometría sobre `#navActivo` | 220 ms |
| Toast | Fundido al entrar y al salir | **180 ms** |
| Diálogos | Fundido de `windowOpacity` | **160 ms** |
| Filas de tabla | Tinte animado del delegado | **140 ms** |
| Botones | Sombra que crece al pasar el mouse (el color del hover es instantáneo: el QSS no anima) | — |

**El interruptor** vive en Control Maestro → Respaldos y datos → «Animaciones
suaves», guardado en `config.animaciones`, encendido de fábrica. Al apagarlo se
aplica al instante y **corta cualquier transición en curso**.

### 5.4 Estados de la tabla de stock (`color_estado`)

En este orden exacto:

| Condición | Texto | Color |
|---|---|---|
| `stock <= 0` | Sin stock | ROJO |
| `minimo > 0 y stock <= minimo` | Bajo mínimo | ROJO |
| `minimo > 0 y stock <= minimo × 1.3` | Por agotarse | AMBAR_OSC |
| resto | Ok | VERDE |

> Ojo: `niveles_stock()` (la dona del panel) usa los mismos umbrales pero
> **agrupa «Sin stock» y «Bajo mínimo» en un solo segmento**. Son dos
> clasificaciones distintas con la misma matemática.

### 5.5 El problema de layout que hay que no repetir

En Qt, cuando el contenedor tiene menos espacio del que piden los hijos,
**Qt no los achica: los deja del tamaño que pidieron y se encima uno sobre
otro**. En una laptop de 1366×768 la fila de botones de «Ingresos» se dibujaba
encima del encabezado de la tabla y en Catálogos la tabla de unidades tapaba
el botón «Pasar todo a MAYÚSCULAS». La solución fue meter **cada página dentro
de un `QScrollArea`** y medir `MINIMO_VENTANA` de verdad (hoy `1300×560`; antes
prometía 1120×700 mientras el contenido pedía 1852×882, y esa mentira era el bug).

**En web esto no pasa igual** (el flujo del documento no superpone), pero
**el requisito de fondo sigue**: la app tiene que verse entera y usable en
**1366×768**, sin scroll horizontal, con las filas de botones repartidas en
dos líneas donde haga falta.

---

## 6. Las suites de prueba

Ambas son scripts secuenciales, no `unittest`/`pytest`: definen una función de
aserto (`check` en core, `chk` en app), la llaman a lo largo del archivo,
imprimen un resumen y salen con código 1 si hubo fallas.

| Suite | Sitios de llamada en el código | Ejecutadas (según CLAUDE.md) |
|---|---|---|
| `test_core.py` | 138 | **125** |
| `test_app.py` | 157 | **168** |

> La diferencia no es un error: en `test_core.py` muchas validaciones se
> escriben como `try/except` con **dos** llamadas a `check()` de las que solo
> corre una; en `test_app.py` varias llamadas están **dentro de bucles** y
> corren varias veces. El número que importa es el que imprime la corrida.
> (El prompt de la migración mencionaba ~100 y ~127: son cifras de una versión
> anterior.)

### 6.1 `test_core.py` — bloques

**Parte inicial (sin nombre de bloque)**, secciones marcadas con `# ---`:

| Sección | Qué cubre |
|---|---|
| maestros | Las dos categorías fijas, que vengan en mayúsculas, que no deje crear una tercera; alta de artículos, código duplicado, código obligatorio; alta de sucursales. |
| ingreso por boleta | Registro, stock resultante, boleta duplicada, formato de fecha, al menos un ítem. |
| salida a sucursal | Registro, stock resultante, correlativo del vale, stock tras dos salidas, bloqueo por stock insuficiente, **suma de líneas repetidas del mismo artículo antes de validar**, agrupación en una sola línea, sucursal obligatoria. |
| alertas de stock mínimo | Que devuelva lista; que un artículo aparezca al bajar del mínimo. |
| kardex | Que tenga movimientos; **que el saldo final coincida con el stock actual**. |
| reportes | Consumo por sucursal (las 2), orden por unidades, detalle, top de más movidos, resumen del panel, que los niveles de la dona sumen los activos. |
| ajustes | Que el negativo descuente; que bloquee el que dejaría negativo. |
| anulaciones | Que bloquee anular una boleta ya repartida; que anular una salida devuelva el stock. |
| borrado protegido | Artículo con movimientos → se desactiva; sin movimientos → se elimina; sucursal con salidas → se desactiva. |
| exportación | Que el CSV tenga contenido; que se cree el respaldo. |

**Bloques con nombre**:

| Bloque | Qué cubre |
|---|---|
| **1 · LOS PRECIOS NO SON FIJOS** | Línea sin precio (costo 0); que se muestre con guion y nunca `S/ 0.00`; bloqueo de precios negativos; `ultimo_precio` con sus 4 campos y `None` cuando nunca hubo; **que tome la compra más nueva y no el promedio**; `historial_precios` (orden, campos, la más vieja sin variación, +10.3 %, −25 %, filtro por período); `fmt_variacion`; `resumen_precios` (min/max/prom y sin precios); **valorización con el último precio**; `listar_stock` con precio y fecha; corrección de una línea ya registrada; volver a dejarla sin precio. |
| **2 · TODO EN MAYÚSCULAS** | `normalizar_nombre` (mayúsculas + espacios de más); que `guardar_articulo`, `guardar_sucursal` (nombre, responsable **y dirección**), `registrar_ingreso` (proveedor y nº de documento) y `registrar_salida` (quién entrega, quién recibe, nº de vale) dejen todo en mayúsculas; `normalizar_datos_existentes` sobre lo ya cargado; que el catálogo sugerido ya venga en mayúsculas. |
| **3 · CATEGORÍAS FIJAS** | Que las dos sean oficina y limpieza; **que al abrir una base vieja con 4 categorías queden solo 2** y los artículos se muden bien. |
| **4 · UNIDADES DE MEDIDA** | Catálogo no vacío (≥ 15); toda familia con base; docena = 12; 3 docenas = 36 UND; `normalizar_unidad` con alias; **traducción automática de las unidades viejas al reabrir la base**. |
| **5 · DÓNDE VIVE LA BASE DE DATOS** | Corriendo desde el código → junto al `.py`; **simulando `sys.frozen` → `%LOCALAPPDATA%\SFIDA\`, fuera de cualquier carpeta temporal**; que la carpeta se cree sola; que se rescate una base que quedó junto al `.exe`; que **no invente nada** si no hay base vieja; que respaldo y restauración apunten a la base correcta y que el `.antes_de_restaurar` guarde lo previo. |

### 6.2 `test_app.py` — bloques

Corre con `QApplication` real (offscreen) y **bloquea los cuadros de diálogo**
para que nada quede esperando. Secciones:

| Sección | Qué cubre |
|---|---|
| datos base | Prepara artículos, sucursales y movimientos de prueba. |
| panel | Tarjetas, dona y barras del diseño v3. |
| stock | Filtros, chips, columnas; **que existan «Último precio» y «Fecha» y ya no «Costo prom.»**. |
| ingresos | Alta, bloqueo de boleta duplicada, **que el último precio sea solo informativo y no rellene el campo**, edición de precios de una boleta registrada. |
| salidas | Bloqueo de sacar más de lo que hay; **número de vale escrito a mano**; **el vale imprimible** (ver abajo). |
| sucursales | 3 filas con totales; unidades recibidas. |
| reportes | Las 4 pestañas, incluida la de historial de precios. |
| control maestro | Arranca bloqueado; rechaza la clave mala; entra con la buena; **se bloquea al salir de la sección**; el botón de pasar a MAYÚSCULAS. |
| textos de la interfaz | **Que nada haya quedado en MAYÚSCULA SOSTENIDA** en los textos de la UI. |
| diseño v3 | Colores y medidas. |
| layout | Que las páginas entren en 1366×768. |
| animaciones | Que apagadas el aviso se vea entero de una; que encendidas entre fundiéndose; que de fábrica vengan encendidas; posición de la pastilla del menú. |
| capturas | Genera los 11 PNG de `capturas/`. |

**Las 4 pruebas del ticket (críticas para la fase 4)**:

1. El vale de 80 mm sale en formato ticket (`VALE DE SALIDA DE ALMACEN`,
   `<pre`, el número del vale) y **lleva las dos líneas de firma**.
2. También se arma para 58 mm; **la versión A4 usa `<table>` y dice «Recibí
   conforme»**; hay 3 anchos y el primero es 80; se puede listar impresoras.
3. **Ninguna línea del ticket de 80 ni de 58 mm se pasa del ancho del papel.**
4. **El nombre del artículo y su código arrancan en la misma columna**
   (`SANGRIA_ITEM`); la cabecera sangra la continuación bajo el valor
   (`SANGRIA_CAMPO`); la equivalencia larga se parte en vez de cortarse.

---

## 7. Comportamiento no obvio — resumen para el port

Lo que se pierde si no se copia a propósito:

1. **`PRAGMA foreign_keys = ON` en cada conexión.** Sin esto los `CASCADE` no
   corren.
2. **`siguiente_nro_vale` cuenta, no toma el máximo.** Ver la pregunta 3.
3. **`registrar_salida` agrupa las líneas repetidas ANTES de validar el
   stock**, y guarda una sola línea por artículo.
4. **`registrar_salida` valida el stock antes de comprobar que el vale no
   exista** — el orden de los mensajes de error importa para el usuario.
5. **Tolerancia de 0.0001 en todas las comparaciones de stock** (flotantes).
6. **La observación de ingresos y salidas NO se pasa a mayúsculas** (solo
   `strip()`), aunque el CLAUDE.md la enumera entre los campos que sí. **El
   código manda.**
7. **El código del artículo se guarda con `strip().upper()`, no con
   `normalizar_nombre`**: conserva los espacios internos.
8. **`normalizar_datos_existentes` no toca `articulos.codigo`.**
9. **`listar_articulos` filtra con `LIKE` (sensible a tildes) y `listar_stock`
   filtra en memoria con `coincide` (insensible).** Son dos búsquedas
   distintas a propósito; el buscador de la pantalla de stock usa la segunda.
10. **`historial_precios` calcula las variaciones sobre TODAS las compras y
    recién después filtra por período**, así que la primera fila del período
    conserva su variación real contra la compra anterior.
11. **`kardex` acumula el saldo sobre todo el histórico y después filtra**, así
    que el saldo arrastrado es correcto.
12. **`kardex` ordena por `fecha, tipo` alfabético**: dentro de un mismo día,
    AJUSTE va antes que INGRESO y este antes que SALIDA.
13. **`equivalencia_unidad` devuelve vacío si el factor es 1**, por eso CJA,
    PQT, BOL, JGO, ROL y BLQ no muestran equivalencia aunque no sean la base.
14. **`normalizar_unidad` nunca falla: cae en `UND`.**
15. **`auditar` se traga sus propias excepciones.**
16. **`fmt_precio` devuelve `—` para 0**, nunca `S/ 0.00`.
17. **El aviso de artículo parecido no bloquea**, solo informa.
18. **`pedir_clave` no pregunta si el Control Maestro ya está desbloqueado.**
19. **El Control Maestro se re-bloquea al navegar afuera** y **bloquea el campo
    30 s a los 5 intentos**.
20. **«Borrar todos los movimientos» exige escribir literalmente `BORRAR`.**
21. **`restaurar_bd` valida el archivo y guarda un `.antes_de_restaurar`.**
22. **`migrar_bd_anterior` nunca pisa una base existente** y **copia también
    los `-journal` / `-wal` / `-shm`**.
23. **`importar_articulos_csv` reactiva los artículos que actualiza.**
24. **`exportar_csv` usa `;` y `utf-8-sig`** (Excel en español).
25. **El total de copias por defecto al imprimir es 2.**
26. **En papel angosto (< 38 columnas) las firmas van una debajo de la otra.**
27. **El ticket termina con 3 líneas en blanco** para la cuchilla.
28. **`_migrar_categorias` manda a limpieza solo lo que contenga «LIMPIEZA»**;
    todo lo demás desconocido va a oficina.

---

## 8. Lista aparte: cosas que parecen mejorables (NO tocar durante el port)

Registradas acá para discutirlas después. **La app nueva tiene que hacer
exactamente lo mismo que la vieja.**

1. **`siguiente_nro_vale` usa `COUNT(*) + 1`.** Si se anula un vale, el
   siguiente número propuesto se repite y el sistema avisa «ya fue registrado»
   sobre su propia sugerencia. Con `MAX` del sufijo no pasaría.
2. **`SucursalPage` cruza los totales por `codigo` en vez de por `id`.**
   Funciona porque el código es único, pero es frágil.
3. **`SucursalPage.pintar` llama a `listar_salidas` una vez por sucursal**
   dentro del bucle, solo para sacar la fecha del último reparto (N+1).
4. **`ReportePage` calcula el «Valor S/» en la pantalla**, no en el core: es
   lógica de negocio fuera de su lugar.
5. **`IngresoPage._pintar_det` consulta el artículo uno por uno** en cada
   repintado.
6. **La observación de las salidas nunca se llena**: `SalidaPage.guardar` pasa
   `""` fijo, aunque la columna existe y el ticket la imprimiría.
7. **El docstring de `SFIDA.py` dice v3.0 y el core dice 3.1.**
8. **`DlgSucursal` propone `SUC%02d` contando las inactivas**: puede proponer
   un código ya usado.
9. **«Ver detalle» de salidas usa un `QMessageBox` de texto plano**, no un
   diálogo propio como el de ingresos.
10. **`_COLUMNAS` (42/30/80) está fijo por ancho de papel**, sin relación
    explícita con el margen. En web habría que derivarlo.
11. **La categoría en la importación CSV se decide por «contiene LIMPIEZA»**:
    un artículo llamado con esa palabra en otra columna podría confundirse.
12. **No hay índice en `ingresos.fecha` ni en `salidas.fecha`** aunque casi
    todos los reportes filtran por ahí. (Agregar un índice **sí** cambia el
    esquema: dejarlo para después del port.)

---

## 9. Preguntas para vos (no las adiviné)

1. **La base de producción está casi vacía** (34 artículos del catálogo
   sugerido, 0 sucursales, 0 movimientos, 0 config). ¿Es la buena? ¿O la
   operación real está en otra PC / otro archivo, o todavía no arrancó? De
   esto depende cuánto cuidado necesita la migración de datos.
2. **Hay dos bases**: la de producción en `%LOCALAPPDATA%\SFIDA\` (86 016
   bytes) y una junto al código en `SFIDA - UTILITARIOS\SFIDA\` (86 016 bytes
   también) que se usa al correr `python SFIDA.py`. ¿Alguna vez cargaste datos
   corriendo desde el código, o todo pasó siempre por el `.exe`?
3. **Numeración de vales**: cuando anulás un vale, ¿el número tiene que
   quedar libre para reusarse, o el siguiente debe seguir de largo? Hoy queda
   libre y el sistema te avisa que «ya existe» sobre su propia sugerencia.
4. **Observación en las salidas**: la columna existe y el ticket la imprimiría,
   pero la pantalla nunca la llena. ¿La querés en la versión nueva o la
   sacamos?
5. **La casilla «Imprimir el vale al guardar» viene marcada de fábrica.**
   ¿Se mantiene así?
