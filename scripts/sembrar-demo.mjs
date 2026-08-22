/* ---------------------------------------------------------------------------
 * Crea `datos/sfida_demo.db` con datos de ejemplo, para las capturas y para
 * probar la app a mano con algo cargado.
 *
 * NO toca `datos/sfida_dev.db` ni la base real: escribe un archivo aparte.
 *
 * Uso:  node scripts/sembrar-demo.mjs
 * ------------------------------------------------------------------------- */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const carpeta = join(raiz, 'datos');
const ruta = join(carpeta, 'sfida_demo.db');

mkdirSync(carpeta, { recursive: true });
for (const extra of ['', '-journal', '-wal', '-shm']) {
  if (existsSync(ruta + extra)) rmSync(ruta + extra);
}

// El esquema se lee del fuente para no tener dos copias que se puedan
// desincronizar. `esquema.ts` es la única fuente de verdad.
const fuente = readFileSync(join(raiz, 'src', 'main', 'db', 'esquema.ts'), 'utf8');
// Van en dos constantes (tablas e índices) porque al migrar una base vieja hay
// que intercalar la migración entre las dos. Acá, base nueva, se corren juntas.
const partes = [...fuente.matchAll(/export const ESQUEMA_(?:TABLAS|INDICES) = `([\s\S]*?)`;/g)];
if (partes.length !== 2) {
  throw new Error('No se pudieron leer ESQUEMA_TABLAS y ESQUEMA_INDICES de src/main/db/esquema.ts');
}

const db = new Database(ruta);
db.pragma('foreign_keys = ON');
for (const p of partes) db.exec(p[1]);

const cat = db.prepare('INSERT INTO categorias(nombre) VALUES (?)');
const OFI = cat.run('ÚTILES DE OFICINA').lastInsertRowid;
const LIM = cat.run('ÚTILES DE LIMPIEZA').lastInsertRowid;

const art = db.prepare(
  'INSERT INTO articulos(codigo,nombre,categoria_id,unidad,stock_minimo) VALUES (?,?,?,?,?)',
);
const ARTICULOS = [
  ['OFI-0001', 'LAPICERO AZUL', OFI, 'UND', 50],
  ['OFI-0002', 'LAPICERO NEGRO', OFI, 'UND', 50],
  ['OFI-0004', 'LÁPIZ 2B', OFI, 'UND', 30],
  ['OFI-0005', 'BORRADOR BLANCO', OFI, 'UND', 20],
  ['OFI-0008', 'RESALTADOR', OFI, 'UND', 15],
  ['OFI-0010', 'PAPEL BOND A4 75GR', OFI, 'MLL', 5],
  ['OFI-0012', 'ARCHIVADOR DE PALANCA', OFI, 'UND', 10],
  ['OFI-0013', 'FÓLDER MANILA A4', OFI, 'CTO', 3],
  ['OFI-0014', 'GRAPAS 26/6', OFI, 'CJA', 10],
  ['LIM-0001', 'PAPEL HIGIÉNICO JUMBO', LIM, 'PQT', 20],
  // Desde la v5 los líquidos se llevan en LITROS, que es la unidad chica: se
  // compran por galón y se reparten por litro o por medio litro. El galón
  // sigue existiendo, pero como unidad de compra, no de stock.
  ['LIM-0003', 'JABÓN LÍQUIDO', LIM, 'L', 38],
  ['LIM-0004', 'DETERGENTE EN POLVO', LIM, 'KG', 10],
  ['LIM-0005', 'LEJÍA', LIM, 'L', 45],
  ['LIM-0008', 'BOLSA NEGRA GRANDE', LIM, 'PQT', 20],
  ['LIM-0010', 'ESCOBA', LIM, 'UND', 5],
  ['LIM-0015', 'GUANTES DE LIMPIEZA', LIM, 'PAR', 8],
];
const ids = {};
for (const a of ARTICULOS) ids[a[0]] = art.run(...a).lastInsertRowid;

const suc = db.prepare(
  'INSERT INTO sucursales(codigo,nombre,direccion,responsable) VALUES (?,?,?,?)',
);
const SUC = {
  SUC01: suc.run('SUC01', 'SEDE CENTRAL', 'AV. INDUSTRIAL 450 - LIMA', 'ANA QUISPE').lastInsertRowid,
  SUC02: suc.run('SUC02', 'TIENDA NORTE', 'JR. LOS OLIVOS 145', 'LUIS RAMOS').lastInsertRowid,
  SUC03: suc.run('SUC03', 'TIENDA SAN JUAN DE LURIGANCHO', 'AV. PROCERES DE LA INDEPENDENCIA 1845', 'MARIA FERNANDEZ').lastInsertRowid,
};

