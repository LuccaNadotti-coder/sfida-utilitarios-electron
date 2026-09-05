# Registro de trampas

Cosas que fallaron de una forma que no se parecía al problema real, o que
funcionaron dando un resultado falso. Se anotan a medida que aparecen, con
**cómo se detectaron**, porque la pista suele ser más útil que la solución.

Índice por fase. Las de impresión están desarrolladas en
`prototipo-impresion/README.md`.

---

## Fase 0 — impresión (10)

Ver `prototipo-impresion/README.md`, sección «Trampas encontradas». Resumen:

| # | Trampa |
|---|---|
| 1 | `webContents.print()` mide en **micrones**; `printToPDF()` en **pulgadas**. |
| 2 | `silent: true` necesita `deviceName` explícito. |
| 3 | `margins: { marginType: 'none' }` evita que el driver térmico agregue márgenes. |
| 4 | `document.documentElement.scrollHeight` devuelve el alto del **viewport**, no del contenido. |
| 5 | Al destruir la última `BrowserWindow`, Electron cierra la app. |
| 6 | Hay que esperar `document.fonts.ready` antes de medir. |
| 7 | El tamaño de letra se **mide**, no se fija. |
| 8 | npm 11 bloquea el postinstall de Electron. |
| 9 | `capturePage()` falla con `UnknownVizError` en el primer arranque en frío. |
| 10 | El alto de la hoja cambia entre versiones de Electron (0,2 mm de la 32 a la 43). |

---

## Fase 1 — esqueleto y base de datos

### 11. `@electron/rebuild` dice «Rebuild Complete» sin generar ningún binario

**Qué pasó.** El plan era poner `electron-rebuild` en el `postinstall`, porque
históricamente había que recompilar better-sqlite3 para el ABI de Electron.
Al probarlo (`@electron/rebuild` 4.2.0 contra better-sqlite3 13.0.3) imprimió
`✔ Rebuild Complete`… y no produjo ningún `.node`. Dejó un `build/Release/`
con un marcador `.forge-meta` y una carpeta `obj` vacía.

**Cómo se detectó.** Buscando el archivo que debería haber creado:

```bash
ls node_modules/better-sqlite3/build/Release/    # → solo .forge-meta y obj/
find node_modules/better-sqlite3 -name "*.node"  # → solo prebuilds/, ninguno compilado
```

**Por qué importa.** Una herramienta que informa éxito sin haber hecho nada es
peor que no tenerla: tapa justo el problema que venía a resolver. Si algún día
hiciera falta recompilar de verdad, ese `✔` haría perder horas.

**Qué se hizo.** No se usa `@electron/rebuild`. En su lugar,
`scripts/verificar-nativos.mjs` **comprueba** en vez de recompilar: abre
Electron de verdad, carga el módulo, hace una consulta y mira el resultado.
Corre en el `postinstall` y también con `npm run verificar:nativos`.

### 12. La trampa del `NODE_MODULE_VERSION` ya no aplica — pero por un motivo que hay que saber

better-sqlite3 **13.x usa N-API** (`node-addon-api`), que es ABI-estable entre
Node y Electron, y trae **un solo binario por plataforma** en `prebuilds/` que
sirve para los dos. Verificado: carga en Electron 43.2.0 sin recompilar nada
(N-API 10, NODE_MODULE_VERSION 148, Node 24.18.0).

**Ojo con el número de versión**: better-sqlite3 **12.x** todavía tiene
`"install": "prebuild-install || node-gyp rebuild"` y se comporta como siempre.
Si alguna vez hay que **bajar** a la 12, vuelve a hacer falta compilar, y con
eso vuelve la necesidad de tener las herramientas de compilación de Visual
Studio en cualquier PC donde se haga `npm install`.

### 13. La trampa nº 5 de impresión volvió a aparecer en el proyecto nuevo

Sacando las capturas de a un tamaño por vez, salía **una sola**: al destruir la
primera ventana no quedaba ninguna viva, Electron disparaba
`window-all-closed` y se cerraba. La segunda captura nunca se sacaba **y no
había ningún error**: simplemente faltaba un archivo.

