# Prototipo de impresión térmica — FASE 0

Una ventana, sin base de datos, sin nada más. Lo único que prueba es la parte
que puede hacer fracasar la migración entera: **que el vale salga bien en la
GOOJPRT de 80 mm del almacén** (y en 58 mm y A4).

Si esto no sale bien contra la impresora real, la migración no tiene sentido y
hay que replantear antes de invertir semanas.

---

## Cómo correrlo

```bash
cd prototipo-impresion
npm install
npm start          # abre la ventana
npm run verificar  # sin ventana: genera los PDF y PNG de los 3 formatos
```

> **Si `npm install` no descarga Electron.** npm 11 bloquea los scripts de
> instalación de los paquetes. Si al arrancar dice que falta `electron.exe`:
> ```bash
> node node_modules/electron/install.js
> ```

---

## Qué hay que mirar en el papel de verdad

Marcá la casilla **«Imprimir una regla de columnas»** antes de imprimir. Arriba
del vale salen los números `0123456789…` repetidos hasta completar las columnas
del papel y una flecha `<--->` del mismo ancho.

| # | Qué comprobar | Si sale mal |
|---|---|---|
| 1 | **La regla entra justa y no se corta.** 42 caracteres en 80 mm, 30 en 58 mm. | El ancho útil o el tamaño de letra están mal. |
| 2 | **Las columnas quedan derechas.** El nombre del artículo y su código, abajo, arrancan en la misma columna. | Se rompió `SANGRIA_ITEM`. |
| 3 | **Las letras no salen achatadas ni estiradas.** | Es el bug 2 de la versión Qt (proporción de la página). |
| 4 | **No bota papel de más al final.** Después de las 3 líneas en blanco tiene que cortar. | El alto calculado de la hoja está mal. |
| 5 | **Las dos firmas caben lado a lado en 80 mm** y **una debajo de la otra en 58 mm**. | Se rompió `_bloque_firmas`. |
| 6 | **Salen las 2 copias.** | El `copies` no llegó al driver. |
| 7 | **Las tildes y la Ñ salen bien.** | Problema de codificación del driver. |

Probá **los dos modos de margen** (el selector «Quién aplica el margen de
3 mm») y quedate con el que salga derecho:

- **Sin margen del driver** — `@page { margin: 0 }` + `margins: {marginType:
  'none'}` y el 3 mm lo pone el relleno del documento. Es lo que suele
  necesitar el driver térmico para no agregar márgenes propios. **Empezá por
  este.**
- **Margen por @page** — `@page { margin: 3mm }` y Electron no toca los
  márgenes.

---

## Por qué Electron 43.2.0 y no la más nueva

`"electron": "43.2.0"` **exacta, sin `^`.**

Es la versión que ya corre en producción en las otras dos apps de almacén, en
la misma PC de **Windows 10 build 14393** que originó toda la migración. Está
probada en las máquinas reales; la última del registro (43.4.1 al momento de
escribir esto) no. En una app que se reparte a PC viejas que no controlamos,
«funciona en las máquinas de verdad» vale más que «es la más nueva».

Va sin `^` a propósito: con el cursor, un `npm install` en otra PC podría traer
una versión distinta de la probada sin que nadie se entere.

Lo mismo con `electron-builder 26.15.3` en la fase 5.

---

## Qué comprobé yo antes de pasártelo

Corrido con `npm run verificar` en esta PC, con **Electron 43.2.0**:

| Formato | Ancho útil | Columnas | Letra medida | Alto de la hoja | Línea más larga |
|---|---|---|---|---|---|
| 80 mm | 74,00 mm | 42 | 9,07 pt | 184,20 mm | 42 de 42 ✓ |
| 58 mm | 52,00 mm | 30 | 8,92 pt | 221,37 mm | 30 de 30 ✓ |
| A4 | 186,00 mm | 80 | 11,99 pt | 157,04 mm | — |

### Qué cambió al pasar de Electron 32 a 43

