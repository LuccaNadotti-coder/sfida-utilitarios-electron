# SFIDA · Manual de uso

Programa para llevar el control de los útiles de oficina y limpieza del
almacén: qué entra, qué sale a cada sucursal y cuánto queda.

---

## Instalar

1. Doble clic en **SFIDA_Setup.exe**.
2. Elegí dónde instalarlo (o dejá lo que propone) y seguí adelante.
3. Al terminar quedan dos accesos directos: uno en el **Escritorio** y otro en
   el **menú Inicio**, los dos con el nombre **SFIDA Utiles v5**.

No hace falta ser administrador de la computadora.

> **No toca ningún otro programa de la computadora.** Si ya tenés instalados
> los otros sistemas del almacén, siguen donde están: éste se instala aparte y
> no los desinstala.

También existe **SFIDA_Portable_5.0.0.exe**: no se instala, se abre directo.
Sirve para probar en una computadora sin dejar nada.

---

## Si venías usando la versión anterior

**La primera vez que abras la v5, tu información se actualiza sola.** No hay
que hacer nada, pero conviene saber qué pasa:

1. **Antes de tocar nada se guardan dos copias** de tu base de datos. Si algo
   sale mal, tus datos de antes siguen estando.
2. **Los artículos que se median en galones pasan a medirse en litros.** No
   perdés nada: si tenías 5 galones de lejía, ahora dice 18.925 litros, que es
   exactamente lo mismo. El precio se ajusta igual, así que **el valor del
   almacén no cambia**.
3. **A cada boleta vieja se le pone un número interno** (`I2026-0001`), y el
   número que vos habías escrito pasa a la casilla «N° boleta del proveedor».

> **Importante:** una vez que abrís la v5, **la versión vieja de Python ya no
> puede abrir esa base**. Es un camino de ida, y es a propósito: las funciones
> nuevas no entran en el formato viejo. Por eso se guardan las copias.

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

Esta sección tiene **tres pestañas**:

| Pestaña | Para qué |
|---|---|
| **Artículos y stock** | La lista de todo lo que hay. Es la de siempre. |
| **Qué comprar** | El programa te dice qué falta y cuánto pedir. |
| **Conteo físico** | Cargar el inventario contado a mano, todo de una vez. |

---

### Artículos y stock

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

## Qué comprar

Pestaña nueva. Contesta la pregunta de todos los meses: **¿qué hay que pedir?**

La cuenta es simple, y conviene entenderla para confiar en ella:

1. Mira **cuánto salió** del almacén en los últimos meses (vos elegís cuántos).
2. Lo divide por los días de ese período → **cuánto se gasta por día**.
3. Calcula cuánto hace falta para los días que quieras cubrir.
4. Le resta **lo que ya hay**.

Nunca te va a sugerir menos que el **stock mínimo** que le pusiste al artículo.

**Las dos listas de arriba las elegís vos:**

- **Mirar el consumo de**: último mes, 3 meses, 6 meses o un año. Si el consumo
  es parejo, 3 meses anda bien. Si hubo un mes raro, mirá 6 para que no lo
  desvíe.
- **Quiero cubrir**: para cuántos días querés comprar.

**La columna Urgencia** ordena la lista:

| Urgencia | Qué significa |
|---|---|
| **Sin stock** | No queda nada. Va primero. |
| **Urgente** | Alcanza para menos de una semana |
| **Pronto** | Está bajo el mínimo o se acaba dentro del período |
| **Puede esperar** | Hay de sobra |

**«Saldría»** es una referencia calculada con el **último precio que pagaste**.
No es una cotización: los precios cambian.

> **Este panel no compra ni registra nada.** Solo te arma la lista. Con
> **Exportar la lista** la guardás en un archivo de Excel para llevársela al
> proveedor.

---

## Conteo físico

Pestaña nueva. Para cuando se cuenta el almacén de verdad, estante por estante.

Antes había que ajustar **artículo por artículo**, cada uno con su ventanita.
Con 200 artículos era una tarde entera. Ahora:

1. Andá recorriendo la lista con el papel del conteo al lado.
2. En la columna **«Contado de verdad»** escribí lo que hay realmente.
3. La columna **Diferencia** te muestra al instante si sobra o falta, en verde
   o en rojo.
4. Elegí el **motivo** y tocá **Aplicar el conteo**.

