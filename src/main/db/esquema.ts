/* ---------------------------------------------------------------------------
 * Esquema de la base de datos — VERSIÓN 5.
 *
 * A partir de la v5 el esquema YA NO es igual al de la versión Python: se
 * agregaron columnas que la app vieja no entiende. Fue una decisión explícita,
 * porque varias cosas (fraccionar galones a litros, guardar el N° del
 * proveedor aparte) se resolvían torcidas sin tocar el esquema.
 *
 * CONSECUENCIA: la app de Python ya NO debe abrir esta base. `migraciones.ts`
 * se encarga de llevar una base v4 a v5 y deja constancia en `config`.
 *
 * Lo que NO cambió, y no se toca:
 *   - El stock nunca se guarda como columna: se calcula sumando ingresos,
 *     menos salidas, más ajustes.
 *   - El precio no vive en el artículo: vive en cada línea de la boleta.
 *   - Las fechas son TEXT ISO y se comparan como cadenas.
 *   - `creado_en` usa hora LOCAL, no UTC.
 * ------------------------------------------------------------------------- */

/** Versión del esquema. Se guarda en `config.esquema_version`. */
export const VERSION_ESQUEMA = 5;

/**
 * Las TABLAS, sin los índices.
 *
 * Va separado a propósito: al abrir una base v4 hay que crear las tablas que
 * falten, después migrar (que es lo que agrega `nro_proveedor`) y RECIÉN
 * después crear los índices. Si se corriera todo junto, el índice
 * `ix_ing_prov` fallaría con «no such column: nro_proveedor» y la base vieja
 * no abriría nunca. Ver `conectar()`.
 */
export const ESQUEMA_TABLAS = `
CREATE TABLE IF NOT EXISTS categorias (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre  TEXT NOT NULL UNIQUE
);

-- 'unidad' es la UNIDAD DE STOCK: la más chica en la que se maneja el
-- artículo (LEJÍA en L, no en GAL). Al comprar o repartir se elige otra
-- unidad de la misma familia y el sistema convierte. Ver nucleo/unidades.ts.
CREATE TABLE IF NOT EXISTS articulos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo        TEXT NOT NULL UNIQUE,
    nombre        TEXT NOT NULL,
    categoria_id  INTEGER REFERENCES categorias(id),
    unidad        TEXT NOT NULL DEFAULT 'UND',
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

-- Cabecera del INGRESO.
--   nro_documento : N° INTERNO, lo genera el sistema (I2026-0001). No editable.
--   nro_proveedor : el número de la boleta o factura del proveedor, tal como
--                   figura en el papel. Es el que NO se puede repetir para un
--                   mismo proveedor.
--
-- El «no se repite el número interno» se aplica con el índice único
-- «ux_ing_nrodoc» de más abajo, y NO con un UNIQUE dentro de la tabla: una
-- base v4 ya trae su propio UNIQUE(tipo_doc, nro_documento) y eso no se puede
-- cambiar con ALTER TABLE. Con el índice, la base nueva y la migrada terminan
-- con la MISMA regla.
CREATE TABLE IF NOT EXISTS ingresos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_doc      TEXT NOT NULL DEFAULT 'BOLETA',
    nro_documento TEXT NOT NULL,
    nro_proveedor TEXT NOT NULL DEFAULT '',
    fecha         TEXT NOT NULL,
    proveedor     TEXT DEFAULT '',
    observacion   TEXT DEFAULT '',
    creado_en     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 'cantidad' está SIEMPRE en la unidad de stock del artículo.
-- 'cantidad_origen' + 'unidad_origen' guardan lo que se digitó de verdad
-- («1 GAL»), para poder mostrarlo y auditarlo. Si están en NULL, es que la
-- línea se cargó directo en la unidad de stock.
CREATE TABLE IF NOT EXISTS ingreso_det (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ingreso_id      INTEGER NOT NULL REFERENCES ingresos(id) ON DELETE CASCADE,
    articulo_id     INTEGER NOT NULL REFERENCES articulos(id),
    cantidad        REAL NOT NULL CHECK (cantidad > 0),
    costo_unitario  REAL NOT NULL DEFAULT 0,
    cantidad_origen REAL,
    unidad_origen   TEXT
);

-- Cabecera de la SALIDA. 'nro_vale' lo genera el sistema y NO es editable.
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
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    salida_id       INTEGER NOT NULL REFERENCES salidas(id) ON DELETE CASCADE,
    articulo_id     INTEGER NOT NULL REFERENCES articulos(id),
    cantidad        REAL NOT NULL CHECK (cantidad > 0),
    cantidad_origen REAL,
    unidad_origen   TEXT
);

-- Ajustes de inventario (correcciones, mermas, conteo fisico)
CREATE TABLE IF NOT EXISTS ajustes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha       TEXT NOT NULL,
    articulo_id INTEGER NOT NULL REFERENCES articulos(id),
    cantidad    REAL NOT NULL,          -- positivo suma, negativo resta
    motivo      TEXT DEFAULT '',
    creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT
);

CREATE TABLE IF NOT EXISTS auditoria (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    momento TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    accion  TEXT NOT NULL,
    detalle TEXT DEFAULT ''
);

`;

/**
 * Los ÍNDICES. Se crean DESPUÉS de migrar, porque algunos se apoyan en
 * columnas que la v4 no tenía.
 */
export const ESQUEMA_INDICES = `
CREATE INDEX IF NOT EXISTS ix_ing_det_art ON ingreso_det(articulo_id);
CREATE INDEX IF NOT EXISTS ix_sal_det_art ON salida_det(articulo_id);
CREATE INDEX IF NOT EXISTS ix_sal_suc     ON salidas(sucursal_id);
-- Nuevos en la v5: casi todos los reportes filtran por fecha.
CREATE INDEX IF NOT EXISTS ix_ing_fecha   ON ingresos(fecha);
CREATE INDEX IF NOT EXISTS ix_sal_fecha   ON salidas(fecha);
CREATE INDEX IF NOT EXISTS ix_aju_fecha   ON ajustes(fecha);
-- Para no registrar dos veces la misma boleta del mismo proveedor.
CREATE INDEX IF NOT EXISTS ix_ing_prov    ON ingresos(proveedor, nro_proveedor);
-- El número interno del ingreso es único en toda la base, sin importar el
-- tipo de documento. Ver el comentario de la tabla «ingresos».
CREATE UNIQUE INDEX IF NOT EXISTS ux_ing_nrodoc ON ingresos(nro_documento);
`;

export const NOMBRE_BD = 'sfida_inventario.db';

export const CAT_OFICINA = 'ÚTILES DE OFICINA';
export const CAT_LIMPIEZA = 'ÚTILES DE LIMPIEZA';
export const CATEGORIAS_FIJAS = [CAT_OFICINA, CAT_LIMPIEZA] as const;
