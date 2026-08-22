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

---

## Cómo agregar una trampa acá

1. **Qué pasó** — el síntoma, tal como se vio.
2. **Cómo se detectó** — la pista concreta. Es lo más valioso.
3. **Por qué importa** — qué se rompería en el almacén.
4. **Qué se hizo** — y dónde quedó en el código.