| | Electron 32 | Electron 43 |
|---|---|---|
| Columnas 80 mm / 58 mm | 42 / 30 | **42 / 30** (igual) |
| Letra medida | 9,07 / 8,92 / 11,99 pt | **igual** |
| Líneas del ticket | 49 / 60 | **igual** |
| Equivalencias y totales | 3 MLL = 3000 UND · 5 GAL = 18,93 L · 2 CTO = 200 UND · 48,50 | **igual** |
| Alto de la hoja 80 mm | 184,00 mm | 184,20 mm (**+0,20 mm**) |
| Alto de la hoja 58 mm | 221,13 mm | 221,37 mm (**+0,24 mm**) |
| Alto de la hoja A4 | 156,95 mm | 157,04 mm (+0,09 mm) |

**Lo que importa no cambió.** El contenido del ticket lo arma `ticket.js`, que
es JavaScript puro y da exactamente lo mismo en cualquier versión: mismas
columnas, mismas cuentas, mismo texto.

La diferencia de **dos décimas de milímetro** en el alto viene del motor de
Chromium, que redondea el interlineado distinto entre versiones. Es una
milésima parte del ticket y en rollo continuo no se nota. **Pero deja una
lección: el alto de la hoja no es un número estable entre versiones de
Electron. Nunca hay que escribirlo a mano en el código — hay que medirlo en
cada impresión, que es lo que ya hace el prototipo.**

Los PDF y las capturas quedan en `salida/`. Revisadas a mano: la regla entra
exacta, las sangrías quedan alineadas, las equivalencias se calculan bien
(5 GAL = 18,93 L · 3 MLL = 3000 UND · 2 CTO = 200 UND), los totales dan
(6 artículos, 48,50 unidades), las firmas van lado a lado en 80 mm y apiladas
en 58 mm, y el A4 sale con la tabla de encabezado azul como en la versión Qt.

**Lo que NO puedo comprobar yo: cómo se comporta el driver de la GOOJPRT.**
Acá solo hay «Microsoft Print to PDF», «Microsoft XPS Document Writer» y una
EPSON L4160. Eso es lo que tenés que probar vos.

---

## Cómo está armado

| Archivo | Qué hace |
|---|---|
| `main.js` | Proceso principal: lista impresoras, arma la ventana oculta del vale, imprime y guarda PDF. |
| `preload.js` | Puente IPC. `contextIsolation: true`, `nodeIntegration: false`. |
| `renderer/index.html` | La interfaz: selector de impresora, papel, copias, vista previa a escala real y registro de lo que se le mandó al driver. |
| `print.html` | **El documento que se imprime.** Se carga en una ventana oculta aparte. |
| `ticket.js` | Armado del vale en texto monoespaciado. Port fiel de `sfida_impresion.py`. |
| `vale-ejemplo.js` | Datos de ejemplo, elegidos para hacer sufrir al armado. |

**El vale se imprime desde una ventana oculta, nunca desde la ventana de la
interfaz.** Si se imprimiera el renderer principal saldrían los botones y el
selector de impresora en el papel.

---

## Trampas encontradas (ya resueltas, anotadas para la fase 4)

1. **`webContents.print()` mide en MICRONES; `webContents.printToPDF()` mide en
   PULGADAS.** Los 80 mm son `80000` en uno y `3.1496` en el otro. Si se
   confunden, el resultado sale con un tamaño absurdo y el error no lo dice.

2. **`silent: true` necesita `deviceName` explícito.**

3. **`margins: { marginType: 'none' }`** es lo que evita que el driver térmico
   agregue márgenes propios.

4. **NO usar `document.documentElement.scrollHeight` para medir el alto del
   vale.** Devuelve el máximo entre el contenido y el viewport, así que con la
   ventana oculta de 1200 px de alto **todos los vales daban el mismo alto**
   (255,85 mm) sin importar cuántas líneas tuvieran. En rollo continuo eso es
   botar papel de más en cada ticket. Hay que medir el elemento:
   `document.getElementById('hoja').getBoundingClientRect().height`.
   *(Encontrado porque 80 mm con 49 líneas y 58 mm con 60 líneas daban el mismo
   número. Los números que dan igual cuando no deberían son la única pista.)*

