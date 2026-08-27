/* ---------------------------------------------------------------------------
 * Verificación de la impresión: genera los PDF de los tres formatos desde un
 * vale REAL de la base y comprueba las medidas.
 *
 * Se activa con SFIDA_VERIFICAR_IMPRESION=<carpeta>. No abre ninguna ventana
 * visible ni manda nada a una impresora.
 *
 * Lo que comprueba solo:
 *   - que ninguna línea del ticket se pase del ancho del papel
 *   - que el alto de la hoja cambie según el contenido (si no, el rollo
 *     botaría papel de más en cada ticket)
 *   - que las firmas vayan lado a lado en 80 mm y apiladas en 58 mm
 *   - que las equivalencias se calculen
 * ------------------------------------------------------------------------- */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { app, BrowserWindow } from 'electron';
import type { Database } from 'better-sqlite3';

import type { AnchoPapel } from '../../compartido/contrato';
import { getConfig } from '../nucleo/config';
import {
  cabeceraIngreso,
  cabeceraSalida,
  detalleIngreso,
  detalleSalida,
  listarIngresos,
  listarSalidas,
} from '../nucleo/movimientos';
import { capturarVale, medirMargenesLaterales, pdfVale, vistaPrevia } from './imprimir';
import {
  COLUMNAS,
  textoTicket,
  textoTicketIngreso,
  type DatosTicketIngreso,
  type DatosVale,
} from './ticket';

export function verificacionImpresionActiva(): boolean {
  return Boolean((process.env.SFIDA_VERIFICAR_IMPRESION || '').trim());
}

