# Mejoras pendientes, priorizadas

Repaso de la sección 8 de `MIGRACION_INVENTARIO.md` (las 12 cosas que dejamos
aparte para no «mejorar» reglas durante el port), ahora con la app nueva
andando y con lo que se aprendió construyéndola.

**Tres de las 12 ya se resolvieron** durante la migración porque eran gratis:
la nº 1 (correlativo con MAX), la nº 6 (observación conectada) y la nº 9 (el
detalle de salidas ahora es un diálogo de verdad). Ver
`CAMBIOS_DELIBERADOS.md`.

---

## Ahora: barato y arregla algo real

### 1. Índices en `ingresos.fecha` y `salidas.fecha` — *sección 8, punto 12*

Casi todos los reportes filtran por fecha y no hay índice. Con 34 artículos no
se nota; con dos años de movimientos, sí.

**Cuidado:** agregar un índice **cambia el esquema**, y hay una prueba que
compara contra el de Python. Hay que decidir primero si la app vieja se retira.
Mientras convivan, **no tocarlo**.

Cuando se retire la vieja: `CREATE INDEX ix_ing_fecha ON ingresos(fecha)` y
`CREATE INDEX ix_sal_fecha ON salidas(fecha)`, y actualizar el fijo de la
prueba.

### 2. `DlgSucursal` puede proponer un código ya usado — *punto 8*

Propone `SUC01`, `SUC02`… contando **también las inactivas**, así que puede
chocar. No rompe nada (el guardado lo rechaza), pero obliga a corregir a mano.

Arreglo: usar el máximo sufijo existente, igual que se hizo con los vales.
Media hora.

### 3. El «Valor S/» de Reportes se calcula en la pantalla — *punto 4*

Es lógica de negocio fuera del núcleo. En la versión Electron quedó en
`ipc.ts`, que es mejor que en el renderer, pero su lugar es
`nucleo/reportes.ts` con su prueba.

---

## Después: vale la pena cuando haya más datos

### 4. Consultas N+1 — *puntos 3 y 5*

`sucursales.listar` llama a `listarSalidas` una vez por sucursal solo para
sacar la fecha del último reparto. Con 3 sucursales da igual; con 30, no.

Se resuelve con una sola consulta que traiga `MAX(fecha)` agrupado.

### 5. El cruce por `codigo` en vez de por `id` — *punto 2*

`consumoPorSucursal` devuelve el código y se cruza por ahí. Funciona porque es
único, pero si algún día se puede editar el código de una sucursal, se rompe
silenciosamente. Devolver también el `id`.

### 6. Un talonario estricto para los vales

Hoy, anular el vale **más alto** libera su número. Si en el almacén eso importa
(auditoría, numeración fiscal), hay que guardar un contador en `config` que
solo suba.

**Es una decisión del negocio, no técnica**: pregunta para vos.

### 7. `_COLUMNAS` del ticket está fijo por ancho de papel — *punto 10*

42 / 30 / 80 columnas escritas a mano, sin relación explícita con el margen.
Se podría derivar del ancho útil y el tamaño de letra. **Riesgo alto y
beneficio bajo**: hoy funciona y está cubierto por pruebas. Solo si aparece un
cuarto ancho de papel.

---

## Probablemente nunca

### 8. La categoría en la importación CSV se decide por «contiene LIMPIEZA» — *punto 11*

Un artículo con esa palabra en otra columna podría confundirse. En la práctica
la plantilla tiene la categoría en su propia columna. Anotado por si aparece.

### 9. El docstring de versión desactualizado — *punto 7*

Era de la versión Python. En la nueva la versión sale de `package.json` y se
inyecta al compilar. **Resuelto.**

---

## Lo que agregaría yo, que no estaba en la lista

### A. Pruebas de interfaz y de extremo a extremo

Están las **172 de lógica** y las **del ticket**, pero la interfaz solo se
verifica con las capturas, que hay que mirar a ojo. Faltan:

- **Vitest + Testing Library** para los diálogos con reglas propias:
  `DlgArticulo` (código automático, aviso de parecidos), `DlgAjuste` (que se
  escriba la cantidad real y no la diferencia), `DlgDetalleIngreso`.
- **Playwright** para tres flujos de punta a punta: registrar un ingreso,
  registrar una salida, imprimir un vale.

Es lo que más valor agrega ahora. La versión Python tenía 168 pruebas de
interfaz y ese colchón hoy no está.

### B. Un chequeo de que las dos apps no escriban a la vez

Comparten el archivo. Hoy nada impide abrir las dos. Un archivo de bloqueo, o
al menos un aviso al arrancar si la otra está abierta, evitaría un problema
difícil de diagnosticar.

Mientras convivan, es la mejora con mejor relación riesgo/beneficio.

### C. Que el número de versión salga en la ventana de «Acerca de»

Hoy está en el pie de la barra lateral en letra chica. Para soportar a
distancia, conviene que sea fácil de leer y copiar.
