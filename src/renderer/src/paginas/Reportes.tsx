/* ---------------------------------------------------------------------------
 * Reportes. Port de `ReportePage` de `sfida_paginas.py`, más el panel nuevo.
 *
 * Cinco pestañas: el panel de valor e inversión (v5), consumo por sucursal,
 * kardex, ranking e historial de precios.
 * ------------------------------------------------------------------------- */
import { useEffect, useMemo, useState } from 'react';

import type {
  ArticuloListado,
  ConsumoSucursal,
  DetalleConsumo,
  FilaHistorialPrecio,
  InversionSucursal,
  MovimientoKardex,
  PuntoValor,
  ResumenPrecios,
} from '../../../compartido/contrato';
import type { DestinoExtra } from '../App';
import { useApp } from '../estado/app';
import {
  Boton,
  Caja,
  Campo,
  Chips,
  ComboArticulo,
  Etiqueta,
  Tabla,
  Tarjeta,
  dmy,
  fmtMoney,
  fmtNum,
  fmtPrecio,
  fmtVariacion,
  hoyIso,
} from '../ui/base';
import { GraficoBarras, GraficoLinea } from '../ui/graficos';
import { Icono } from '../ui/iconos';

type Pestana = 'panel' | 'consumo' | 'kardex' | 'ranking' | 'precios';

