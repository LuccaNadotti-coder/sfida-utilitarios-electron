# SFIDA · Control de Útiles — versión Electron

Control de útiles de oficina y limpieza del almacén: qué entra, qué sale a cada
sucursal y cuánto queda. Reescritura en Electron de la app que corría en
Python + PySide6 + SQLite.

**Estado: v5 terminada.** Falta una sola cosa, y es física: probar la impresión
contra la GOOJPRT del almacén y el instalador en una PC del almacén.

---

## Las dos versiones

La **v4** fue un port fiel: hacía exactamente lo mismo que la app de Python y
compartía el archivo de datos con ella.

La **v5 ya no es un port.** Agrega funciones que se pidieron después y **rompe
la compatibilidad con Python a propósito**. Hay una migración automática que
lleva las bases v4 a v5, con dos respaldos antes de tocar nada.

### Lo que trae la v5

| | |
|---|---|
| **Fraccionamiento** | Se compra por galón y se reparte por litro o por 500 ml. Se convierte la cantidad **y el precio**. |
| **N° de ingreso automático** | El del almacén lo pone el sistema; el del proveedor va en su propia casilla. |
| **Ticket de ingreso** | «INGRESOS ALMACEN UTILITARIOS», con firmas y renglón para el nombre. |
| **N° de vale no editable** | Lo lleva el sistema, correlativo. |
| **Panel de valor e inversión** | Dos gráficos interactivos: cuánto vale el almacén día por día y cuánto se invirtió en cada tienda. |
| **Qué comprar** | Sugerencia de compra según el consumo real. |
| **Conteo físico guiado** | Cargar el inventario contado de una sola vez, todo o nada. |
| **Respaldo automático** | Una copia en cada apertura, se conservan las 10 últimas. |
| **Seguridad** | Dos correcciones reales. Ver `SEGURIDAD.md`. |

---

## Las dos carpetas

```
Proyectos/
├── SFIDA - UTILITARIOS/          ← la app de HOY (Python + PySide6). NO SE TOCA.
│   └── SFIDA/                        el código está acá adentro
└── sfida-utilitarios-electron/   ← la app NUEVA (esta carpeta)
```

