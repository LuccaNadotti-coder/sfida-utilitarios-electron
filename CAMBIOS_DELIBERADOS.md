# Cambios deliberados respecto de la versión Python

Este archivo tiene **dos partes**, y la diferencia importa:

- **La v4 fue un port fiel.** La app nueva tenía que hacer exactamente lo mismo
  que la vieja, y las tres únicas excepciones son los puntos 1 a 3. Cualquier
  otra diferencia que apareciera era un error del port, no una decisión.
- **La v5 ya no es un port.** Es una versión con funciones nuevas, pedidas
  explícitamente. Rompe la compatibilidad con la app de Python **a propósito**
  y hay una migración que se encarga de las bases viejas. Son los puntos 4 en
  adelante.

Lo que parezca mejorable y **no** esté acá va a la sección 8 de
`MIGRACION_INVENTARIO.md`, para discutirlo aparte.

---

# Parte 1 · La v4 (port fiel)

---

## 1. El correlativo del vale usa MAX, no COUNT

| | |
|---|---|
| **Estado** | Hecho |
| **Aprobado** | Sí |
| **Dónde estaba** | `siguiente_nro_vale()` en `sfida_core.py` |
| **Sección 8** | punto 1 |

**Antes.** El número propuesto era `COUNT(*) + 1` de los vales `V{año}-%`. Si se
anulaba un vale, el conteo bajaba y el sistema volvía a proponer un número ya
usado: avisaba «ya existe» sobre su propia sugerencia.

**Ahora.** Se toma el **máximo sufijo** existente del año y se le suma 1. Los
números no se reusan, igual que en un talonario físico.

**Qué NO cambia.** El número sigue siendo **editable**: se puede escribir el de
una boleta física, y el aviso de «ese número ya existe» se mantiene.

> **Actualización de la v5:** esto último dejó de ser cierto. El número del
> vale **ya no es editable**. Ver el punto 6.

**Límite conocido, encontrado al escribir la prueba.** MAX se calcula sobre los
vales que **existen**. Si se anula el vale **más alto**, ese número vuelve a
quedar libre y se propone de nuevo.

|  | Se anula un vale **del medio** | Se anula el **último** |
|---|---|---|
| Antes (COUNT) | propone un número **ya ocupado** → avisa «ya existe» sobre su propia sugerencia | propone el número recién liberado |
| Ahora (MAX) | propone el siguiente libre ✅ | propone el número recién liberado |

O sea: **el bug reportado quedó arreglado** (nunca más propone un número
ocupado). Lo que MAX no da es un talonario estricto donde un número anulado no
se vuelve a usar jamás. Para eso habría que guardar un contador en `config` que
solo suba — **es otra decisión y no está aprobada**, así que no se hizo.

Las dos pruebas de `pruebas/nucleo-vales-clave.test.ts` dejan los dos
comportamientos por escrito: «anular un vale del medio ya no propone un numero
ocupado» y «LÍMITE CONOCIDO: anular el ULTIMO vale sí libera su numero».

**Al portar `test_core.py`:** la prueba «numero de vale correlativo» hay que
adaptarla, y conviene agregar una que cubra justamente el caso que se arregla
(anular un vale y comprobar que el siguiente número NO se repite).

---

## 2. La observación de la salida se conecta

| | |
|---|---|
| **Estado** | Hecho |
| **Aprobado** | Sí |
| **Dónde estaba** | `SalidaPage.guardar()` en `sfida_paginas.py` |
| **Sección 8** | punto 6 |

**Antes.** La columna `salidas.observacion` existía, `registrar_salida()` la
recibía y el ticket la imprimía (`OBSERV. :`), pero la pantalla pasaba `""`
fijo. O sea: estaba todo hecho menos el campo.

**Ahora.** La pantalla de salidas tiene su campo de observación y se guarda.

**Ojo con la regla de mayúsculas.** El comportamiento no obvio nº 6 del
inventario dice que la observación de ingresos y salidas **NO** se pasa a
mayúsculas (solo `strip()`), aunque el CLAUDE.md viejo la enumeraba entre los
campos que sí. **Manda el código: se conserva el `strip()` solo.** Conectar el
campo no es excusa para cambiar esa regla de paso.

---

