# SFIDA · Manual de uso

Programa para llevar el control de los útiles de oficina y limpieza del
almacén: qué entra, qué sale a cada sucursal y cuánto queda.

---

## Instalar

1. Doble clic en **SFIDA_Setup.exe**.
2. Elegí dónde instalarlo (o dejá lo que propone) y seguí adelante.
3. Al terminar quedan dos accesos directos: uno en el **Escritorio** y otro en
   el **menú Inicio**, los dos con el nombre **SFIDA Utiles v4**.

No hace falta ser administrador de la computadora.

> **Va a convivir con el SFIDA anterior.** Son dos programas distintos y se
> distinguen por el nombre: el nuevo dice **v4**. Los dos usan la misma
> información, así que **no conviene tenerlos abiertos al mismo tiempo**.

También existe **SFIDA_Portable_4.0.0.exe**: no se instala, se abre directo.
Sirve para probar en una computadora sin dejar nada.

---

## La pantalla

A la izquierda está el menú con las siete secciones. Arriba, el título de dónde
estás y un buscador que revisa todo el sistema.

Atajos de teclado:

| Tecla | Qué hace |
|---|---|
| `Ctrl` + `B` | Abre la búsqueda general |
| `Ctrl` + `1` … `Ctrl` + `7` | Va directo a cada sección |
| `Esc` | Cierra la ventana que esté abierta |

---

## Panel

Lo primero que ves al abrir. De un vistazo:

- **Las seis tarjetas**: cuántos artículos y sucursales hay, cuántas boletas y
  vales se registraron, cuántas alertas de stock y cuánto vale el inventario.
- **Nivel del inventario**: qué proporción está en buen nivel, por agotarse o
  bajo el mínimo.
- **Movimiento de los últimos 6 meses**: lo que entró y lo que salió.
- **Artículos más repartidos** y **Necesitan reposición**.
- **Últimos movimientos**.

---

## Artículos y stock

La lista de todo lo que hay en el almacén.

**Para buscar**, escribí en la casilla de arriba: sirve el nombre, el código o
la categoría. No importa si escribís con mayúsculas o sin tildes.

**Los tres botones** (Todos / Bajo el mínimo / Sin stock) filtran la lista.

**La columna Estado** te dice de un vistazo cómo está cada artículo:

| Estado | Qué significa |
|---|---|
| **Ok** | Hay de sobra |
| **Por agotarse** | Está cerca del mínimo |
| **Bajo mínimo** | Hay que comprar |
| **Sin stock** | No queda nada |

### Crear un artículo

Botón verde **Nuevo artículo**.

- El **nombre** se guarda siempre en MAYÚSCULAS. Si ya existe algo parecido, el
  programa te avisa abajo del campo — es solo un aviso, podés seguir igual.
- La **categoría** es una de las dos que hay: útiles de oficina o de limpieza.
- La **unidad** sale de una lista. Si tiene equivalencia te la muestra abajo
  (por ejemplo, «1 GAL = 3.785 L»).
- El **código** se genera solo. Si querés poner otro, destildá «Automático».
- El **stock mínimo** es a partir de cuánto querés que te avise.
- El **stock inicial** es lo que ya tenés en el almacén hoy. Solo aparece al
  crear.

Si vas a cargar varios seguidos, usá **Guardar y crear otro**: te deja el
formulario listo para el siguiente.

### Ajustar stock

Cuando contás físicamente y no coincide con el sistema. Botón **Ajustar stock**
con el artículo seleccionado.

**Escribís la cantidad REAL que contaste**, no la diferencia. El programa
calcula solo cuánto suma o descuenta y te lo muestra antes de guardar.

Elegí un motivo de la lista, o escribí el tuyo.

### Cargar muchos artículos de una vez

1. **Plantilla de carga** guarda un archivo de Excel de ejemplo.
2. Llenalo con tus artículos.
3. **Importar de Excel** lo carga. Los que ya existan se actualizan.

---

## Ingresos (boletas)

Cuando llega mercadería del proveedor.

1. **Arriba**: el tipo de documento, el número tal como figura en el papel, la
   fecha, el proveedor y una observación si querés.
2. **En el medio**: buscás el artículo, ponés la cantidad y el precio, y tocás
   **Agregar**. Repetís por cada artículo de la boleta.
3. **Guardar ingreso**.

> **El precio es opcional.** Si lo dejás en cero, la línea queda «sin precio» y
> se ve un guion. Cada compra puede tener un precio distinto: el programa
> guarda el de cada boleta y no lo promedia.

Cuando elegís un artículo, abajo te muestra en gris **el último precio que
pagaste**. Es solo para ayudarte a comparar: **nunca rellena el campo solo**.

### Corregir un precio

Seleccioná la boleta en el historial y tocá **Ver detalle**. Ahí podés escribir
sobre la columna «Precio unit.» y después **Guardar precios**.

Las cantidades no se corrigen ahí: para eso hay que anular la boleta.

### Anular una boleta

Seleccionala y tocá **Anular ingreso**. Pide la clave del Control Maestro.

No se puede anular si lo que entró ya se repartió: el programa te avisa qué
artículo es el problema.

