# SFIDA · Control de Útiles — versión Electron

Reescritura en Electron de la app de control de útiles de oficina y limpieza
que hoy corre en Python + PySide6 + SQLite.

**Estado: fases 0 a 6 terminadas.** Falta una sola cosa, y es física: probar la
impresión contra la GOOJPRT del almacén y el instalador en una PC del almacén.

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
| Nombre instalado | **SFIDA** | **SFIDA Utiles v4** |
| Estado | En producción | Lista para probar en el almacén |
| Base de datos | `%LOCALAPPDATA%\SFIDA\sfida_inventario.db` | **la misma** |

**La vieja no se toca hasta que la nueva esté probada en el almacén con uso
real durante varias semanas.** Los nombres son distintos a propósito para que
convivan sin confundirse.

### Comparten el mismo archivo de base de datos

El `.db` de SQLite es el mismo formato para Python y para `better-sqlite3`: no
hay que exportar ni convertir nada, se abre el mismo archivo. Por eso:

- **El esquema es idéntico.** No es una promesa: `pruebas/esquema.test.ts`
  compara el esquema que creamos contra el que crea Python —tablas, columnas
  con tipo y default, claves foráneas con su `ON DELETE`, índices— y falla si
  difieren en un solo elemento.
- **En desarrollo se trabaja siempre sobre una copia** (`datos/sfida_dev.db`).
  Los modos de verificación **no pueden** correr contra producción: hay una
  salvaguarda que lo impide (ver trampa 22).
- **Antes de la primera escritura sobre una base heredada de Python** se hace
  una copia con fecha, una sola vez.
- ⚠️ **No conviene tener las dos apps abiertas a la vez.** Ver
  `MEJORAS_PENDIENTES.md`, punto B.

---

## Documentos

| Archivo | Qué es |
|---|---|
| `CLAUDE.md` | **Arquitectura y reglas del negocio.** Lo primero que hay que leer para tocar el código. |
| `MIGRACION_INVENTARIO.md` | La especificación: inventario completo del proyecto Python. |
| `CAMBIOS_DELIBERADOS.md` | Las **únicas** diferencias aprobadas respecto de la versión Python. |
| `TRAMPAS.md` | 23 cosas que fallaron de forma engañosa, con **cómo se detectaron**. |
| `MEJORAS_PENDIENTES.md` | Lista priorizada de qué atacar ahora que la app anda. |
| `MANUAL DE USO.md` | Para quien usa el almacén. En criollo. |
| `prototipo-impresion/README.md` | La prueba de impresión de la fase 0. |

---

## Cómo se corre

```bash
npm install                  # verifica que better-sqlite3 cargue en Electron
npm run dev                  # la app, con recarga en caliente
npm test                     # 172 pruebas de lógica, sin abrir ninguna ventana
npm run typecheck            # TypeScript en los tres procesos
npm run demo                 # crea datos/sfida_demo.db con datos de ejemplo
npm run capturas             # capturas de las 7 pantallas en 1366×768 y 1920×1080
npm run verificar:impresion  # PDF de los 3 formatos + comprobaciones del ticket
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

---

## Estado por fase

| Fase | Qué | Estado |
|---|---|---|
| 0 | Inventario + prototipo de impresión | ✅ |
| 1 | Esqueleto y base de datos | ✅ esquema idéntico, verificado con prueba |
| 2 | Lógica de negocio y pruebas | ✅ 172 pruebas en verde |
| 3 | Interfaz | ✅ 7 pantallas + 7 diálogos, sin desbordes en 1366×768 |
| 4 | Impresión | ✅ código y PDFs · ⏳ **falta la GOOJPRT física** |
| 5 | Empaquetado | ✅ `SFIDA_Setup.exe` + portable · ⏳ **falta la PC del almacén** |
| 6 | Cierre | ✅ documentación completa |

### Lo que falta, y solo lo podés hacer vos

1. **Imprimir un vale en la GOOJPRT real.** El código está probado con PDFs y
   con 30 comprobaciones automáticas del ticket, pero **ningún papel salió de
   una impresora térmica todavía**. Los siete puntos a mirar están en
   `prototipo-impresion/README.md`.
2. **Instalar `release/SFIDA_Setup.exe` en una PC del almacén.** Acá se probó
   con **PATH limpio** —sin Node ni herramientas de desarrollo— y la app
   empaquetada abre la base y genera los vales correctamente. Es la
   verificación que faltó con la versión Qt, pero no reemplaza probarlo en la
   máquina de verdad.