## 3. La casilla «Imprimir el vale al guardar» sigue marcada de fábrica

| | |
|---|---|
| **Estado** | Confirmado — no es un cambio, es una confirmación |
| **Aprobado** | Sí |

Se mantiene el comportamiento actual. Se anota acá porque se preguntó
explícitamente y para que nadie lo «arregle» más adelante pensando que es un
descuido.

---

---

# Parte 2 · La v5 (funciones nuevas)

**Desde acá se rompe la compatibilidad con la app de Python, a propósito.** Una
base v5 **no** la puede abrir la app vieja: tiene columnas que no entiende. La
migración de v4 a v5 corre sola al abrir y hace dos respaldos antes de tocar
nada (`src/main/db/migraciones.ts`).

---

## 4. Fraccionamiento: se compra por galón y se reparte por litro

| | |
|---|---|
| **Estado** | Hecho |
| **Aprobado** | Sí — es el pedido que abrió la v5 |

**El problema real.** «Ingreso 1 galón, pero ese galón al final lo reparto en
litros a las tiendas, o en 500 ml. ¿Cómo haríamos ahí?»

**La decisión.** La unidad del artículo pasa a ser **la más chica** de su
familia (la LEJÍA se lleva en litros, no en galones). En cada movimiento se
elige en qué unidad se está digitando y el sistema convierte.

**Lo que se convierte son DOS cosas, no una:**

1. **La cantidad**: 1 GAL entra como 3.785 L.
2. **El precio**: S/ 22 el galón se guarda como S/ 5.81 el litro.

Convertir solo la cantidad es el error silencioso que hay que evitar: el
inventario quedaría valorizado **3.785 veces de más** y nada avisaría.

**Lo que se digitó se guarda igual**, en `cantidad_origen` y `unidad_origen`,
para poder imprimirlo y auditarlo. Si están en NULL, la línea se cargó
directamente en la unidad de stock.

**No se puede mezclar familias**: pedir kilos de un artículo que se mide en
litros da un error claro, no una conversión inventada.

Lo cubren 17 pruebas en `pruebas/fraccionamiento.test.ts` y 11 en
`pruebas/migracion.test.ts`.

---

## 5. El N° del ingreso lo genera el sistema, y el del proveedor va aparte

| | |
|---|---|
| **Estado** | Hecho |
| **Aprobado** | Sí |

**Antes.** `ingresos.nro_documento` era el número de la boleta del proveedor, y
se escribía a mano.

**Ahora.** Son **dos campos distintos**, porque son dos cosas distintas:

| Campo | Qué es | Quién lo pone |
|---|---|---|
| `nro_documento` | el N° interno del almacén (`I2026-0001`) | el sistema, correlativo, no editable |
| `nro_proveedor` | el N° que figura en el papel del proveedor | la persona, tal cual lo ve |

**La regla de «no registrar dos veces la misma boleta» se mudó** de
`(tipo_doc, nro_documento)` a `(proveedor, nro_proveedor)`, que es lo que
realmente identifica una compra. Un número de proveedor vacío se deja pasar:
hay compras sin comprobante.

**Detalle técnico que importa:** el «no se repite el N° interno» se aplica con
un **índice único** (`ux_ing_nrodoc`) y no con un `UNIQUE` adentro de la tabla.
Una base v4 ya trae su propio UNIQUE y eso no se puede cambiar con
`ALTER TABLE`; con el índice, la base nueva y la migrada terminan con la misma
regla. Ver la trampa 24 en `TRAMPAS.md`.

---

## 6. El N° del vale de salida ya no es editable

| | |
|---|---|
| **Estado** | Hecho |
| **Aprobado** | Sí |

Contradice lo que decía el punto 1 («el número sigue siendo editable»). Fue un
pedido posterior y explícito: el número lo pone el sistema y no se toca.

El límite conocido del punto 1 (anular el vale más alto libera su número)
**sigue vigente**: MAX se calcula sobre los vales que existen.

---

## 7. Los tickets impresos cambian de forma

| | |
|---|---|
| **Estado** | Hecho |
| **Aprobado** | Sí |