> **Lo que no tocás, no se toca.** Un casillero vacío significa «no lo conté»,
> **no** «hay cero». Los artículos que no cargues quedan exactamente como
> estaban.

> **Entra todo junto o no entra nada.** Si algún renglón dejara el stock en
> negativo, el programa te lo marca y no guarda nada hasta que lo corrijas.
> Nunca vas a quedar a mitad de camino sin saber dónde.

Los artículos que ya coinciden con el sistema **no generan ningún ajuste**: no
ensucian el kardex con movimientos de cero.

Los tres filtros de arriba (**Todos / Ya contados / Con diferencia**) ayudan a
no perderse en una lista larga. «Con diferencia» es el repaso final antes de
aplicar.

---

## Ingresos (boletas)

Cuando llega mercadería del proveedor.

1. **Arriba** hay **dos números**, y son distintos:
   - **N° de ingreso**: lo pone el programa solo (`I2026-0001`) y no se puede
     escribir. Es el número del almacén.
   - **N° boleta del proveedor**: el que figura en el papel que te trajeron.
     Ese lo escribís vos.

   Después el tipo de documento, la fecha, el proveedor y una observación si
   querés.
2. **En el medio**: buscás el artículo, ponés la cantidad, **elegís en qué
   unidad la estás poniendo** y el precio. Tocás **Agregar**. Repetís por cada
   artículo de la boleta.
3. **Guardar ingreso**.

> **El precio es opcional.** Si lo dejás en cero, la línea queda «sin precio» y
> se ve un guion. Cada compra puede tener un precio distinto: el programa
> guarda el de cada boleta y no lo promedia.

### Comprar por galón y repartir por litro

Ésta es la parte nueva, y es la que más cambia el día a día.

Cada artículo tiene una **unidad de stock**, que es la más chica: la lejía se
lleva **en litros**, aunque la compres por galón.

Al cargar la boleta, **elegís la unidad en la que estás comprando**:

- Ponés **cantidad 1** y unidad **GAL** → el programa suma **3.785 litros** al
  stock.
- El precio también se convierte solo: si el galón costó S/ 22, el programa
  guarda **S/ 5.81 el litro**.

Después, al repartir a las tiendas, ponés **litros** o **500 ML**, lo que
corresponda. No hay que hacer ninguna cuenta a mano.

> **Solo se puede convertir dentro de la misma familia**: de galones a litros
> sí, de litros a kilos no. Si te equivocás de unidad, el programa te lo dice.

### El comprobante impreso del ingreso

Ahora el ingreso **también imprime su papel**, igual que las salidas. Dice
**INGRESOS ALMACEN UTILITARIOS** y lleva abajo dos firmas con un renglón para
el **NOMBRE**:

- **Entregué conforme**: lo firma quien trae la mercadería (el transportista).
- **Recibí conforme**: lo firma quien la recibe en el almacén.

La casilla **«Imprimir el comprobante al guardar»** viene marcada.

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

1. **El número de vale** lo pone el programa solo y **no se puede cambiar**.
2. La fecha y la sucursal a la que va.
3. Si querés, una **observación**: sale impresa en el vale.
4. Buscás cada artículo, ponés la cantidad y **elegís la unidad**. Al elegirlo
   te muestra **cuánto hay disponible**, en verde, ámbar o rojo, y la columna
   «Sale del stock» te dice cuánto se descuenta de verdad.
5. **Guardar salida**.

> **Quién entrega y quién recibe ya no se cargan en la pantalla.** Esos nombres
> se escriben **a mano sobre el papel impreso**, en el renglón que hay debajo
> de cada firma. Es más rápido y no obliga a tipear el mismo nombre todos los
> días.

> **Nunca se puede sacar más de lo que hay.** El programa no te deja, y te dice
> cuánto queda. La cuenta la hace en la unidad chica: si hay 3.785 litros y
> pedís 5000 ml, te avisa que no alcanza.