| | Vieja | Nueva |
|---|---|---|
| Carpeta | `SFIDA - UTILITARIOS\SFIDA\` | `sfida-utilitarios-electron\` |
| Stack | Python 3.9+ · PySide6 · SQLite | Electron 43 · React 19 · TypeScript · better-sqlite3 |
| Nombre instalado | **SFIDA** | **SFIDA Utiles v5** |
| Estado | En producción | Lista para probar en el almacén |
| Base de datos | `%LOCALAPPDATA%\SFIDA\sfida_inventario.db` | la misma ruta, **formato v5** |

### El formato de la base cambió en la v5

Hasta la v4 las dos apps abrían el mismo archivo sin convertir nada. **Desde la
v5 no**: se agregaron columnas que la app de Python no entiende.

- **La migración corre sola** al abrir (`src/main/db/migraciones.ts`) y es
  idempotente. Convierte el stock a la unidad chica, **reescala los precios por
  el mismo factor** (si no, el inventario se valorizaría 3.785 veces de más) y
  numera los ingresos viejos.
- **Antes de tocar nada hace dos respaldos**: el «antes de Electron», que se
  hace una sola vez, y el rotativo de cada apertura.
- **Es un camino de ida.** Una vez migrada, la app de Python ya no abre esa
  base. Por eso los respaldos.
- Verificado end-to-end contra el `.exe` empaquetado: una base v4 con 5 GAL de
  lejía a S/ 22.71 queda en 18.925 L a S/ 6.00 — **la misma mercadería y el
  mismo valor**, expresados en otra unidad.
- **En desarrollo se trabaja siempre sobre una copia** (`datos/sfida_dev.db`).
  Los modos de verificación **no pueden** correr contra producción: hay una
  salvaguarda que lo impide (ver trampa 22).

---

## Documentos

| Archivo | Qué es |
|---|---|
| `CLAUDE.md` | **Arquitectura y reglas del negocio.** Lo primero que hay que leer para tocar el código. |
| `MIGRACION_INVENTARIO.md` | La especificación: inventario completo del proyecto Python. |
| `CAMBIOS_DELIBERADOS.md` | Las diferencias aprobadas, en dos partes: la v4 (port fiel) y la v5 (funciones nuevas). |
| `SEGURIDAD.md` | Revisión de seguridad de la v5: qué estaba bien, qué se corrigió y **qué queda abierto**. |
| `TRAMPAS.md` | 24 cosas que fallaron de forma engañosa, con **cómo se detectaron**. |
| `MEJORAS_PENDIENTES.md` | Lista priorizada de qué atacar ahora que la app anda. |
| `MANUAL DE USO.md` | Para quien usa el almacén. En criollo. |
| `prototipo-impresion/README.md` | La prueba de impresión de la fase 0. |

---

## Cómo se corre

```bash
npm install                  # verifica que better-sqlite3 cargue en Electron
npm run dev                  # la app, con recarga en caliente
npm test                     # 241 pruebas de lógica, sin abrir ninguna ventana
npm run typecheck            # TypeScript en los tres procesos
npm run demo                 # crea datos/sfida_demo.db con datos de ejemplo
npm run capturas             # capturas de las 9 pantallas en 1366×768 y 1920×1080
npm run verificar:impresion  # PDF de los 2 tickets × 3 formatos + comprobaciones
npm run dist                 # instalador NSIS + portable en release/
```

> **Si `npm install` avisa que Electron no se descargó**, es npm 11 bloqueando
> los scripts de instalación:
> ```bash
> node node_modules/electron/install.js
> node node_modules/esbuild/install.js
> node node_modules/vite/node_modules/esbuild/install.js
> ```

### Contra qué base trabaja

| Prioridad | Origen | Ruta |
|---|---|---|
| 1 | `SFIDA_DB` (variable de entorno) | la que se le indique |
| 2 | desarrollo | `datos/sfida_dev.db` |
| 3 | empaquetada | `%LOCALAPPDATA%\SFIDA\sfida_inventario.db` |

---

## Por qué estas versiones

**Electron 43.2.0 y electron-builder 26.15.3, exactas y sin `^`.** Es la
combinación que ya corre en producción en las otras dos apps de almacén, en la
misma PC de **Windows 10 build 14393** que originó la migración. Está probada
en las máquinas reales; la última del registro no.

El resto del stack también va fijo, y además porque `electron-vite 5` y
`@vitejs/plugin-react 6` piden versiones de Vite incompatibles entre sí.

**No se usa `@electron/rebuild`**: better-sqlite3 13.x es N-API y funciona sin
recompilar; además, al probarlo informó éxito sin generar ningún binario. En su
lugar hay una verificación real en el `postinstall`. Ver trampas 11 y 12.

**Los gráficos son SVG propio, sin librería.** Las que sirven pesan entre 400 KB
y 1 MB, y viajarían enteras en el instalador que tiene que correr en la PC
vieja. Acá hacen falta exactamente dos formas.

**No desinstala otros programas.** El `appId` es `com.sfida.utiles`, distinto
del `com.sfida.almacen` que usan los otros dos sistemas. *(De paso: esos dos
comparten `appId` entre sí, así que hoy se pisan uno al otro. Está anotado en
`MEJORAS_PENDIENTES.md`.)*

---

## Estado

| Qué | Estado |
|---|---|
| Lógica y pruebas | ✅ 241 pruebas en verde |
| Interfaz | ✅ 7 secciones, sin desbordes en 1366×768 ni en 1920×1080 |
| Migración v4 → v5 | ✅ probada end-to-end contra el `.exe` empaquetado |
| Impresión | ✅ los 2 tickets × 3 formatos, con PDFs y comprobaciones · ⏳ **falta la GOOJPRT física** |
| Empaquetado | ✅ `SFIDA_Setup.exe` + portable, probados con PATH limpio · ⏳ **falta la PC del almacén** |
| Seguridad | ✅ revisada, 2 correcciones · ⚠️ la base **no está cifrada** (ver `SEGURIDAD.md`) |

### Lo que falta, y solo lo podés hacer vos

1. **Imprimir en la GOOJPRT real.** El código está probado con PDFs y con
   comprobaciones automáticas de los dos tickets, pero **ningún papel salió de
   una impresora térmica todavía**. Los puntos a mirar están en
   `prototipo-impresion/README.md`.
2. **Instalar `release/SFIDA_Setup.exe` en una PC del almacén.** Acá se probó
   con **PATH limpio** —sin Node ni herramientas de desarrollo— y con una base
   v4 de verdad para ver la migración completa. Es la verificación que faltó
   con la versión Qt, pero no reemplaza probarlo en la máquina real.
3. **Antes de instalar en la PC del almacén, copiá el `.db` a un pendrive.**
   El programa hace sus respaldos, pero quedan en el mismo disco.