| Qué | Antes | Ahora |
|---|---|---|
| Título del ticket de salida | `VALE DE SALIDA DE ALMACEN` | `SALIDA DE ALMACEN` |
| Líneas `ENTREGA :` / `RECIBE  :` en la cabecera | sí | **no** |
| Firmas `ENTREGUE CONFORME` / `RECIBI CONFORME` | sí | sí, se conservan |
| Renglón `NOMBRE` debajo de cada firma | no | **sí**, en los dos tickets |
| Ticket de ingreso | no existía | **sí**: `INGRESOS ALMACEN UTILITARIOS` |

Los nombres de quién entrega y quién recibe **se escriben a mano sobre el
papel**. La pantalla de salidas ya no los pide, y lo dice ahí mismo.

La columna «Recibió» del historial se conserva porque los vales **viejos** sí
tienen ese dato; para los nuevos muestra «—».

---

## 8. Las tres supermejoras aprobadas

| | |
|---|---|
| **Estado** | Hecho |
| **Aprobado** | Sí — elegidas entre varias propuestas |

1. **Sugerencia de compra** (`Artículos y stock → Qué comprar`). Mira lo que
   salió en los últimos N meses, saca el promedio diario y calcula cuánto falta
   para cubrir X días. Nunca sugiere menos que el stock mínimo. **No compra ni
   registra nada**: solo arma la lista.
2. **Conteo físico guiado** (`Artículos y stock → Conteo físico`). Se carga lo
   contado de varios artículos y se aplica **todo junto**, en una transacción.
   Un campo vacío significa «no lo conté», **no** «hay cero» — confundir esas
   dos cosas vaciaría el almacén.
3. **Respaldo automático.** En cada apertura se guarda una copia en
   `respaldos/` y se conservan **las 10 más recientes**. Es red contra el error
   humano, no contra un disco roto: para eso sigue haciendo falta la copia
   externa. Ver `SEGURIDAD.md`.

---

## 9. Dos correcciones de seguridad

| | |
|---|---|
| **Estado** | Hecho |
| **Aprobado** | Sí — salieron de la revisión pedida |

- `shell.openExternal()` ahora solo abre `http://` y `https://`. Antes aceptaba
  cualquier esquema, incluidos los que le piden algo al sistema operativo.
- El CSV exportado neutraliza lo que Excel tomaría por fórmula. Los nombres
  entran por CSV y vuelven a salir en los reportes, así que el circuito
  existía de verdad.

El detalle completo, con lo que se revisó y lo que queda abierto, está en
`SEGURIDAD.md`.

---

## 10. Las salidas pasan a llamarse EGRESOS, y el vale lleva la letra `E`

| | |
|---|---|
| **Estado** | Hecho (v5.1) |
| **Aprobado** | Sí, pedido explícito |

Todo lo que la persona lee dice ahora **egreso**: el menú, el título de la
pantalla, los botones, la tarjeta del panel, el kardex y los dos tickets
(«EGRESOS ALMACEN UTILITARIOS», el mismo formato que el de ingreso; en la
v5.1 decían «EGRESO DE ALMACEN» y «VALE DE EGRESO»).

El correlativo del vale pasa de `V{año}-0000` a **`E{año}-0000`**, para que
haga juego con la `I` de los ingresos.

**Lo que NO cambió, y es a propósito:**

- **La base de datos.** Las tablas siguen llamándose `salidas` / `salida_det`
  y las funciones, `registrarSalida()`. Renombrarlas no le cambia nada a quien
  usa el almacén y obligaría a migrar la base entera.
- **Los vales ya emitidos.** Los que empiezan con `V` se quedan como están: son
  documentos que ya se imprimieron y se firmaron.
- **El correlativo NO vuelve a empezar en 0001.** `siguienteNroVale()` mira
  los dos prefijos del año, así que si el último fue `V2026-0057`, el siguiente
  es `E2026-0058`.
- **El orden del kardex.** Antes salía del alfabeto (AJUSTE < INGRESO <
  SALIDA). Con «EGRESO» el alfabeto habría adelantado los egresos a los
  ingresos del mismo día y el saldo se leería en negativo, así que el orden
  ahora es explícito en el SQL.

---

## 11. Al imprimir ya no se le pide a la impresora una hoja a medida

| | |
|---|---|
| **Estado** | Hecho (v5.1) |
| **Aprobado** | Sí, corrección de un defecto |

