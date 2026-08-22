# Cambios deliberados respecto de la versión Python

El port es **fiel**: la app nueva tiene que hacer exactamente lo mismo que la
vieja. Las únicas excepciones son las de esta lista, todas aprobadas
explícitamente. Cualquier otra diferencia que aparezca es un error del port,
no una decisión.

Lo que parezca mejorable y **no** esté acá va a la sección 8 de
`MIGRACION_INVENTARIO.md`, para discutirlo después del port.

---

## 1. El correlativo del vale usa MAX, no COUNT

| | |
|---|---|
| **Estado** | Pendiente — se implementa en la fase 2 |
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
| **Estado** | Pendiente — pantalla en la fase 3 |
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