function haceDias(n: number): string {
  const d = new Date(Date.now() - n * 86400000);
  const p = (x: number): string => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PaginaReportes({ extra }: { extra: DestinoExtra | null }): React.JSX.Element {
  const { pedir, avisar, refrescos } = useApp();
  const [desde, setDesde] = useState(haceDias(90));
  const [hasta, setHasta] = useState(hoyIso());
  const [pestana, setPestana] = useState<Pestana>(
    extra?.tipo === 'kardex' ? 'kardex' : extra?.tipo === 'precios' ? 'precios' : 'panel',
  );

  const [articulos, setArticulos] = useState<ArticuloListado[]>([]);
  const [artKardex, setArtKardex] = useState<number | null>(extra?.tipo === 'kardex' ? extra.id : null);
  const [artPrecios, setArtPrecios] = useState<number | null>(extra?.tipo === 'precios' ? extra.id : null);

  const [consumo, setConsumo] = useState<ConsumoSucursal[]>([]);
  const [sucSel, setSucSel] = useState<string | null>(null);
  const [detalleSuc, setDetalleSuc] = useState<DetalleConsumo[]>([]);
  const [kardex, setKardex] = useState<MovimientoKardex[]>([]);
  const [ranking, setRanking] = useState<DetalleConsumo[]>([]);
  const [precios, setPrecios] = useState<FilaHistorialPrecio[]>([]);
  const [resumen, setResumen] = useState<ResumenPrecios | null>(null);
  const [evolucion, setEvolucion] = useState<PuntoValor[]>([]);
  const [inversion, setInversion] = useState<InversionSucursal[]>([]);

  useEffect(() => {
    void pedir(window.sfida.articulos.listar({})).then((a) => setArticulos(a ?? []));
  }, [pedir, refrescos]);

  useEffect(() => {
    void pedir(window.sfida.reportes.consumoSucursal(desde, hasta)).then((c) => setConsumo(c ?? []));
    void pedir(window.sfida.reportes.masUsados(desde, hasta, 40)).then((r) => setRanking(r ?? []));
    void pedir(window.sfida.reportes.evolucionValor(desde, hasta, 14)).then((e) => setEvolucion(e ?? []));
    void pedir(window.sfida.reportes.inversionSucursal(desde, hasta)).then((i) => setInversion(i ?? []));
  }, [pedir, desde, hasta, refrescos]);

  useEffect(() => {
    if (!sucSel) {
      setDetalleSuc([]);
      return;
    }
    void pedir(window.sfida.reportes.detalleSucursal(sucSel, desde, hasta)).then((d) => setDetalleSuc(d ?? []));
  }, [pedir, sucSel, desde, hasta]);

  useEffect(() => {
    if (!artKardex) {
      setKardex([]);
      return;
    }
    void pedir(window.sfida.reportes.kardex(artKardex, desde, hasta)).then((k) => setKardex(k ?? []));
  }, [pedir, artKardex, desde, hasta, refrescos]);

  useEffect(() => {
    if (!artPrecios) {
      setPrecios([]);
      setResumen(null);
      return;
    }
    void pedir(window.sfida.reportes.historialPrecios(artPrecios, desde, hasta)).then((p) => setPrecios(p ?? []));
    void pedir(window.sfida.reportes.resumenPrecios(artPrecios, desde, hasta)).then(setResumen);
  }, [pedir, artPrecios, desde, hasta, refrescos]);

  const nombreArt = (id: number | null): string =>
    articulos.find((a) => a.id === id)?.codigo ?? 'articulo';

  /* ------------------------------------------------------ cifras del panel */

  const panel = useMemo(() => {
    const primero = evolucion[0];
    const ultimo = evolucion[evolucion.length - 1];
    const valorHoy = ultimo?.valor ?? 0;
    const arranque = primero?.valor ?? 0;
    const dif = valorHoy - arranque;
    // La variación en porcentaje no se muestra si se arrancó de cero: dividir
    // por cero daría «infinito %», que no le dice nada a nadie.
    const pct = arranque > 0.0001 ? (dif / arranque) * 100 : null;
    const invertido = inversion.reduce((s, i) => s + i.invertido, 0);
    const vales = inversion.reduce((s, i) => s + i.vales, 0);
    const conMovimiento = inversion.filter((i) => i.invertido > 0 || i.unidades > 0);
    const lider = [...inversion].sort((a, b) => b.invertido - a.invertido)[0];
    return { valorHoy, dif, pct, invertido, vales, conMovimiento, lider, unidades: ultimo?.unidades ?? 0 };
  }, [evolucion, inversion]);

  const barras = useMemo(
    () =>
      [...inversion]
        .sort((a, b) => b.invertido - a.invertido || b.unidades - a.unidades)
        .map((i) => ({
          id: i.codigo,
          etiqueta: i.sucursal,
          valor: i.invertido,
          detalle:
            i.vales === 0
              ? 'sin repartos en el período'
              : `${i.vales} ${i.vales === 1 ? 'vale' : 'vales'} · ${fmtNum(i.unidades)} unidades`,
        })),
    [inversion],
  );

  async function exportar(): Promise<void> {
    let nombre = '';
    let cabeceras: string[] = [];
    let filas: unknown[][] = [];

    if (pestana === 'panel') {
      nombre = 'valor_del_almacen';
      cabeceras = ['Fecha', 'Valor del almacén S/', 'Unidades en stock'];
      filas = evolucion.map((p) => [p.fecha, p.valor.toFixed(2), fmtNum(p.unidades)]);
      // Las dos mitades del panel van en el mismo archivo, separadas por una
      // fila en blanco: quien lo abre quiere las dos cosas juntas.
      filas.push([], ['Sucursal', 'Vales', 'Unidades', 'Invertido S/']);
      for (const i of inversion) {
        filas.push([i.sucursal, i.vales, fmtNum(i.unidades), i.invertido.toFixed(2)]);
      }
    } else if (pestana === 'consumo') {
      nombre = 'consumo_por_sucursal';
      cabeceras = ['Cód. sucursal', 'Sucursal', 'Vales', 'Unidades', 'Valor S/'];
      filas = consumo.map((c) => [c.codigo, c.sucursal, c.vales, fmtNum(c.unidades), c.valor.toFixed(2)]);
    } else if (pestana === 'kardex') {
      if (!artKardex) return avisar('Elija primero un artículo.', 'info');
      nombre = `kardex_${nombreArt(artKardex)}`;
      cabeceras = ['Fecha', 'Tipo', 'Documento', 'Destino / proveedor', 'Entrada', 'Salida', 'Saldo'];
      filas = kardex.map((m) => [m.fecha, m.tipo, m.documento, m.referencia, fmtNum(m.entrada), fmtNum(m.salida), fmtNum(m.saldo)]);
    } else if (pestana === 'ranking') {
      nombre = 'articulos_mas_usados';
      cabeceras = ['Código', 'Artículo', 'Unidad', 'Total repartido'];
      const todos = (await pedir(window.sfida.reportes.masUsados(desde, hasta, 200))) ?? [];
      filas = todos.map((f) => [f.codigo, f.nombre, f.unidad, fmtNum(f.cantidad)]);
    } else {
      if (!artPrecios) return avisar('Elija primero un artículo.', 'info');
      nombre = `precios_${nombreArt(artPrecios)}`;
      cabeceras = ['Fecha', 'Documento', 'Proveedor', 'Cantidad', 'Precio unitario', 'Variación %'];
      filas = precios.map((f) => [f.fecha, f.documento, f.proveedor, fmtNum(f.cantidad), f.precio ? f.precio.toFixed(2) : '', fmtVariacion(f.variacion)]);
    }

    const r = await pedir(window.sfida.reportes.exportar(nombre, cabeceras, filas));
    if (r) avisar(`Archivo guardado: ${r}`, 'ok');
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <Caja>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[160px]">
            <Etiqueta>Desde</Etiqueta>
            <Campo valor={desde} alCambiar={setDesde} tipo="date" />
          </div>
          <div className="w-[160px]">
            <Etiqueta>Hasta</Etiqueta>
            <Campo valor={hasta} alCambiar={setHasta} tipo="date" />
          </div>
          <Boton tono="claro" onClick={() => { setDesde(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`); setHasta(hoyIso()); }}>
            Este mes
          </Boton>
          <Boton tono="claro" onClick={() => { setDesde(haceDias(90)); setHasta(hoyIso()); }}>Últimos 3 meses</Boton>
          <Boton tono="claro" onClick={() => { setDesde('2000-01-01'); setHasta(hoyIso()); }}>Todo</Boton>
          <div className="flex-1" />
          <Boton tono="claro" onClick={exportar}>Exportar reporte</Boton>
        </div>
      </Caja>

      <Chips
        valor={pestana}
        alElegir={setPestana}
        opciones={[
          { id: 'panel', texto: 'Valor e inversión' },
          { id: 'consumo', texto: 'Consumo por sucursal' },
          { id: 'kardex', texto: 'Kardex por artículo' },
          { id: 'ranking', texto: 'Artículos más usados' },
          { id: 'precios', texto: 'Historial de precios' },
        ]}
      />

      {pestana === 'panel' && (
        <>
          <div className="flex flex-wrap gap-3">
            <Tarjeta
              orden={0}
              titulo="Valor del almacén hoy"
              valor={fmtMoney(panel.valorHoy)}
              pie={`${fmtNum(panel.unidades)} unidades en stock`}
              color="#2f6fed"
              icono={<Icono nombre="caja" tam={15} />}
            />
            <Tarjeta
              orden={1}
              titulo="Variación en el período"
              valor={`${panel.dif >= 0 ? '+' : '−'} ${fmtMoney(Math.abs(panel.dif))}`}
              pie={panel.pct === null ? 'arrancó en cero' : `${panel.pct >= 0 ? '+' : ''}${panel.pct.toFixed(1)} % desde ${dmy(desde)}`}
              color={panel.dif >= 0 ? '#22a06b' : '#e5484d'}
              icono={<Icono nombre="grafico" tam={15} />}
            />
            <Tarjeta
              orden={2}
              titulo="Repartido a las tiendas"
              valor={fmtMoney(panel.invertido)}
              pie={`${panel.vales} ${panel.vales === 1 ? 'vale' : 'vales'} · ${panel.conMovimiento.length} de ${inversion.length} tiendas`}
              color="#f5a623"
              icono={<Icono nombre="salida" tam={15} />}
            />
          </div>

          <Caja
            titulo="Cuánto vale el almacén, día por día"
            acciones={
              <span className="text-[12px] text-suave">
                Pasá el mouse por la línea para ver cada fecha
              </span>
            }
          >
            <GraficoLinea
              puntos={evolucion.map((p) => ({
                etiqueta: dmy(p.fecha),
                valor: p.valor,
                detalle: `${fmtNum(p.unidades)} unidades en stock`,
              }))}
              prefijo="S/ "
              vacio="Todavía no hay compras en este período"
            />
            <p className="mt-2 text-[12px] text-suave">
              Cada punto es el stock de esa fecha valorizado al precio que regía ese día, no al de
              hoy. Por eso el gráfico no cambia hacia atrás cuando sube un precio.
            </p>
          </Caja>

          <Caja
            titulo="Cuánto se invirtió en cada tienda"
            acciones={
              <span className="text-[12px] text-suave">
                {sucSel ? 'Tocá de nuevo para ver otra tienda' : 'Tocá una barra para ver el detalle'}
              </span>
            }
          >
            <GraficoBarras
              barras={barras}
              color="#22a06b"
              seleccionada={sucSel}
              alElegir={(id) => setSucSel(id === sucSel ? null : id)}
              vacio="No salió nada del almacén en este período"
            />
            {panel.lider && panel.lider.invertido > 0 && (
              <p className="mt-2 text-[12px] text-suave">
                La que más recibió fue <b>{panel.lider.sucursal}</b>, con{' '}
                {fmtMoney(panel.lider.invertido)} de {fmtMoney(panel.invertido)} repartidos.
              </p>
            )}
          </Caja>

          {sucSel && (
            <Caja titulo={`Qué recibió ${inversion.find((i) => i.codigo === sucSel)?.sucursal ?? ''}`}>
              <Tabla
                columnas={[
                  { clave: 'cod', titulo: 'Código', ancho: '110px', render: (d: DetalleConsumo) => d.codigo },
                  { clave: 'art', titulo: 'Artículo', render: (d) => d.nombre },
                  { clave: 'uni', titulo: 'Unidad', ancho: '110px', render: (d) => d.unidad },
                  { clave: 'cant', titulo: 'Cantidad', ancho: '110px', derecha: true, render: (d) => fmtNum(d.cantidad) },
                ]}
                filas={detalleSuc}
                clave={(d) => d.codigo}
                vacio={{ titulo: 'Sin repartos en el período', detalle: 'Probá ampliando las fechas.' }}
                alto="max-h-[280px]"
              />
            </Caja>
          )}
        </>
      )}

      {pestana === 'consumo' && (
        <>
          <Tabla
            columnas={[
              { clave: 'cod', titulo: 'Código', ancho: '95px', render: (c: ConsumoSucursal) => c.codigo },
              { clave: 'suc', titulo: 'Sucursal', render: (c) => c.sucursal },
              { clave: 'vales', titulo: 'Vales', ancho: '90px', derecha: true, render: (c) => c.vales },
              { clave: 'und', titulo: 'Unidades', ancho: '110px', derecha: true, render: (c) => fmtNum(c.unidades) },
              { clave: 'val', titulo: 'Valor S/', ancho: '120px', derecha: true, render: (c) => c.valor.toFixed(2) },
            ]}
            filas={consumo}
            clave={(c) => c.codigo}
            seleccionada={sucSel}
            alSeleccionar={(c) => setSucSel(c.codigo)}
            vacio={{ titulo: 'Sin repartos en el período', detalle: 'Probá ampliando las fechas.' }}
          />
          <Caja titulo={sucSel ? `Detalle entregado a ${consumo.find((c) => c.codigo === sucSel)?.sucursal ?? ''}` : 'Detalle — seleccione una sucursal'}>
            <Tabla
              columnas={[
                { clave: 'cod', titulo: 'Código', ancho: '110px', render: (d: DetalleConsumo) => d.codigo },
                { clave: 'art', titulo: 'Artículo', render: (d) => d.nombre },
                { clave: 'uni', titulo: 'Unidad', ancho: '110px', render: (d) => d.unidad },
                { clave: 'cant', titulo: 'Cantidad', ancho: '110px', derecha: true, render: (d) => fmtNum(d.cantidad) },
              ]}
              filas={detalleSuc}
              clave={(d) => d.codigo}
              vacio={{ titulo: 'Elegí una sucursal arriba', detalle: 'Acá se ve el detalle de lo que recibió.' }}
              alto="max-h-[300px]"
            />
          </Caja>
        </>
      )}

      {pestana === 'kardex' && (
        <Caja>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="min-w-[300px] flex-1">
              <ComboArticulo articulos={articulos} valor={artKardex} alElegir={setArtKardex} placeholder="Escriba parte del nombre…" />
            </div>
            {artKardex && kardex.length > 0 && (
              <span className="text-[13px] font-semibold text-azul">
                Saldo al final del período: {fmtNum(kardex[kardex.length - 1]!.saldo)}
              </span>
            )}
          </div>
          <Tabla
            columnas={[
              { clave: 'fecha', titulo: 'Fecha', ancho: '110px', render: (m: MovimientoKardex) => dmy(m.fecha) },
              { clave: 'tipo', titulo: 'Tipo', ancho: '100px', render: (m) => m.tipo.charAt(0) + m.tipo.slice(1).toLowerCase() },
              { clave: 'doc', titulo: 'Documento', ancho: '175px', render: (m) => m.documento },
              { clave: 'ref', titulo: 'Destino / proveedor', render: (m) => m.referencia },
              { clave: 'ent', titulo: 'Entrada', ancho: '95px', derecha: true, render: (m) => (m.entrada ? <span className="font-semibold text-verde">{fmtNum(m.entrada)}</span> : '') },
              { clave: 'sal', titulo: 'Salida', ancho: '95px', derecha: true, render: (m) => (m.salida ? <span className="font-semibold text-coral">{fmtNum(m.salida)}</span> : '') },
              { clave: 'saldo', titulo: 'Saldo', ancho: '100px', derecha: true, render: (m) => <span className="font-semibold">{fmtNum(m.saldo)}</span> },
            ]}
            filas={kardex}
            clave={(m) => `${m.fecha}-${m.documento}-${m.entrada}-${m.salida}-${m.saldo}`}
            vacio={
              artKardex
                ? { titulo: 'Sin movimientos en el período', detalle: 'Probá ampliando las fechas.' }
                : { titulo: 'Elegí un artículo', detalle: 'Arriba, en el buscador.' }
            }
          />
        </Caja>
      )}

      {pestana === 'ranking' && (
        <Tabla
          columnas={[
            { clave: 'n', titulo: '#', ancho: '50px', render: (d: DetalleConsumo) => ranking.indexOf(d) + 1 },
            { clave: 'cod', titulo: 'Código', ancho: '110px', render: (d) => d.codigo },
            { clave: 'art', titulo: 'Artículo', render: (d) => d.nombre },
            { clave: 'uni', titulo: 'Unidad', ancho: '110px', render: (d) => d.unidad },
            { clave: 'tot', titulo: 'Total repartido', ancho: '150px', derecha: true, render: (d) => fmtNum(d.cantidad) },
          ]}
          filas={ranking}
          clave={(d) => d.codigo}
          vacio={{ titulo: 'Sin repartos en el período', detalle: 'Probá ampliando las fechas.' }}
        />
      )}

      {pestana === 'precios' && (
        <Caja>
          <div className="mb-3 min-w-[300px]">
            <ComboArticulo articulos={articulos} valor={artPrecios} alElegir={setArtPrecios} placeholder="Escriba parte del nombre…" />
          </div>
          <div className="mb-3 flex flex-wrap gap-3">
            <Tarjeta titulo="Precio más bajo" valor={fmtPrecio(resumen?.minimo)} pie={resumen?.compras ? `${resumen.compras} compras con precio` : 'elija un artículo'} color="#22a06b" icono={<Icono nombre="etiqueta" tam={15} />} />
            <Tarjeta titulo="Precio más alto" valor={fmtPrecio(resumen?.maximo)} pie={resumen?.compras ? `${resumen.compras} compras con precio` : 'elija un artículo'} color="#e5484d" icono={<Icono nombre="etiqueta" tam={15} />} />
            <Tarjeta titulo="Precio promedio" valor={fmtPrecio(resumen?.promedio)} pie={resumen?.compras ? `${resumen.compras} compras con precio` : 'elija un artículo'} color="#2f6fed" icono={<Icono nombre="etiqueta" tam={15} />} />
          </div>
          <Tabla
            columnas={[
              { clave: 'fecha', titulo: 'Fecha', ancho: '110px', render: (f: FilaHistorialPrecio) => dmy(f.fecha) },
              { clave: 'doc', titulo: 'Documento', ancho: '165px', render: (f) => f.documento },
              { clave: 'prov', titulo: 'Proveedor', render: (f) => f.proveedor || '-' },
              { clave: 'cant', titulo: 'Cantidad', ancho: '100px', derecha: true, render: (f) => fmtNum(f.cantidad) },
              { clave: 'precio', titulo: 'Precio unit.', ancho: '120px', derecha: true, render: (f) => fmtPrecio(f.precio) },
              {
                clave: 'var', titulo: 'Variación', ancho: '110px', derecha: true,
                render: (f) => {
                  if (f.variacion === null || Math.abs(f.variacion) < 0.005) return fmtVariacion(f.variacion);
                  return <span className={f.variacion > 0 ? 'font-semibold text-coral' : 'font-semibold text-verde'}>{fmtVariacion(f.variacion)}</span>;
                },
              },
            ]}
            filas={precios}
            clave={(f) => f.det_id}
            vacio={
              artPrecios
                ? { titulo: 'Sin compras en el período', detalle: 'Probá ampliando las fechas.' }
                : { titulo: 'Elegí un artículo', detalle: 'Arriba, en el buscador.' }
            }
          />
          <p className="mt-2 text-[12px] text-suave">
            Cada compra puede tener un precio distinto. En verde bajó respecto de la compra
            anterior, en rojo subió.
          </p>
        </Caja>
      )}
    </div>
  );
}