La versión Qt le pedía a Windows una hoja del alto exacto del vale y dibujaba
desde el borde de arriba. Chromium hace lo mismo, pero si el controlador
**ignora** esa medida —que es lo normal— centra el ticket en el papel que el
controlador sí tiene, y queda media hoja en blanco arriba. Ver la trampa 25.

Ahora el ticket se manda sin pedir medida: la hoja es la del controlador y el
vale empieza arriba de todo. Queda la casilla **«Cortar el papel justo donde
termina el vale»** en la ventana de imprimir, apagada de fábrica, para los
rollos cuyo controlador sí acepta el alto a medida.

El PDF no cambió: ahí la medida la pone Chromium y siempre salió bien.

---

## 12. El vale se separa del borde del papel

| | |
|---|---|
| **Estado** | Hecho (v5.2) |
| **Aprobado** | Sí, corrección de un defecto |

El margen del ticket pasa de 3 mm a **5.5 mm** (80 mm) y **4.5 mm** (58 mm),
porque la impresora térmica no imprime todo el ancho del papel y se comía los
últimos caracteres de cada línea. El vale queda centrado en el rollo, como en
el diseño anterior. La letra se achica sola: nunca se fija a mano. Ver la
trampa 26.

---

## 13. El ticket de egreso se llama igual que el de ingreso

| | |
|---|---|
| **Estado** | Hecho (v5.2) |
| **Aprobado** | Sí, pedido explícito |

El título pasa de «EGRESO DE ALMACEN» a **«EGRESOS ALMACEN UTILITARIOS»**, que
es el hermano exacto de «INGRESOS ALMACEN UTILITARIOS». En el A4, «VALE DE
EGRESO» pasa a **«EGRESOS ALMACÉN UTILITARIOS»**. Los dos comprobantes se leen
ahora como parte del mismo juego de papeles.

---

## 14. Las listas largas se muestran de a 10, con paginador

| | |
|---|---|
| **Estado** | Hecho (v5.2) |
| **Aprobado** | Sí, pedido explícito |

Antes cada tabla dibujaba TODAS sus filas. Con el catálogo completo o con años
de boletas, cada tecla del buscador rearmaba y animaba cientos de filas y la
aplicación se sentía trabada.

Ahora `<Tabla>` acepta `porPagina` y al pie aparece «1–10 de 137», el selector
**Filas: 5 / 10 / 25 / 50 / 100 / Todas** y las flechas. De fábrica van 10.
Está puesto en artículos y stock, qué comprar, conteo físico, los dos
historiales, sucursales, el panel, los reportes y el historial del Control
Maestro.

Al buscar o filtrar se vuelve sola a la primera página: quedarse en la página 7
de una lista que ahora tiene 2 se ve como una tabla vacía.

---

## 15. La cantidad se escribe como el precio

| | |
|---|---|
| **Estado** | Hecho (v5.2) |
| **Aprobado** | Sí, pedido explícito |

El campo de cantidad mostraba siempre el número formateado («0.00»), así que
para cargar una cantidad había que **seleccionar los dígitos con el mouse** y
escribir encima; borrar un dígito devolvía «0.00» y no se podía tipear el punto
decimal.

Ahora se comporta como el campo de soles, que ya era cómodo: en cero se ve
vacío (con el 0 de fondo), al entrar se selecciona todo solo, y mientras se
escribe manda el texto crudo, así «12.» es un estado válido. Los botones − y +
siguen estando, y ya no roban el tabulador.

---

## Decisiones técnicas que no son cambios de negocio

Van acá para que quede el motivo, pero no alteran lo que hace la app.

### No se usa `@electron/rebuild`

El plan original lo pedía en el `postinstall`. No se usa porque
better-sqlite3 13.x es N-API y no necesita recompilación, y porque al probarlo
informó éxito sin generar ningún binario. Se reemplazó por una **verificación**
real (`scripts/verificar-nativos.mjs`). Ver trampas 11 y 12 en `TRAMPAS.md`.

### Electron 43.2.0 y electron-builder 26.15.3, fijos y sin `^`

Es la combinación que ya corre en producción en la PC de Windows 10 build
14393. Sin el cursor `^` para que un `npm install` en otra máquina no traiga
una versión distinta de la probada.
