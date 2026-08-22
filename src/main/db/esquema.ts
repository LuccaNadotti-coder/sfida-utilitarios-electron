/* ---------------------------------------------------------------------------
 * Esquema de la base de datos.
 *
 * COPIA LITERAL de la constante ESQUEMA de `sfida_core.py` (líneas 100-193 del
 * proyecto Python). Las dos aplicaciones abren EL MISMO archivo .db, así que
 * los nombres de tabla, columna e índice tienen que coincidir exactamente.
 *
 * NO "mejorar" nada acá durante el port. Lo que parezca mejorable ya está
 * anotado en la sección 8 de MIGRACION_INVENTARIO.md para discutirlo después.
 *
 * Detalles que se rompen fácil y hay que respetar:
 *   - Las fechas son TEXT en ISO (AAAA-MM-DD) y se comparan como cadenas.
 *   - `creado_en` / `momento` usan datetime('now','localtime'): hora LOCAL,
 *     no UTC.
 *   - `activo` es INTEGER 0/1, no booleano.
 *   - NO hay columna `stock` en articulos: el stock se calcula sumando
 *     ingresos − salidas + ajustes. Agregarla rompería el kardex.
 *   - NO hay columna `precio` en articulos: el precio vive en
 *     ingreso_det.costo_unitario, porque cada compra puede tener otro precio.
 * ------------------------------------------------------------------------- */

export const ESQUEMA = `
CREATE TABLE IF NOT EXISTS categorias (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS articulos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo        TEXT NOT NULL UNIQUE,
    nombre        TEXT NOT NULL,
    categoria_id  INTEGER REFERENCES categorias(id),
    unidad        TEXT NOT NULL DEFAULT 'UNIDAD',
    stock_minimo  REAL NOT NULL DEFAULT 0,
    activo        INTEGER NOT NULL DEFAULT 1,
    creado_en     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sucursales (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo       TEXT NOT NULL UNIQUE,
    nombre       TEXT NOT NULL,
    direccion    TEXT DEFAULT '',
    responsable  TEXT DEFAULT '',
    activo       INTEGER NOT NULL DEFAULT 1,
    creado_en    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Cabecera del INGRESO (la boleta / factura de compra)
CREATE TABLE IF NOT EXISTS ingresos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_doc      TEXT NOT NULL DEFAULT 'BOLETA',
    nro_documento TEXT NOT NULL,
    fecha         TEXT NOT NULL,
    proveedor     TEXT DEFAULT '',
    observacion   TEXT DEFAULT '',
    creado_en     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE (tipo_doc, nro_documento)
);

CREATE TABLE IF NOT EXISTS ingreso_det (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ingreso_id     INTEGER NOT NULL REFERENCES ingresos(id) ON DELETE CASCADE,
    articulo_id    INTEGER NOT NULL REFERENCES articulos(id),
    cantidad       REAL NOT NULL CHECK (cantidad > 0),
    costo_unitario REAL NOT NULL DEFAULT 0
);

-- Cabecera de la SALIDA (el vale de reparto a una sucursal)
CREATE TABLE IF NOT EXISTS salidas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nro_vale      TEXT NOT NULL UNIQUE,
    fecha         TEXT NOT NULL,
    sucursal_id   INTEGER NOT NULL REFERENCES sucursales(id),
    entregado_por TEXT DEFAULT '',
    recibido_por  TEXT DEFAULT '',
    observacion   TEXT DEFAULT '',
    creado_en     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS salida_det (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    salida_id   INTEGER NOT NULL REFERENCES salidas(id) ON DELETE CASCADE,
    articulo_id INTEGER NOT NULL REFERENCES articulos(id),
    cantidad    REAL NOT NULL CHECK (cantidad > 0)
);

-- Ajustes de inventario (correcciones, mermas, inventario fisico)
CREATE TABLE IF NOT EXISTS ajustes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha       TEXT NOT NULL,
    articulo_id INTEGER NOT NULL REFERENCES articulos(id),
    cantidad    REAL NOT NULL,          -- positivo suma, negativo resta
    motivo      TEXT DEFAULT '',
    creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Configuracion general (incluye la clave del Control Maestro)
CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT
);

-- Registro de auditoria: que se hizo y cuando
CREATE TABLE IF NOT EXISTS auditoria (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    momento TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    accion  TEXT NOT NULL,
    detalle TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_ing_det_art ON ingreso_det(articulo_id);
CREATE INDEX IF NOT EXISTS ix_sal_det_art ON salida_det(articulo_id);
CREATE INDEX IF NOT EXISTS ix_sal_suc     ON salidas(sucursal_id);
`;

/** Nombre del archivo, igual que `sc.NOMBRE_BD`. */
export const NOMBRE_BD = 'sfida_inventario.db';

/**
 * Las dos categorías fijas. Van acá porque `_datos_iniciales()` las inserta al
 * crear la base. El resto de la lógica de categorías es de la fase 2.
 */
export const CAT_OFICINA = 'ÚTILES DE OFICINA';
export const CAT_LIMPIEZA = 'ÚTILES DE LIMPIEZA';
export const CATEGORIAS_FIJAS = [CAT_OFICINA, CAT_LIMPIEZA] as const;
