/* ---------------------------------------------------------------------------
 * SFIDA - Armado del vale de salida en texto monoespaciado.
 *
 * Port fiel de `sfida_impresion.py` del proyecto Python. Lo cargan tanto la
 * ventana de la interfaz (para la vista previa) como la ventana oculta que se
 * manda a la impresora, asi que NO puede usar nada de Node: solo texto.
 *
 * Las constantes de columnas son las mismas de la version Qt y no se escriben
 * a mano en ningun otro lado: si el ancho del nombre y la sangria de las
 * lineas de abajo no salen los dos de SANGRIA_ITEM, el ticket sale con las
 * columnas corridas.
 * ------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  // Cuantos caracteres entran a lo ancho en cada papel
  const COLUMNAS = { 80: 42, 58: 30, 210: 80 };

  // Columnas del detalle: cantidad (5) + espacio + unidad (5) + espacio.
  // El nombre del articulo arranca en la columna 12 y las lineas de abajo
  // (nombre partido, codigo, equivalencia) tienen que arrancar en la MISMA.
  const ANCHO_CANT = 5;
  const ANCHO_UND = 5;
  const SANGRIA_ITEM = ANCHO_CANT + 1 + ANCHO_UND + 1;   // = 12

  // Ancho de la columna de los rotulos de la cabecera («N° VALE :»).
  const SANGRIA_CAMPO = 10;

  // Margen del papel, por lado, en milimetros
  function margen(anchoMm) {
    return anchoMm < 200 ? 3.0 : 12.0;
  }

  // ------------------------------------------------------------- unidades
  // (codigo, nombre, familia, factor). Mismo catalogo que sc.UNIDADES.
  const UNIDADES = [
    ['UND', 'Unidad', 'CONTEO', 1.0],
    ['PAR', 'Par', 'CONTEO', 2.0],
    ['DOC', 'Docena', 'CONTEO', 12.0],
    ['CTO', 'Ciento', 'CONTEO', 100.0],
    ['MLL', 'Millar', 'CONTEO', 1000.0],
    ['CJA', 'Caja', 'CONTEO', 1.0],
    ['PQT', 'Paquete', 'CONTEO', 1.0],
    ['BOL', 'Bolsa', 'CONTEO', 1.0],
    ['JGO', 'Juego', 'CONTEO', 1.0],
    ['ROL', 'Rollo', 'CONTEO', 1.0],
    ['BLQ', 'Blister', 'CONTEO', 1.0],
    ['ML', 'Mililitro', 'VOLUMEN', 0.001],
    ['L', 'Litro', 'VOLUMEN', 1.0],
    ['GAL', 'Galon', 'VOLUMEN', 3.785],
    ['BD5', 'Bidon de 5 litros', 'VOLUMEN', 5.0],
    ['BD20', 'Bidon de 20 litros', 'VOLUMEN', 20.0],
    ['GR', 'Gramo', 'PESO', 0.001],
    ['KG', 'Kilogramo', 'PESO', 1.0],
    ['SAC', 'Saco de 50 kilos', 'PESO', 50.0],
    ['MM', 'Milimetro', 'LARGO', 0.001],
    ['CM', 'Centimetro', 'LARGO', 0.01],
    ['M', 'Metro', 'LARGO', 1.0],
  ];

  const BASE_FAMILIA = { CONTEO: 'UND', VOLUMEN: 'L', PESO: 'KG', LARGO: 'M' };

  const _UNI = {};
  for (const [codigo, nombre, familia, factor] of UNIDADES) {
    _UNI[codigo] = { codigo, nombre, familia, factor };
  }

  function infoUnidad(codigo) {
    return _UNI[String(codigo || '').toUpperCase()] || _UNI.UND;
  }

  function equivalenciaUnidad(codigo) {
    const u = infoUnidad(codigo);
    const base = BASE_FAMILIA[u.familia];
    if (u.codigo === base || u.factor === 1.0) return '';
    const f = u.factor;
    const txt = Math.abs(f - Math.round(f)) < 0.0005
      ? String(Math.round(f))
      : f.toFixed(3).replace(/0+$/, '');
    return '1 ' + u.codigo + ' = ' + txt + ' ' + base;
  }

  function convertirABase(cantidad, codigo) {
    const u = infoUnidad(codigo);
    return [Number(cantidad || 0) * u.factor, BASE_FAMILIA[u.familia]];
  }

  // -------------------------------------------------------------- formato
  function fmtNum(v) {
    v = Number(v || 0);
    return Math.abs(v - Math.trunc(v)) < 0.0001 ? String(Math.trunc(v)) : v.toFixed(2);
  }

  function dmy(iso) {
    const p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso);
  }

  function rjust(s, n) { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }
  function ljust(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

  // Igual que str.center() de Python, incluido su reparto impar del sobrante.
  function center(s, ancho) {
    s = String(s);
    const marg = ancho - s.length;
    if (marg <= 0) return s;
    const izq = Math.floor(marg / 2) + (marg & ancho & 1);
    return ' '.repeat(izq) + s + ' '.repeat(marg - izq);
  }

  function rstrip(s) { return String(s).replace(/\s+$/, ''); }

  /** Parte un texto largo en varias lineas de ese ancho, sin cortar palabras. */
  function cortar(texto, ancho) {
    const palabras = String(texto || '').split(/\s+/).filter(Boolean);
    const lineas = [];
    let actual = '';
    for (let p of palabras) {
      if (p.length > ancho) {                       // palabra larguisima
        if (actual) { lineas.push(actual); actual = ''; }
        while (p.length > ancho) { lineas.push(p.slice(0, ancho)); p = p.slice(ancho); }
      }
      if (!actual) actual = p;
      else if (actual.length + 1 + p.length <= ancho) actual += ' ' + p;
      else { lineas.push(actual); actual = p; }
    }
    if (actual) lineas.push(actual);
    return lineas.length ? lineas : [''];
  }

  /** Red de seguridad: ninguna linea puede pasarse del ancho del papel. */
  function limitar(lineas, cols) {
    const salida = [];
    for (const l of lineas) {
      if (l.length <= cols) salida.push(l);
      else salida.push(...cortar(l, cols));
    }
    return salida;
  }

  function centrado(texto, cols) {
    return cortar(texto, cols).filter(Boolean).map((l) => rstrip(center(l, cols)));
  }

  /** Una linea «ROTULO : valor» de la cabecera, sangrando la continuacion. */
  function campo(rotulo, valor, cols) {
    const ancho = Math.max(8, cols - SANGRIA_CAMPO);
    return cortar(valor, ancho).map((l, i) =>
      rstrip(ljust(i === 0 ? rotulo : '', SANGRIA_CAMPO) + l));
  }

  /** Las dos firmas. En papel angosto van una debajo de la otra. */
  function bloqueFirmas(cols) {
    const raya = '_'.repeat(Math.max(10, cols - 10));
    if (cols >= 38) {
      const media = Math.floor(cols / 2);
      const anchoRaya = Math.max(8, media - 4);
      return ['', '', '',
        center('_'.repeat(anchoRaya), media) + center('_'.repeat(anchoRaya), media),
        center('ENTREGUE CONFORME', media) + center('RECIBI CONFORME', media)];
    }
    return ['', '', '',
      rstrip(center(raya, cols)),
      rstrip(center('ENTREGUE CONFORME', cols)),
      '', '',
      rstrip(center(raya, cols)),
      rstrip(center('RECIBI CONFORME', cols))];
  }

  // ---------------------------------------------------------------- vale
  /**
   * Devuelve el texto plano del ticket (80 o 58 mm).
   * `vale` = { nro_vale, fecha, suc_codigo, sucursal, direccion, entregado_por,
   *            recibido_por, observacion, empresa, empresa_dir, empresa_ruc,
   *            items: [{codigo, nombre, cantidad, unidad}] }
   */
  function textoTicket(vale, anchoMm) {
    const cols = COLUMNAS[anchoMm] || 42;
    const linea = '-'.repeat(cols);
    const doble = '='.repeat(cols);
    const anNom = Math.max(8, cols - SANGRIA_ITEM);

    const cuerpo = [];
    let totalItems = 0;
    let totalUnd = 0;
    for (const d of vale.items) {
      const u = infoUnidad(d.unidad);
      const cant = fmtNum(d.cantidad);
      totalItems += 1;
      totalUnd += Number(d.cantidad);
      const partes = cortar(d.nombre, anNom);
      cuerpo.push(rjust(cant.slice(0, ANCHO_CANT), ANCHO_CANT) + ' ' +
        ljust(u.codigo.slice(0, ANCHO_UND), ANCHO_UND) + ' ' + partes[0]);
      for (const extra of partes.slice(1)) {
        cuerpo.push(' '.repeat(SANGRIA_ITEM) + extra);
      }
      // equivalencia (2 GAL = 7.57 L) y codigo, en la linea de abajo
      let pie = d.codigo;
      if (equivalenciaUnidad(u.codigo)) {
        const [valor, base] = convertirABase(d.cantidad, u.codigo);
        pie += '  =  ' + fmtNum(valor) + ' ' + base;
      }
      for (const l of cortar(pie, anNom)) {
        cuerpo.push(' '.repeat(SANGRIA_ITEM) + l);
      }
    }

    const cabecera = ['VALE DE SALIDA DE ALMACEN', linea];
    cabecera.push(...campo('N° VALE :', vale.nro_vale, cols));
    cabecera.push(...campo('FECHA   :', dmy(vale.fecha), cols));
    cabecera.push(...campo('DESTINO :', vale.suc_codigo + ' - ' + vale.sucursal, cols));
    if (vale.direccion) cabecera.push(...campo('DIRECC. :', vale.direccion, cols));
    cabecera.push(...campo('ENTREGA :', vale.entregado_por || '-', cols));
    cabecera.push(...campo('RECIBE  :', vale.recibido_por || '-', cols));
    if (vale.observacion) cabecera.push(...campo('OBSERV. :', vale.observacion, cols));

    const encabezadoTabla = [
      rjust('CANT', ANCHO_CANT) + ' ' + ljust('UND', ANCHO_UND) + ' ' + 'ARTICULO',
    ];

    const pie = [
      linea,
      ljust('TOTAL DE ARTICULOS:', cols - 8) + rjust(String(totalItems), 8),
      ljust('TOTAL DE UNIDADES:', cols - 8) + rjust(fmtNum(totalUnd), 8),
      doble,
    ];

    const empresa = String(vale.empresa || 'SFIDA').toUpperCase();
    let membrete = centrado(empresa, cols);
    if (vale.empresa_dir) membrete = membrete.concat(centrado(String(vale.empresa_dir).toUpperCase(), cols));
    if (vale.empresa_ruc) membrete = membrete.concat(centrado('RUC ' + vale.empresa_ruc, cols));

    const ahora = vale.impreso_el || '';

    const lineas = []
      .concat(membrete, [linea], cabecera, [linea],
        encabezadoTabla, [linea], cuerpo, pie,
        bloqueFirmas(cols), [''],
        centrado('Impreso el ' + ahora, cols),
        centrado('SFIDA - Control de Utiles', cols),
        ['', '', '']);

    return limitar(lineas, cols).join('\n');
  }

  const API = {
    COLUMNAS, ANCHO_CANT, ANCHO_UND, SANGRIA_ITEM, SANGRIA_CAMPO,
    UNIDADES, BASE_FAMILIA,
    margen, infoUnidad, equivalenciaUnidad, convertirABase,
    fmtNum, dmy, center, cortar, limitar, centrado, campo, bloqueFirmas,
    textoTicket,
  };

  global.SfidaTicket = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