5. **Si se destruye la última `BrowserWindow`, Electron cierra la app.** Como
   el vale se arma en una ventana oculta, al destruirla sin otra ventana viva
   el proceso se va y **la siguiente carga falla con `ERR_FAILED (-2)`**. El
   error habla del archivo y no tiene nada que ver con el archivo. En la app
   normal no pasa porque la ventana principal siempre está abierta; en el modo
   `--verificar` se mantiene una ventana ancla.

6. **Hay que esperar `document.fonts.ready` antes de medir.** Si se mide con la
   fuente de reserva, el alto sale mal.

7. **El tamaño de letra se mide, no se fija.** Es la misma lección que en Qt,
   pero acá alcanza con medir una línea de N caracteres contra el ancho útil:
   no hace falta iterar 40 veces. Se compara siempre contra el ancho **real**
   medido, no contra un objetivo teórico.

8. **npm 11 bloquea el postinstall de Electron** (ver arriba).

9. **`capturePage()` puede fallar con `UnknownVizError` en el primer arranque
   en frío** (visto con Electron 43, justo después de reinstalar). Es un
   tropiezo del compositor de Chromium y es **intermitente**: dos corridas
   seguidas después pasaron sin problema. No participa de la impresión — solo
   se usa para las fotos de verificación — así que ahora reintenta una vez y,
   si falla igual, avisa pero **no cuenta como problema del vale**. Un fallo
   de la herramienta de diagnóstico no puede hacerse pasar por un fallo del
   producto.

10. **El alto de la hoja cambia entre versiones de Electron** (0,2 mm entre la
    32 y la 43). Nunca fijarlo como constante en el código: hay que medirlo en
    cada impresión.

---

## Llevarlo al almacén

Las PC del almacén no tienen Node ni npm, así que allá no se puede correr
`npm start`. Para eso está:

```powershell
powershell -ExecutionPolicy Bypass -File empaquetar.ps1
```

Deja `paquete\SFIDA-Prueba-Impresion\` (265 MB): se copia **entera** a una USB
y se abre con doble clic en `SFIDA-Prueba-Impresion.exe`. Adentro va un
`LEAME.txt` en criollo con los 7 puntos a mirar.

**El `.exe` solo no funciona**, igual que en la versión Qt: necesita la carpeta
que lo rodea. Ya lo probé: el paquete da los mismos resultados que
`npm run verificar`.

---

## Lo que este prototipo NO prueba

- La base de datos (fase 1) y la lógica de negocio (fase 2).
- **Cómo se comporta el driver de la GOOJPRT real.** Acá solo hay «Microsoft
  Print to PDF», «Microsoft XPS Document Writer» y una EPSON L4160.
- **Si Electron arranca en la PC de Windows 10 build 14393.** Ver abajo.

### El segundo riesgo grande, sin resolver

Electron dice soportar «Windows 10 y superior» **sin fijar un número de build**
(Electron 22 fue la última que soportó Windows 7/8.1). Windows 10 1607 /
build 14393 **es** Windows 10, así que Electron 32 *debería* arrancar ahí —
a diferencia de Qt 6, que sí exige explícitamente la build 17763.

**Pero «debería» no alcanza**, porque esa PC es justamente el motivo de toda la
migración. No pude verificarlo desde acá y la documentación no baja al nivel de
build.

**Aprovechá el mismo viaje**: llevá la carpeta portable a esa PC y fijate si
abre. Son dos minutos y decide el proyecto entero.

- **Si abre** → la migración resuelve el problema original. Seguimos.
- **Si no abre** → hay que probar bajando de versión de Electron antes de
  escribir nada más. Ojo: las versiones viejas de Electron no reciben parches
  de seguridad, así que esa decisión tiene su costo y conviene tomarla con el
  dato en la mano, no antes.