---

## Salidas a sucursal

Cuando se manda mercadería a un local.

1. **El número de vale**: el programa propone el que sigue, pero **lo podés
   cambiar** y escribir el de tu boleta física. Si ese número ya se usó, te
   avisa en rojo.
2. La fecha, la sucursal, quién entrega y quién recibe.
3. Si querés, una **observación**: sale impresa en el vale.
4. Buscás cada artículo y ponés la cantidad. Al elegirlo te muestra **cuánto
   hay disponible**, en verde, ámbar o rojo.
5. **Guardar salida**.

> **Nunca se puede sacar más de lo que hay.** El programa no te deja, y te dice
> cuánto queda.

La casilla **«Imprimir el vale al guardar»** viene marcada: apenas guardás, se
abre la ventana de impresión. Si no querés imprimir ahora, destildala.

### Imprimir un vale

Seleccionalo en el historial y tocá **Imprimir vale**.

- **Impresora**: la lista de las que tiene Windows. Recuerda la última que usaste.
- **Tamaño del papel**: ticket de 80 mm, de 58 mm, o una hoja A4 para archivar.
- **Copias**: vienen 2. Lo normal es una para el almacén y otra que viaja con
  la mercadería.
- A la derecha ves **cómo va a salir impreso**, al tamaño real.
- **Guardar PDF** en vez de imprimir, si querés archivarlo.

> Si la impresora de tickets corta el texto por los costados, probá con
> **58 mm**.

---

## Sucursales

Los locales a los que se reparte. La tabla muestra cuántos vales recibió cada
uno, cuántas unidades y cuándo fue el último reparto.

**Nueva sucursal** para agregar. Necesitás código y nombre; la dirección y el
responsable son opcionales (la dirección sale impresa en el vale).

> Sin sucursales cargadas no se pueden registrar salidas.

---

## Reportes

Arriba elegís el período. Los botones **Este mes**, **Últimos 3 meses** y
**Todo** son atajos.

| Pestaña | Para qué |
|---|---|
| **Consumo por sucursal** | Cuánto recibió cada local y cuánto vale. Al hacer clic en una fila, abajo aparece el detalle. |
| **Kardex por artículo** | La historia completa de un artículo: cada entrada, cada salida y el saldo. |
| **Artículos más usados** | El ranking de lo que más se reparte. |
| **Historial de precios** | Cómo fue cambiando el precio. En verde bajó, en rojo subió. |

**Exportar reporte** guarda lo que estés viendo en un archivo que se abre con
Excel.

---

## Control Maestro

Sección protegida con clave. La de fábrica es **sfida2026** — cambiala.

Se cierra sola cuando salís de la sección. Si te equivocás cinco veces, hay que
esperar 30 segundos.

| Pestaña | Para qué |
|---|---|
| **Seguridad** | Cambiar la clave. Se guarda encriptada: **si la olvidás no se puede recuperar.** |
| **Stock mínimo en lote** | Calcula el mínimo sugerido de cada artículo según lo que realmente se consumió. Podés copiar los sugeridos o escribir los tuyos. |
| **Catálogos** | Ver las categorías y las unidades. Reactivar artículos desactivados. Pasar a MAYÚSCULAS lo que se cargó antes. |
| **Auditoría** | Todo lo que se hizo y cuándo. En rojo, lo delicado. |
| **Respaldos y datos** | Datos de la empresa, copias de seguridad, animaciones y la zona de riesgo. |

### Copias de seguridad

**Hacé una copia una vez por semana** en una USB o carpeta de la nube.
Botón **Crear copia de seguridad** en Respaldos y datos.

Para volver atrás, **Restaurar desde una copia**. Antes de reemplazar, el
programa guarda una copia de lo que había.

### Si el programa se mueve a los tirones

En **Respaldos y datos** destildá **Animaciones suaves**. Todo sigue
funcionando igual, solo que sin movimiento.

---

## Preguntas frecuentes

**¿Dónde están mis datos?**
En un solo archivo, en `C:\Users\<tu usuario>\AppData\Local\SFIDA\`.
El botón **Abrir la carpeta** en Respaldos y datos te lleva ahí.

**¿Si desinstalo pierdo todo?**
No. La información queda fuera de la carpeta del programa y sobrevive a
desinstalar y volver a instalar.

**¿Por qué todo se escribe en MAYÚSCULAS?**
Para que no exista dos veces el mismo artículo por haberlo escrito distinto.
«Lejía» y «LEJIA» serían dos cosas para la computadora. Las tildes y la Ñ se
conservan. El buscador es la excepción: ahí escribís como quieras.

**¿Puedo agregar otra categoría?**
No. Solo hay dos a propósito, para que el catálogo no se llene de categorías
repetidas.

**Borré un artículo y sigue apareciendo.**
Si tenía movimientos no se borra: se desactiva, para no perder el historial.
Está en Control Maestro → Catálogos → Artículos desactivados, y desde ahí se
puede reactivar.

**El programa no abre.**
Copiar solo el `.exe` no alcanza: hay que instalarlo con `SFIDA_Setup.exe` o
usar el portable completo.
