# ---------------------------------------------------------------------------
# Arma una version PORTABLE del prototipo para llevarla al almacen.
#
# Por que hace falta: la impresora GOOJPRT esta en el almacen y esas PC no
# tienen Node ni npm, asi que `npm start` no se puede correr alla. Esto deja
# una carpeta que se copia en una USB y se abre con doble clic.
#
# No usa electron-builder a proposito: para la fase 0 alcanza con copiar el
# runtime de Electron y meter la app adentro. El instalador de verdad (NSIS)
# es la fase 5.
#
# Uso:   powershell -ExecutionPolicy Bypass -File empaquetar.ps1
# ---------------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $aqui 'node_modules\electron\dist'
$destino = Join-Path $aqui 'paquete\SFIDA-Prueba-Impresion'

if (-not (Test-Path $dist)) {
    Write-Error "No esta el runtime de Electron. Corre primero:  npm install  y si hace falta  node node_modules/electron/install.js"
}

Write-Host "Limpiando..." -ForegroundColor Cyan
if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
New-Item -ItemType Directory -Force -Path $destino | Out-Null

Write-Host "Copiando el runtime de Electron (~265 MB, tarda un poco)..." -ForegroundColor Cyan
Copy-Item "$dist\*" $destino -Recurse -Force

Write-Host "Metiendo la aplicacion..." -ForegroundColor Cyan
$app = Join-Path $destino 'resources\app'
New-Item -ItemType Directory -Force -Path $app | Out-Null
foreach ($archivo in @('main.js', 'preload.js', 'print.html', 'ticket.js', 'vale-ejemplo.js', 'package.json')) {
    Copy-Item (Join-Path $aqui $archivo) $app -Force
}
Copy-Item (Join-Path $aqui 'renderer') $app -Recurse -Force

# El .exe tiene que llamarse distinto de "electron.exe" para que se reconozca
# en la barra de tareas del almacen.
Rename-Item (Join-Path $destino 'electron.exe') 'SFIDA-Prueba-Impresion.exe'

# Un LEAME para quien lo abra alla
$leame = @'
SFIDA - Prueba de impresion (no es el programa nuevo todavia)
=============================================================

Esto NO reemplaza a SFIDA. No toca la base de datos ni los datos del almacen.
Es solo una prueba para ver si la impresora de tickets funciona bien.

COMO USARLO
-----------
1. Doble clic en SFIDA-Prueba-Impresion.exe
2. Arriba a la izquierda, elegir la impresora de tickets (GOOJPRT).
3. Dejar el papel en "80 mm".
4. Marcar la casilla "Imprimir una regla de columnas".
5. Boton verde "Imprimir ahora".

QUE HAY QUE MIRAR EN EL PAPEL
-----------------------------
1. Arriba sale una fila de numeros (0123456789...) y una flecha <--->.
   Tienen que entrar justos en el ancho del papel, sin cortarse.
2. El nombre de cada articulo y su codigo, abajo, tienen que arrancar en la
   misma columna (todo derechito).
3. Las letras no tienen que verse achatadas ni estiradas.
4. Al terminar no tiene que botar un monton de papel en blanco.
5. Las dos firmas tienen que entrar una al lado de la otra.
6. Tienen que salir 2 copias.
7. Las tildes y la N con virgulilla tienen que salir bien.

SI ALGO SALE MAL
----------------
Arriba a la derecha, cambiar "Sin margen del driver" por "Margen por @page"
y volver a imprimir. Guardar los dos tickets para comparar.

Si el texto se corta por los costados, probar con el papel de 58 mm.

IMPORTANTE
----------
Guardar los tickets impresos (no tirarlos) y anotar en cada uno que opcion se
uso. Es lo que sirve para decidir si seguimos con el programa nuevo.
'@
Set-Content -Path (Join-Path $destino 'LEAME.txt') -Value $leame -Encoding UTF8

$tam = [math]::Round(((Get-ChildItem $destino -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 0)
Write-Host ""
Write-Host "Listo: $destino  ($tam MB)" -ForegroundColor Green
Write-Host "Copia esa carpeta ENTERA a una USB. El .exe solo no funciona." -ForegroundColor Yellow
