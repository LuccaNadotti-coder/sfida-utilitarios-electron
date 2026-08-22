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
import { cabeceraSalida, detalleSalida, listarSalidas } from '../nucleo/movimientos';
import { capturarVale, pdfVale, vistaPrevia } from './imprimir';
import { COLUMNAS, textoTicket, type DatosVale } from './ticket';

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
  const datos: DatosVale = {
    cab: { ...cab, items: 0, unidades: 0 },
    det: detalleSalida(db, elegido.id),
    empresa: getConfig(db, 'empresa', 'SFIDA') ?? 'SFIDA',
    empresaDir: getConfig(db, 'empresa_dir', '') ?? '',
    empresaRuc: getConfig(db, 'empresa_ruc', '') ?? '',
    impresoEl: '22/08/2026 09:30',
  };

  let fallas = 0;
  const altos: number[] = [];

  for (const anchoMm of [80, 58, 210] as AnchoPapel[]) {
    const previa = await vistaPrevia(datos, anchoMm);
    const ruta = join(carpeta, `vale_${anchoMm}mm.pdf`);
    const r = await pdfVale(datos, anchoMm, ruta);
    // Además del PDF, una foto: se mira más rápido y sirve para comparar
    // contra el ticket que salga de la impresora de verdad.
    await capturarVale(datos, anchoMm, ruta.replace(/\.pdf$/, '.png'));

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
  const t80 = textoTicket(datos, 80).split('\n');
  const t58 = textoTicket(datos, 58).split('\n');

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

  // El nombre del artículo y su código tienen que arrancar en la misma columna.
  const SANGRIA = 12;
  const desalineadas = t80.filter((l) => /^ +(OFI|LIM|ART)-\d+/.test(l) && l.search(/\S/) !== SANGRIA);
  revisar('el nombre del articulo y su codigo arrancan en la misma columna', desalineadas.length === 0);

  console.log(
    `\nResultado: ${fallas ? fallas + ' problema(s)' : 'sin problemas'}. Abrí los PDF de ${carpeta} y miralos.\n`,
  );
  process.exitCode = fallas ? 1 : 0;

  ancla.destroy();
  app.quit();
}