export async function verificarImpresion(db: Database): Promise<void> {
  const carpeta = (process.env.SFIDA_VERIFICAR_IMPRESION || '').trim();
  mkdirSync(carpeta, { recursive: true });

  // Ventana ancla: sin una ventana viva, al destruir la del vale Electron
  // cerraría la app y el siguiente formato fallaría con ERR_FAILED (-2).
  const ancla = new BrowserWindow({ show: false });
  await ancla.loadURL('data:text/html,<title>ancla</title>');

  console.log('\n=== SFIDA · verificación de impresión ===\n');

  // Se elige el vale con más líneas: es el que más chances tiene de romper algo.
  const vales = listarSalidas(db);
  if (vales.length === 0) {
    console.log('No hay vales en la base. Corré antes: node scripts/sembrar-demo.mjs');
    ancla.destroy();
    app.quit();
    process.exitCode = 1;
    return;
  }
  const elegido = [...vales].sort((a, b) => b.items - a.items)[0]!;
  console.log(`Vale de prueba: ${elegido.nro_vale} · ${elegido.sucursal} · ${elegido.items} líneas\n`);

  const cab = cabeceraSalida(db, elegido.id)!;
  const vale: DatosVale = {
    cab: { ...cab, items: 0, unidades: 0 },
    det: detalleSalida(db, elegido.id),
    empresa: getConfig(db, 'empresa', 'SFIDA') ?? 'SFIDA',
    empresaDir: getConfig(db, 'empresa_dir', '') ?? '',
    empresaRuc: getConfig(db, 'empresa_ruc', '') ?? '',
    impresoEl: '22/08/2026 09:30',
  };

  const comp = { tipo: 'salida', datos: vale } as const;

  let fallas = 0;
  const altos: number[] = [];

  for (const anchoMm of [80, 58, 210] as AnchoPapel[]) {
    const previa = await vistaPrevia(comp, anchoMm);
    const ruta = join(carpeta, `vale_${anchoMm}mm.pdf`);
    const r = await pdfVale(comp, anchoMm, ruta);
    // Además del PDF, una foto: se mira más rápido y sirve para comparar
    // contra el ticket que salga de la impresora de verdad.
    await capturarVale(comp, anchoMm, ruta.replace(/\.pdf$/, '.png'));

    const cols = COLUMNAS[anchoMm]!;
    const entra = previa.lineaMasLarga === null || previa.lineaMasLarga <= cols;
    if (!entra || !r.ok) fallas += 1;
    if (anchoMm < 200) altos.push(previa.altoHojaMm);

    console.log(`--- ${anchoMm} mm ---`);
    console.log(`  ancho util       : ${previa.utilMm.toFixed(2)} mm`);
    console.log(`  columnas         : ${previa.cols}`);
    console.log(`  letra medida     : ${previa.tamLetraPt.toFixed(2)} pt`);
    console.log(`  alto de la hoja  : ${previa.altoHojaMm.toFixed(2)} mm`);
    if (previa.lineaMasLarga !== null) {
      console.log(
        `  linea mas larga  : ${previa.lineaMasLarga} de ${cols}   ${entra ? 'OK' : '¡SE PASA DEL PAPEL!'}`,
      );
    }
    console.log(`  PDF              : ${r.ok ? ruta : 'FALLÓ: ' + r.motivo}\n`);
  }

  /* --------- comprobaciones sobre el texto, sin depender del render ------- */
  const t80 = textoTicket(vale, 80).split('\n');
  const t58 = textoTicket(vale, 58).split('\n');

  const revisar = (nombre: string, cond: boolean, extra = ''): void => {
    if (!cond) fallas += 1;
    console.log(`  ${cond ? 'OK ' : '✖  '} ${nombre}${extra ? '  ' + extra : ''}`);
  };

  console.log('=== comprobaciones del contenido ===');
  revisar('ninguna linea de 80 mm se pasa de 42', t80.every((l) => l.length <= 42));
  revisar('ninguna linea de 58 mm se pasa de 30', t58.every((l) => l.length <= 30));
  revisar(
    'en 80 mm las firmas van lado a lado',
    t80.some((l) => l.includes('ENTREGUE CONFORME') && l.includes('RECIBI CONFORME')),
  );
  revisar(
    'en 58 mm las firmas van apiladas',
    t58.some((l) => l.includes('ENTREGUE CONFORME') && !l.includes('RECIBI CONFORME')) &&
      t58.some((l) => l.includes('RECIBI CONFORME') && !l.includes('ENTREGUE CONFORME')),
  );
  revisar('el ticket termina con 3 lineas en blanco', t80.slice(-3).every((l) => l.trim() === ''));
  revisar('sale el membrete de la empresa', t80.slice(0, 4).some((l) => l.includes('SFIDA')));
  revisar('sale el numero de vale', t80.some((l) => l.includes(elegido.nro_vale)));
  revisar(
    'la observacion se imprime cuando existe',
    !cab.observacion || t80.some((l) => l.startsWith('OBSERV.')),
    cab.observacion ? '(el vale tiene observación)' : '(este vale no tiene)',
  );
  revisar(
    'el alto de la hoja depende del contenido',
    altos.length === 2 && Math.abs(altos[0]! - altos[1]!) > 0.5,
    `80mm=${altos[0]?.toFixed(1)} 58mm=${altos[1]?.toFixed(1)}`,
  );

  /* --------------------------- el centrado en el papel -------------------- */
  //
  // Se mide emulando la impresión sobre hojas de distinto ancho. La del medio
  // es la que importa: muchos controladores de rollos de 80 mm declaran una
  // hoja más angosta, y ahí es donde el ticket salía pegado a un costado.
  console.log('\n=== centrado en el papel ===');
  for (const hojaMm of [80, 74, 72]) {
    const m = await medirMargenesLaterales(comp, 80, hojaMm);
    const dif = Math.abs(m.izquierdaMm - m.derechaMm);
    // Medio milímetro es el redondeo a píxeles enteros del motor; más que eso
    // ya se ve a simple vista en el papel.
    revisar(
      `hoja de ${hojaMm} mm: el vale queda centrado`,
      dif <= 0.5,
      `izq=${m.izquierdaMm.toFixed(2)} der=${m.derechaMm.toFixed(2)} (diferencia ${dif.toFixed(2)} mm)`,
    );
  }
  // Y que el ajuste manual mueva de verdad lo que dice mover.
  const centrado = await medirMargenesLaterales(comp, 80, 74);
  const corrido = await medirMargenesLaterales(comp, 80, 74, 2);
  revisar(
    'correr el vale 2 mm lo mueve 2 mm a la derecha',
    Math.abs(corrido.izquierdaMm - centrado.izquierdaMm - 2) <= 0.3,
    `izq ${centrado.izquierdaMm.toFixed(2)} -> ${corrido.izquierdaMm.toFixed(2)}`,
  );

  // El nombre del artículo y su código tienen que arrancar en la misma columna.
  const SANGRIA = 12;
  const desalineadas = t80.filter((l) => /^ +(OFI|LIM|ART)-\d+/.test(l) && l.search(/\S/) !== SANGRIA);
  revisar('el nombre del articulo y su codigo arrancan en la misma columna', desalineadas.length === 0);

  /* ------------------------- el ticket de INGRESO (nuevo en la v5) -------- */
  //
  // Se verifica igual que el de salida y por el mismo motivo: es papel que sale
  // de una impresora térmica de 80 o 58 mm, y si una línea se pasa del ancho,
  // el ticket sale cortado. Que el de salida esté bien no dice nada del otro:
  // son dos armadores distintos.
  const ingresos = listarIngresos(db);
  if (ingresos.length === 0) {
    console.log('\n(no hay ingresos en la base: no se verificó el ticket de ingreso)');
  } else {
    const ing = [...ingresos].sort((a, b) => b.items - a.items)[0]!;
    const cabIng = cabeceraIngreso(db, ing.id)!;
    const detIng = detalleIngreso(db, ing.id);
    const ticket: DatosTicketIngreso = {
      nroDocumento: cabIng.nro_documento,
      nroProveedor: cabIng.nro_proveedor,
      tipoDoc: cabIng.tipo_doc,
      fecha: cabIng.fecha,
      proveedor: cabIng.proveedor ?? '',
      observacion: cabIng.observacion ?? '',
      det: detIng,
      total: detIng.reduce((s, d) => s + d.cantidad * d.costo_unitario, 0),
      empresa: vale.empresa,
      empresaDir: vale.empresaDir,
      empresaRuc: vale.empresaRuc,
      impresoEl: vale.impresoEl,
    };
    const compIng = { tipo: 'ingreso', datos: ticket } as const;

    console.log(`\n=== ticket de INGRESO ===`);
    console.log(`Ingreso de prueba: ${ing.nro_documento} · ${ing.proveedor} · ${ing.items} líneas\n`);

    const altosIng: number[] = [];
    for (const anchoMm of [80, 58, 210] as AnchoPapel[]) {
      const previa = await vistaPrevia(compIng, anchoMm);
      const ruta = join(carpeta, `ingreso_${anchoMm}mm.pdf`);
      const r = await pdfVale(compIng, anchoMm, ruta);
      await capturarVale(compIng, anchoMm, ruta.replace(/\.pdf$/, '.png'));

      const cols = COLUMNAS[anchoMm]!;
      const entra = previa.lineaMasLarga === null || previa.lineaMasLarga <= cols;
      if (!entra || !r.ok) fallas += 1;
      if (anchoMm < 200) altosIng.push(previa.altoHojaMm);

      console.log(`--- ${anchoMm} mm ---`);
      console.log(`  alto de la hoja  : ${previa.altoHojaMm.toFixed(2)} mm`);
      if (previa.lineaMasLarga !== null) {
        console.log(
          `  linea mas larga  : ${previa.lineaMasLarga} de ${cols}   ${entra ? 'OK' : '¡SE PASA DEL PAPEL!'}`,
        );
      }
      console.log(`  PDF              : ${r.ok ? ruta : 'FALLÓ: ' + r.motivo}\n`);
    }

    const i80 = textoTicketIngreso(ticket, 80).split('\n');
    const i58 = textoTicketIngreso(ticket, 58).split('\n');

    console.log('=== comprobaciones del ticket de ingreso ===');
    revisar('ninguna linea de 80 mm se pasa de 42', i80.every((l) => l.length <= 42));
    revisar('ninguna linea de 58 mm se pasa de 30', i58.every((l) => l.length <= 30));
    revisar(
      'el titulo es INGRESOS ALMACEN UTILITARIOS',
      i80.some((l) => l.includes('INGRESOS ALMACEN UTILITARIOS')),
    );
    revisar('sale el N° interno del sistema', i80.some((l) => l.includes(cabIng.nro_documento)));
    revisar(
      'sale el N° de la boleta del proveedor',
      !cabIng.nro_proveedor || i80.some((l) => l.includes(cabIng.nro_proveedor)),
      cabIng.nro_proveedor ? `(${cabIng.nro_proveedor})` : '(este ingreso no tiene)',
    );
    revisar('lleva las dos firmas', i80.some((l) => l.includes('CONFORME')));
    revisar(
      'debajo de cada firma hay renglon para el NOMBRE',
      i80.some((l) => l.includes('NOMBRE')) && i58.some((l) => l.includes('NOMBRE')),
    );
    revisar('termina con 3 lineas en blanco', i80.slice(-3).every((l) => l.trim() === ''));
    revisar(
      'el alto de la hoja depende del contenido',
      altosIng.length === 2 && Math.abs(altosIng[0]! - altosIng[1]!) > 0.5,
      `80mm=${altosIng[0]?.toFixed(1)} 58mm=${altosIng[1]?.toFixed(1)}`,
    );
  }

  console.log(
    `\nResultado: ${fallas ? fallas + ' problema(s)' : 'sin problemas'}. Abrí los PDF de ${carpeta} y miralos.\n`,
  );
  process.exitCode = fallas ? 1 : 0;

  ancla.destroy();
  app.quit();
}