**Cómo se detectó.** El script pedía dos tamaños y el log mostraba uno.
Contar lo que salió contra lo que se pidió.

**Qué se hizo.** `estaCapturando()` en `src/main/captura.ts`, consultado por el
handler de `window-all-closed`. Es el mismo patrón que `valesAbiertos` en el
prototipo de impresión.

> Es una trampa **general de Electron**, no de una función concreta: cualquier
> trabajo que use ventanas ocultas de a una la va a encontrar. Vale la pena
> revisarla cada vez que se agregue una.

### 14. `app.getPath('userData')` NO es `%LOCALAPPDATA%`

En Windows devuelve `%APPDATA%` (Roaming). La versión Python guarda en
`%LOCALAPPDATA%\SFIDA\`. Si se usara `getPath('userData')`, la app nueva
abriría un archivo **distinto** al de la vieja y parecería que se perdieron los
datos.

La ruta se arma explícita en `src/main/rutas.ts`, replicando
`carpeta_datos()`. Lo vigilan las pruebas de `pruebas/rutas.test.ts`.

### 15. Las versiones de `@types/*` no siguen a las de su paquete

`npm install` falló con `ETARGET: No matching version found for
@types/react-dom@19.2.8`. React iba en 19.2.8 pero `@types/react-dom` iba en
19.2.4 y `@types/react` en 19.2.18. Se versionan por separado.

### 16. `electron-vite 5` y `@vitejs/plugin-react 6` son incompatibles entre sí

- `electron-vite@5.0.0` → peer `vite: ^5 || ^6 || ^7`
- `@vitejs/plugin-react@6.1.0` → peer `vite: ^8`

No hay Vite que cumpla los dos. **Cómo se detectó:** leyendo los `peerDependencies`
antes de instalar, no después de que rompiera. Conjunto coherente elegido:

```
vite 7.3.6 · electron-vite 5.0.0 · @vitejs/plugin-react 5.2.0
@tailwindcss/vite 4.3.3 · vitest 4.1.11
```

### 17. La limpieza de una prueba puede hacerse pasar por un fallo de la prueba

Una prueba del respaldo fallaba con `EPERM` al borrar la carpeta temporal, con
la aserción **ya cumplida**: en Windows SQLite tarda un instante en soltar el
archivo. Leído rápido, parecía un error de la lógica del respaldo.

**Qué se hizo.** El borrado del temporal es tolerante (`maxRetries` y `catch`
vacío), y la prueba de los archivos `-wal`/`-shm` usa la función pura, sin
abrir ninguna base. Un detalle del sistema de archivos no puede disfrazarse de
error de negocio.

---

## Fases 2 a 5

### 18. MAX del sufijo no es lo mismo que «los números no se reusan»

Al portar el correlativo del vale de `COUNT(*)+1` a `MAX+1`, escribí una prueba
que afirmaba que anular un vale nunca libera su número. **Falló.** MAX se
calcula sobre los vales que existen: si se anula el **más alto**, ese número
vuelve a quedar disponible.

**Cómo se detectó.** La prueba, no el código. Escribir la aserción fuerte
(«nunca se reusa») en vez de la débil («no propone uno ocupado») fue lo que
mostró la diferencia.

**Por qué importa.** El bug reportado **sí** quedó arreglado: ya no propone un
número que existe. Pero no es un talonario estricto. Está documentado en
`CAMBIOS_DELIBERADOS.md` con las dos pruebas que dejan por escrito ambos
comportamientos.

### 19. En Electron 43, `PrinterInfo` ya no declara `isDefault` ni `status`

El tipo de TypeScript los sacó; el runtime **sí** los sigue devolviendo
(comprobado en la fase 0). Se leen de forma defensiva, cayendo en `options`.
Que el tipo no lo diga no significa que no esté, y que esté hoy no significa
que esté mañana.

### 20. `app.getVersion()` devuelve la versión de ELECTRON sin empaquetar

El pie de la barra lateral mostraba «SFIDA v43.2.0». La versión real se inyecta
al compilar desde `package.json` (`__VERSION_APP__` en
`electron.vite.config.ts`).

### 21. `w-full` y el ancho que manda la pantalla compiten, y gana el orden del CSS

`Campo` y `Selector` tenían `w-full` en el mismo elemento que la clase de ancho
que les pasaba la pantalla (`w-[200px]`). Las dos son utilidades de anchura:
gana la que esté después en la hoja de estilos, no la que esté después en el
atributo `class`. Resultado: las barras de filtros se partían en tres líneas
sin motivo aparente.

**Cómo se detectó.** Mirando la captura de «Artículos y stock» a 1366 px. El
verificador automático no lo agarra: no había desborde, solo se veía feo.
**Las capturas hay que mirarlas.**

**Qué se hizo.** El ancho va en un `<div>` contenedor; el control interno se
queda con `w-full`.

### 22. Una prueba mía le escribió a la base de PRODUCCIÓN

Probando la app **empaquetada** con PATH limpio, usé `cygpath` para convertir
rutas. No existe en este shell, así que `SFIDA_DB` quedó **vacía**. La app hizo
exactamente lo correcto —resolver la ruta de producción— y le escribió a la
base real: creó su respaldo automático y guardó la marca en `config`.

**Qué se perdió.** Nada. El único cambio fue una fila en `config`, y el
respaldo automático hizo su trabajo. Se restauró el estado previo.

**Por qué importa igual.** Una prueba jamás debería poder tocar datos de
verdad, aunque no rompa nada. Y el fallo fue silencioso: una variable vacía no
avisa, simplemente cae en el valor por defecto — que acá es producción.

**Qué se hizo.** `verificarModoSeguro()` en `src/main/rutas.ts`: si está activo
un modo de verificación (captura, impresión) y la ruta resuelta es la de
producción, **no abre la base** y sale con un mensaje explícito. La app normal
sigue abriendo producción en silencio, que es su trabajo; el que tiene que ser
explícito es el que la usa para probar. Tres pruebas lo vigilan en
`pruebas/rutas.test.ts`.

### 23. Una excepción en `app.whenReady()` deja el proceso colgado para siempre

Al probar la salvaguarda del punto 22, la app no cerró: se quedó sin ventana y
sin mensaje, consumiendo memoria. La excepción dejaba la promesa rechazada sin
atender, y como **no había ninguna ventana que cerrar**, `window-all-closed`
nunca se disparaba y Electron no tenía motivo para salir.

**Cómo se detectó.** El comando se pasó del tiempo límite. Un proceso zombi.

**Qué se hizo.** Todo el arranque va dentro de un `try/catch` que registra el
error, muestra un `dialog.showErrorBox` si hay interfaz, y llama a
`app.exit(1)`. Es el equivalente del `_morir_sin_qt()` de la versión Python:
nunca dejar a la persona del almacén frente a una ventana que no abre.

### 24. `CREATE TABLE IF NOT EXISTS` no actualiza una tabla que ya existe, y el índice se cae encima

La v5 agrega la columna `ingresos.nro_proveedor` y un índice que la usa
(`ix_ing_prov`). Los dos estaban en la misma constante `ESQUEMA`, y `conectar()`
la ejecutaba **antes** de migrar.

Sobre una base nueva funciona perfecto. Sobre una base v4 —la que tiene todos
los datos del almacén— la tabla `ingresos` ya existe, así que
`CREATE TABLE IF NOT EXISTS` **no hace nada**: no agrega la columna nueva. Dos
líneas más abajo, el `CREATE INDEX` sobre esa columna revienta con
`no such column: nro_proveedor`, y como eso pasa antes de que la migración
llegue a correr, **la base vieja no se puede abrir nunca**: cada intento falla
en el mismo punto.

**Cómo se detectó.** Escribiendo `pruebas/migracion.test.ts`, que arma a mano
una base con el esquema exacto de la v4 y la abre. Ocho pruebas fallaron todas
con el mismo error. Ninguna prueba anterior lo habría encontrado: todas parten
de una base nueva, donde el orden da igual. **El único camino que importaba —el
de las PC del almacén que ya tienen datos— era justamente el que no se
probaba.**

**Por qué importa.** Era el bug más caro posible del port: la app nueva
instalada sobre la base real, y no abre. Y el mensaje habla de una columna, no
de una migración, así que manda a buscar el problema al lugar equivocado.

**Qué se hizo.** El esquema se partió en `ESQUEMA_TABLAS` y `ESQUEMA_INDICES`, y
`conectar()` intercala los pasos en un orden que ahora está escrito con sus
motivos: tablas → respaldo → normalizar unidades → migrar → índices → semillas.

De paso aparecieron dos problemas del mismo origen:

- **`UNIQUE (nro_documento)` dentro de la tabla no se puede agregar con
  `ALTER TABLE`.** Una base v4 se quedaría con el UNIQUE viejo
  `(tipo_doc, nro_documento)` y aceptaría dos ingresos con el mismo número
  interno. Se movió la regla a un índice único (`ux_ing_nrodoc`), que la
  migración sí puede crear: así la base nueva y la migrada terminan iguales.
- **`migrarUnidades()` tenía que correr antes de la conversión a unidad
  chica**, no después. Busca el factor por el código de unidad; con el texto
  viejo (`GALON` en vez de `GAL`) no lo encuentra, cae en UND con factor 1 y
  **no convierte nada, sin avisar**. El stock quedaría en galones con la
  etiqueta de litros.

---

## v5.1

### 25. Pedirle a la impresora una hoja a medida deja el ticket CENTRADO, con media hoja en blanco arriba

**Qué pasó.** El vale salía impreso con un espacio en blanco enorme arriba,
casi tan alto como el propio ticket. En PDF salía perfecto. En la versión
Python **también** salía bien, así que no era el armado del ticket.

**Cómo se detectó.** Por la diferencia entre los dos caminos, que en el código
solo se separan en una línea: `printToPDF()` recibe el alto medido y lo usa tal
cual; `print()` se lo pide al **controlador de Windows**. Y por la proporción
del blanco: no era un margen fijo, era casi la mitad de lo que sobraba de
papel. Eso no es un margen, es un centrado.

Chromium manda la hoja a medida en el DEVMODE (`dmPaperWidth` /
`dmPaperLength`) **sin apagar la bandera `dmPaperSize`**, y con esa bandera
puesta casi ningún controlador mira el alto a medida: se queda con el papel que
tiene configurado. Entonces la hoja que armó Chromium (80 × 158 mm) es más
chica que el papel real (una A4, o el rollo de 297 mm) y Chromium **la centra**:
quedan dos franjas iguales, una arriba y otra abajo. Qt no lo hacía: dibujaba
el documento desde el borde de arriba, midiera lo que midiera la hoja.

**Por qué importa.** Es medio metro de papel por vale, y el ticket sale a la
mitad del rollo. Además el síntoma apunta al lugar equivocado: parece un
margen mal puesto, y los márgenes ya estaban en cero.

**Qué se hizo.** `imprimirVale()` **no le pide ninguna medida a la impresora**
(y el documento tampoco declara `@page { size }`, que dispara el mismo
centrado desde el CSS). Así la hoja es la del controlador, no hay nada que
centrar y el vale empieza en el borde de arriba. Para los rollos cuyo
controlador sí acepta el alto a medida y corta justo, queda la casilla
«Cortar el papel justo donde termina el vale» en la ventana de imprimir,
apagada de fábrica.

---

## v5.2

### 26. El papel mide 80 mm, pero la impresora térmica no imprime 80 mm

**Qué pasó.** El ticket salía con la punta derecha de cada línea comida: se
perdían unos tres caracteres, justo los de la columna de la derecha (los
totales y el final de los nombres largos). En el PDF y en la vista previa
estaba todo completo.

**Cómo se detectó.** Por lo que NO fallaba: ninguna línea se pasaba de 42
columnas —hay pruebas que lo vigilan— y el ancho medido daba exacto. Si el
texto entra en el papel y aun así se corta, lo que no coincide no es el texto:
es el papel. El área que un rollo de 80 mm imprime de verdad son unos 72 mm,
centrados; con 3 mm de margen el vale ocupaba de 3 a 77 mm, y todo lo que
pasaba de 76 caía fuera.

**Por qué importa.** Un vale con el total cortado no sirve como comprobante, y
el error es silencioso: en pantalla se ve perfecto y nada avisa.

**Qué se hizo.** `margen()` pasó de 3 mm a **5.5 mm** en 80 mm y **4.5 mm** en
58 mm. No se toca el tamaño de la letra a mano: al achicarse el ancho útil, el
ajuste automático de `documento.ts` la recalcula solo.

---

### 27. El margen de los costados NO se pone con relleno: se pone centrando

**Qué pasó.** Apenas se agrandó el margen (trampa 26), el vale dejó de
cortarse pero salió **desparejo**: un costado con mucho más blanco que el
otro, unas 3 a 5 letras de diferencia.

**Cómo se detectó.** El relleno era simétrico —`padding: 5.5mm` a los dos
lados— así que el papel no podía verse desparejo… salvo que la hoja no midiera
lo que decíamos. Ahí está la clave: el documento fijaba `body { width: 80mm }`
y el ticket arrancaba a 5.5 mm del borde IZQUIERDO de esa caja. Pero desde la
trampa 9 **no se le pide ninguna medida a la impresora**: la hoja es la del
controlador, y un rollo de «80 mm» suele declarar 72 a 76. Con una hoja de
74 mm, el vale quedaba a 5.5 mm de la izquierda y a −0.5 de la derecha: 6 mm
de diferencia, casi 4 letras. Exactamente el síntoma.

Y explica también por qué antes se cortaba: con margen de 3 mm el bloque medía
74 mm y no entraba en esa hoja.

**Por qué importa.** El relleno fijo solo acierta si la hoja mide justo el
ancho nominal, y eso no lo controla el programa. Es un error que además no se
ve en la vista previa, donde la hoja siempre mide lo que dice el papel.

**Qué se hizo.** El bloque del ticket tiene su ancho útil y se centra con
`margin: 0 auto`; el ancho del papel solo se declara `@media screen`, para la
vista previa y la foto. Al imprimir el body ocupa la hoja que dé el
controlador y el vale queda centrado **en ella**, mida lo que mida.

`medirMargenesLaterales()` lo comprueba de verdad en
`npm run verificar:impresion`: emula la impresión (`media: print`) sobre hojas
de 80, 74 y 72 mm y exige que los dos costados queden iguales. Con el código
anterior, la de 74 mm daba 6 mm de diferencia.

Para el resto —una impresora cuyo cabezal no imprima centrado— queda el ajuste
**«Correr el vale a los costados»** en la ventana de imprimir, en milímetros y
guardado en `config`.

> **Esta solución estuvo MAL y se dio marcha atrás.** Lo que sigue en la trampa
> 28 explica por qué. El síntoma que se quería arreglar era real; el arreglo
> rompía algo mucho peor.

---

## v5.2.1

### 28. Centrar el vale lo mandó afuera del rollo: la hoja NO es el papel

**Qué pasó.** Con la casilla «Cortar el papel justo donde termina el vale»
**destildada** —que es como tiene que estar— el vale salía **cortado a lo
ancho**: de cada línea se imprimían los tres o cuatro primeros caracteres y
nada más. Se leía `EGR`, `N°`, `FEC`, `DES`, `TOT`, y el resto era papel en
blanco. Tildándola el vale salía entero, pero con media hoja en blanco arriba
(la trampa 9 de siempre). Ninguna de las dos opciones servía.

**Cómo se detectó.** Por la cuenta, no por el código. Si el ticket mide 69 mm
y del papel solo salen los primeros ~3 mm de cada línea, el vale no está
arrancando en el milímetro 5.5: está arrancando cerca del 73. Y 73 es
exactamente `(216 − 69) / 2`. **216 mm es el ancho de una hoja CARTA**, que es
el tamaño con el que Chromium arma la página cuando no se le pide ninguna
medida a la impresora.

Ese «no pedir medida» es justo lo que hace la trampa 9 para que el vale empiece
arriba de todo. O sea: las trampas 9 y 27 juntas se anulaban. La 9 dice «no
declares la hoja»; la 27 centraba el vale **dentro de esa hoja que nadie
declaró**, que resultó ser carta. El vale quedaba centrado en una hoja
imaginaria de 216 mm, y el rollo de 80 mm solo imprimía su borde izquierdo.

La confirmación fue empírica: `medirMargenesLaterales()` sobre una hoja de
216 mm devolvía `izq = 73.50`.

**Por qué importa.** El vale es el comprobante que firma quien recibe la
mercadería. Impreso a tres caracteres por línea no es nada. Y es el peor tipo
de error: la vista previa lo mostraba perfecto, porque ahí la hoja siempre
mide lo que dice el papel.

**Qué se hizo.** Se volvió al planteo de la v5.1, que era el correcto:
`body { width: <ancho útil>mm; padding: <margen>mm }`, el vale **pegado al
borde izquierdo** de la hoja, sin `margin: 0 auto` y sin `@media screen`. Así
no importa cuánto mida la hoja —80, 74 o los 216 de una carta—: el vale
arranca siempre al margen del papel.

La verificación cambió de pregunta. Antes exigía que los dos costados quedaran
iguales, y esa pregunta solo tiene sentido si la hoja es el papel. Ahora
`npm run verificar:impresion` emula la impresión sobre hojas de **216**, 80, 74
y 72 mm y exige que el vale arranque a 5.5 mm del borde izquierdo **en las
cuatro**. La de 216 mm es la que importa: es la que se estaba imprimiendo de
verdad.

Para la impresora cuyo cabezal no imprima centrado sigue estando **«Correr el
vale a los costados»**, que es un ajuste explícito, en milímetros, que decide
quien está mirando el papel. Adivinar el centro desde el código fue el error.

**La lección, que sirve fuera de esto:** centrar es *repartir el sobrante de un
contenedor*, así que solo se puede centrar contra algo cuya medida se conoce.
Cuando la medida la pone otro —el controlador de la impresora, acá— anclar a un
borde es correcto y centrar es adivinar.

---

### 29. Un buscador que exige TODAS las palabras se apaga justo cuando más se escribe

**Qué pasó.** En el combo de artículos de ingresos y egresos, al escribir dos o
tres palabras salían las sugerencias, pero al escribir el nombre completo la
lista se vaciaba. Desde la pantalla parecía que la búsqueda inteligente
funcionaba «hasta que el texto llenaba el renglón» y ahí se apagaba sola.

**Cómo se detectó.** El síntoma señalaba al ancho del campo, que no tiene nada
que ver. La pista real estaba en el filtro:

```ts
palabras.every((p) => blob.includes(p))   // TODAS, y tal cual
```

Es un **AND**: cada palabra nueva solo puede sacar artículos de la lista, nunca
sumar. Con dos palabras es casi imposible fallar; con siete, basta que una sola
no esté escrita igual que en la base —«ARCHIVADOR **DE** LOMO ANCHO», un
plural, una letra de más— para que el resultado sea cero. La correlación con el
ancho del renglón era pura coincidencia: los dos dependen de cuánto se escribió.

**Por qué importa.** Quien carga la mercadería escribe el nombre completo
porque cree que así afina la búsqueda, y obtiene lo contrario: nada. Y el
programa no puede explicar por qué, porque «ningún artículo coincide» es cierto
y a la vez inútil.

**Qué se hizo.** El filtro pasó a ser un **puntaje** (`compartido/busqueda.ts`):
se aceptan palabras cortadas por la mitad, plurales y una letra mal tipeada en
las palabras largas; los números nunca se perdonan, porque «75 GR» y «70 GR»
son artículos distintos. Y cuando con todo lo escrito no queda nada, se
muestran los que **más** palabras cumplen, con el rótulo «Los más parecidos»:
una aproximación avisada es útil, una lista vacía no.

**La lección:** en un buscador, cada palabra que se escribe tiene que poder
*ordenar mejor* el resultado, no solo descartarlo. Un AND estricto castiga
escribir más, que es exactamente lo contrario de lo que la persona espera.

---

## Cómo agregar una trampa acá

1. **Qué pasó** — el síntoma, tal como se vio.
2. **Cómo se detectó** — la pista concreta. Es lo más valioso.
3. **Por qué importa** — qué se rompería en el almacén.
4. **Qué se hizo** — y dónde quedó en el código.