> **Un artículo aparece una sola vez en el vale.** Si agregás algo que ya
> estaba, se **suma a la fila que ya tenías** y el programa te lo avisa. Si lo
> pusiste en otra unidad, junta todo en la unidad de stock. Para corregir una
> cantidad, tocá **Quitar** en esa fila y volvé a agregarla.
>
> *En los ingresos sí se puede repetir el mismo artículo, y es a propósito: una
> boleta puede traer el mismo producto a dos precios distintos.*

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
| **Valor e inversión** | Los dos gráficos nuevos. Ver abajo. |
| **Consumo por sucursal** | Cuánto recibió cada local y cuánto vale. Al hacer clic en una fila, abajo aparece el detalle. |
| **Kardex por artículo** | La historia completa de un artículo: cada entrada, cada salida y el saldo. |
| **Artículos más usados** | El ranking de lo que más se reparte. |
| **Historial de precios** | Cómo fue cambiando el precio. En verde bajó, en rojo subió. |

**Exportar reporte** guarda lo que estés viendo en un archivo que se abre con
Excel.

### Valor e inversión

Es la pestaña con la que abre Reportes, y tiene dos gráficos.

**Cuánto vale el almacén, día por día.** Una línea con el valor del inventario
a lo largo del período. **Pasá el mouse por encima** y te muestra la fecha, el
valor y cuántas unidades había ese día.

> Cada punto es el stock de esa fecha valorizado **al precio que regía ese
> día**, no al de hoy. Por eso el gráfico no se reescribe hacia atrás cuando
> sube un precio: lo que ves en marzo es lo que valía en marzo.

**Cuánto se invirtió en cada tienda.** Una barra por sucursal con lo que se le
mandó en el período. **Tocá una barra** y abajo aparece el detalle de qué
recibió esa tienda.

Las tiendas que no recibieron nada **aparecen igual, en cero**. Es a propósito:
si se escondieran, no te enterarías de que a una tienda no le está llegando
nada.

Las tres tarjetas de arriba resumen: cuánto vale hoy, cuánto cambió en el
período y cuánto se repartió.

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

**El programa se respalda solo.** Cada vez que lo abrís guarda una copia en la
subcarpeta `respaldos`, y conserva las **10 más recientes**. Si cargaste algo
mal, ahí está el archivo de antes.

**Pero eso no alcanza**, y es importante entender por qué: esas copias están en
**el mismo disco**. Te salvan de un error de digitación; **no** te salvan de
que se rompa la computadora, se la roben o se prenda fuego.

**Por eso: hacé una copia una vez por semana en una USB o en la nube.** Botón
**Crear copia de seguridad** en Respaldos y datos.

Para volver atrás, **Restaurar desde una copia**. Antes de reemplazar, el
programa guarda una copia de lo que había.

> **Cuidá los pendrives con respaldos.** Cada uno es una copia completa de todo
> el inventario, con proveedores y precios, y **no está protegida con clave**.

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

**Compré un galón pero el stock dice litros. ¿Está mal?**
Está bien. Los líquidos se llevan **en litros**, que es la unidad más chica, y
así podés repartir litros o 500 ml sin hacer cuentas. 1 galón son 3.785 litros:
la cantidad es exactamente la misma, expresada distinto. El precio se convierte
igual, así que **el valor del almacén no cambia**.

**¿Puedo poner una unidad cualquiera al comprar?**
Solo las de la **misma familia**: si el artículo va en litros podés elegir
mililitros, litros, galones o bidones. Kilos no, porque no hay forma de saber
cuánto pesa un litro de cada cosa. Si te equivocás, el programa te avisa.

**¿Por qué ya no puedo escribir el número del vale?**
Porque lo lleva el sistema, correlativo, y así no se repiten ni se saltean. El
número de la boleta **del proveedor** sí lo escribís vos, en Ingresos: son dos
cosas distintas y ahora tienen cada una su casilla.

**¿Dónde pongo quién entrega y quién recibe?**
**En el papel, a mano.** Debajo de cada firma hay un renglón para el nombre.
Está así a propósito: se firma igual, y no hay que tipear el mismo nombre todos
los días.

**¿La versión vieja de Python sigue funcionando?**
Con una base ya actualizada a la v5, **no**. La v5 agrega información que el
programa viejo no entiende. Antes de actualizar se guardan dos copias
automáticas por si hiciera falta volver atrás.

**¿Mis datos están protegidos con la clave?**
La clave protege el **Control Maestro**, no el archivo. Cualquiera que pueda
copiar el archivo de datos puede abrirlo. Lo que de verdad lo protege es que la
computadora tenga contraseña de Windows y que los pendrives con respaldos no
anden dando vueltas.