/** Fecha ISO de hace N días. */
function hace(n) {
  const d = new Date(Date.now() - n * 86400000);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ing = db.prepare(
  'INSERT INTO ingresos(tipo_doc,nro_documento,nro_proveedor,fecha,proveedor,observacion) VALUES (?,?,?,?,?,?)',
);
const ingDet = db.prepare(
  `INSERT INTO ingreso_det(ingreso_id,articulo_id,cantidad,costo_unitario,cantidad_origen,unidad_origen)
   VALUES (?,?,?,?,?,?)`,
);

const anio = new Date().getFullYear();
const GAL = 3.785;

// Cada línea: [código, cantidad, precio, unidad digitada?].
// Si viene una unidad distinta a la de stock, se guarda convertida y además se
// deja constancia de lo que se digitó — igual que hace `registrarIngreso()`.
const COMPRAS = [
  ['BOLETA', 'B001-4521', hace(150), 'DISTRIBUIDORA LIMA', [['OFI-0001', 500, 0.8], ['OFI-0002', 400, 0.8], ['OFI-0010', 20, 14.5]]],
  ['FACTURA', 'F001-0088', hace(95), 'COMERCIAL SUR', [['OFI-0010', 25, 16.0], ['LIM-0003', 40, 22.0, 'GAL'], ['LIM-0005', 60, 9.5, 'GAL']]],
  ['BOLETA', 'B001-4790', hace(60), 'DISTRIBUIDORA LIMA', [['OFI-0010', 30, 12.0], ['LIM-0001', 120, 18.0], ['LIM-0008', 200, 7.5]]],
  ['BOLETA', 'B002-0140', hace(32), 'IMPORTACIONES DEL NORTE', [['OFI-0004', 300, 0.6], ['OFI-0005', 150, 0.5], ['OFI-0008', 120, 2.2], ['LIM-0015', 60, 4.5]]],
  ['GUÍA', 'G001-0033', hace(12), 'COMERCIAL SUR', [['OFI-0012', 60, 8.9], ['OFI-0013', 25, 0], ['OFI-0014', 40, 3.2], ['LIM-0004', 80, 5.6], ['LIM-0010', 30, 11.0]]],
];
COMPRAS.forEach(([tipo, nroProv, fecha, prov, lineas], i) => {
  // El N° del sistema es correlativo; el del papel va aparte.
  const interno = `I${anio}-${String(i + 1).padStart(4, '0')}`;
  const id = ing.run(tipo, interno, nroProv, fecha, prov, '').lastInsertRowid;
  for (const [cod, cant, costo, unidad] of lineas) {
    if (unidad === 'GAL') {
      // El precio también se convierte: si el galón costaba 22, el litro sale
      // 22 / 3.785. Sin eso el almacén se valorizaría por 3.785 de más.
      ingDet.run(id, ids[cod], cant * GAL, costo / GAL, cant, 'GAL');
    } else {
      ingDet.run(id, ids[cod], cant, costo, null, null);
    }
  }
});

const sal = db.prepare(
  'INSERT INTO salidas(nro_vale,fecha,sucursal_id,entregado_por,recibido_por,observacion) VALUES (?,?,?,?,?,?)',
);
const salDet = db.prepare(
  `INSERT INTO salida_det(salida_id,articulo_id,cantidad,cantidad_origen,unidad_origen)
   VALUES (?,?,?,?,?)`,
);

// Acá se ve el caso que motivó el fraccionamiento: la LEJÍA entra por galones
// y sale por litros o por 500 ml, según lo que pida cada tienda.
const REPARTOS = [
  [`V${anio}-0001`, hace(88), 'SUC01', 'CARLOS RAMIREZ', 'ANA QUISPE', '', [['OFI-0001', 120], ['OFI-0010', 8], ['LIM-0001', 30]]],
  [`V${anio}-0002`, hace(70), 'SUC02', 'CARLOS RAMIREZ', 'LUIS RAMOS', '', [['OFI-0002', 90], ['LIM-0005', 25, 'L'], ['LIM-0008', 40]]],
  [`V${anio}-0003`, hace(45), 'SUC03', 'CARLOS RAMIREZ', 'MARIA FERNANDEZ', 'ENTREGA CORRESPONDIENTE A LA SEMANA 34', [['OFI-0001', 80], ['LIM-0003', 18, 'L'], ['LIM-0001', 25]]],
  [`V${anio}-0004`, hace(28), 'SUC01', 'CARLOS RAMIREZ', 'ANA QUISPE', '', [['OFI-0004', 100], ['OFI-0008', 40], ['LIM-0004', 20]]],
  [`V${anio}-0005`, hace(15), 'SUC02', 'CARLOS RAMIREZ', 'LUIS RAMOS', '', [['OFI-0005', 60], ['LIM-0015', 24], ['LIM-0010', 8], ['LIM-0005', 500, 'ML']]],
  [`V${anio}-0006`, hace(6), 'SUC03', 'CARLOS RAMIREZ', 'MARIA FERNANDEZ', 'REPOSICIÓN QUINCENAL', [['OFI-0010', 3], ['OFI-0012', 15], ['LIM-0003', 20, 'L'], ['LIM-0008', 60], ['OFI-0013', 2]]],
  [`V${anio}-0007`, hace(2), 'SUC01', 'CARLOS RAMIREZ', 'ANA QUISPE', '', [['OFI-0014', 12], ['LIM-0005', 15, 'GAL'], ['OFI-0002', 60]]],
  // Este vale grande deja a propósito tres artículos por debajo del mínimo,
  // para que las capturas muestren también el estado de alerta y no solo el
  // caso feliz.
  [`V${anio}-0008`, hace(1), 'SUC02', 'CARLOS RAMIREZ', 'LUIS RAMOS', 'PEDIDO EXTRAORDINARIO', [['OFI-0013', 21], ['LIM-0010', 18], ['OFI-0012', 38]]],
];
const FACTOR = { L: 1, ML: 0.001, GAL };
for (const [vale, fecha, cod, entrega, recibe, obs, lineas] of REPARTOS) {
  const id = sal.run(vale, fecha, SUC[cod], entrega, recibe, obs).lastInsertRowid;
  for (const [c, cant, unidad] of lineas) {
    if (unidad && unidad !== 'L') salDet.run(id, ids[c], cant * FACTOR[unidad], cant, unidad);
    else salDet.run(id, ids[c], cant, null, null);
  }
}

db.prepare('INSERT INTO ajustes(fecha,articulo_id,cantidad,motivo) VALUES (?,?,?,?)').run(
  hace(20), ids['LIM-0005'], -6, 'MERMA POR DERRAME',
);
db.prepare('INSERT INTO ajustes(fecha,articulo_id,cantidad,motivo) VALUES (?,?,?,?)').run(
  hace(9), ids['OFI-0005'], 12, 'INVENTARIO FÍSICO',
);

const cfg = db.prepare('INSERT INTO config(clave,valor) VALUES (?,?)');
cfg.run('empresa', 'SFIDA');
cfg.run('empresa_dir', 'AV. INDUSTRIAL 450 - LIMA');
cfg.run('empresa_ruc', '20512345678');
// La base nace en la v5. Sin esta marca, al abrirla la app creería que es una
// base vieja e intentaría migrarla: volvería a multiplicar por 3.785 lo que ya
// está en litros.
cfg.run('esquema_version', '5');

const aud = db.prepare('INSERT INTO auditoria(momento,accion,detalle) VALUES (?,?,?)');
for (const [n, accion, detalle] of [
  [40, 'INGRESO', 'BOLETA B001-4790 de DISTRIBUIDORA LIMA (3 articulos)'],
  [30, 'SALIDA', `Vale V${anio}-0004 a SEDE CENTRAL (3 articulos)`],
  [20, 'AJUSTE', 'LEJÍA: -6 (MERMA POR DERRAME)'],
  [12, 'INGRESO', 'GUÍA G001-0033 de COMERCIAL SUR (5 articulos)'],
  [9, 'AJUSTE', 'BORRADOR BLANCO: +12 (INVENTARIO FÍSICO)'],
  [6, 'SALIDA', `Vale V${anio}-0006 a TIENDA SAN JUAN DE LURIGANCHO (5 articulos)`],
  [5, 'ACCESO DENEGADO', 'clave incorrecta'],
  [5, 'CONTROL MAESTRO', 'acceso concedido'],
  [4, 'PRECIO CORREGIDO', 'PAPEL BOND A4 75GR en BOLETA B001-4790: antes S/ 13.00, ahora S/ 12.00'],
  [2, 'SALIDA', `Vale V${anio}-0007 a SEDE CENTRAL (3 articulos)`],
]) {
  aud.run(`${hace(n)} 09:${String(10 + n).padStart(2, '0')}:00`, accion, detalle);
}

db.close();
console.log('Base de demostración creada:', ruta);
console.log('  ' + ARTICULOS.length + ' artículos · 3 sucursales · ' + COMPRAS.length + ' compras · ' + REPARTOS.length + ' vales');
