/* ---------------------------------------------------------------------------
 * Control Maestro. Port de `MaestroPage` de `sfida_maestro.py`.
 *
 * Cinco pestañas: Seguridad, Stock mínimo en lote, Catálogos, Auditoría y
 * Respaldos y datos. Se re-bloquea al salir de la sección y aguanta 5 intentos
 * antes de esperar 30 segundos.
 * ------------------------------------------------------------------------- */
import { useCallback, useEffect, useState } from 'react';

import type {
  ArticuloListado,
  Categoria,
  DatosEmpresa,
  FilaAuditoria,
  InfoBaseDatos,
  MinimoSugerido,
  UnidadCatalogo,
} from '../../../compartido/contrato';
import { useInterruptorAnimaciones } from '../estado/animaciones';
import { useApp } from '../estado/app';
import {
  Boton,
  Buscador,
  Caja,
  Campo,
  Chips,
  Etiqueta,
  SpinNumero,
  Tabla,
  fmtNum,
  useDebounce,
  usarConfirmacion,
} from '../ui/base';
import { Icono } from '../ui/iconos';

type Pestana = 'seguridad' | 'minimos' | 'catalogos' | 'auditoria' | 'datos';

export function PaginaMaestro(): React.JSX.Element {
  const { maestroAbierto, setMaestroAbierto } = useApp();
  return maestroAbierto ? <VistaAbierta /> : <VistaBloqueada alEntrar={() => setMaestroAbierto(true)} />;
}

/* --------------------------------------------------------------- bloqueo */

function VistaBloqueada({ alEntrar }: { alEntrar: () => void }): React.JSX.Element {
  const { pedir } = useApp();
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [intentos, setIntentos] = useState(0);
  const [bloqueadoHasta, setBloqueadoHasta] = useState(0);
  const [esFabrica, setEsFabrica] = useState(false);
  const [ahora, setAhora] = useState(Date.now());

  useEffect(() => {
    void pedir(window.sfida.clave.esDeFabrica()).then((v) => setEsFabrica(Boolean(v)));
  }, [pedir]);

  useEffect(() => {
    if (!bloqueadoHasta) return;
    const t = setInterval(() => setAhora(Date.now()), 500);
    return () => clearInterval(t);
  }, [bloqueadoHasta]);

  const bloqueado = bloqueadoHasta > ahora;
  const restan = Math.ceil((bloqueadoHasta - ahora) / 1000);

  async function entrar(): Promise<void> {
    if (bloqueado) return;
    const ok = await pedir(window.sfida.clave.verificar(clave));
    if (ok) {
      setClave('');
      setError('');
      setIntentos(0);
      alEntrar();
      return;
    }
    const n = intentos + 1;
    setIntentos(n);
    setClave('');
    if (n >= 5) {
      // A los 5 intentos, 30 segundos de espera.
      setBloqueadoHasta(Date.now() + 30000);
      setError('Demasiados intentos. Espere 30 segundos.');
    } else {
      setError(`Clave incorrecta (intento ${n}).`);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-5">
      <Caja className="w-full max-w-[560px]">
        <div className="text-center">
          <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-celeste text-azul">
            <Icono nombre="candado" tam={30} />
          </div>
          <h2 className="text-[22px] font-semibold tracking-tight">Control Maestro</h2>
          <p className="mx-auto mt-2 max-w-[420px] text-[13px] text-suave">
            Esta sección permite anular movimientos, editar los mínimos en lote, revisar la
            auditoría y manejar los respaldos. Escriba la clave para entrar.
          </p>
        </div>

        <div className="mx-auto mt-4 max-w-[380px] space-y-3">
          <Campo
            valor={clave}
            alCambiar={setClave}
            tipo="password"
            placeholder="Clave del Control Maestro"
            disabled={bloqueado}
            alEnter={entrar}
            autoFocus
          />
          {error && (
            <div className="rounded-lg bg-coral-clr px-3.5 py-2.5 text-center text-[13px] font-semibold text-[#b3282c]">
              {bloqueado ? `Demasiados intentos. Espere ${restan} segundos.` : error}
            </div>
          )}
          <Boton tono="verde" onClick={entrar} className="w-full" disabled={bloqueado}>
            Entrar
          </Boton>
          {esFabrica && (
            <div className="rounded-lg bg-ambar-clr px-3.5 py-2.5 text-center text-[12px] font-semibold text-ambar-osc">
              Clave de fábrica: sfida2026
            </div>
          )}
        </div>
      </Caja>
    </div>
  );
}

/* ---------------------------------------------------------- vista abierta */

function VistaAbierta(): React.JSX.Element {
  const { setMaestroAbierto, pedir } = useApp();
  const [pestana, setPestana] = useState<Pestana>('seguridad');
  const [esFabrica, setEsFabrica] = useState(false);

  useEffect(() => {
    void pedir(window.sfida.clave.esDeFabrica()).then((v) => setEsFabrica(Boolean(v)));
  }, [pedir, pestana]);

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        {esFabrica && (
          <div className="rounded-lg bg-ambar-clr px-3.5 py-2 text-[12px] font-semibold text-ambar-osc">
            Está usando la clave de fábrica (sfida2026). Cámbiela en la pestaña Seguridad.
          </div>
        )}
        <div className="flex-1" />
        <Boton tono="gris" onClick={() => setMaestroAbierto(false)}>Bloquear ahora</Boton>
      </div>

      <Chips
        valor={pestana}
        alElegir={setPestana}
        opciones={[
          { id: 'seguridad', texto: 'Seguridad' },
          { id: 'minimos', texto: 'Stock mínimo en lote' },
          { id: 'catalogos', texto: 'Catálogos' },
          { id: 'auditoria', texto: 'Auditoría' },
          { id: 'datos', texto: 'Respaldos y datos' },
        ]}
      />

      {pestana === 'seguridad' && <TabSeguridad />}
      {pestana === 'minimos' && <TabMinimos />}
      {pestana === 'catalogos' && <TabCatalogos />}
      {pestana === 'auditoria' && <TabAuditoria />}
      {pestana === 'datos' && <TabDatos />}
    </div>
  );
}

/* ------------------------------------------------------------- seguridad */

function TabSeguridad(): React.JSX.Element {
  const { pedir, avisar } = useApp();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');

  return (
    <Caja titulo="Cambiar la clave del Control Maestro" className="max-w-[560px]">
      <div className="space-y-3">
        <div>
          <Etiqueta>Clave actual</Etiqueta>
          <Campo valor={actual} alCambiar={setActual} tipo="password" />
        </div>
        <div>
          <Etiqueta>Clave nueva</Etiqueta>
          <Campo valor={nueva} alCambiar={setNueva} tipo="password" />
        </div>
        <div>
          <Etiqueta>Repita la clave nueva</Etiqueta>
          <Campo valor={repetir} alCambiar={setRepetir} tipo="password" />
        </div>
        <Boton
          tono="verde"
          onClick={async () => {
            if (nueva !== repetir) return avisar('Las dos claves nuevas no coinciden.', 'err');
            const r = await pedir(window.sfida.clave.cambiar(actual, nueva));
            if (r === null) return;
            setActual(''); setNueva(''); setRepetir('');
            avisar('Clave cambiada correctamente.', 'ok');
          }}
        >
          Guardar la clave nueva
        </Boton>
        <p className="text-[12px] text-suave">
          La clave se guarda encriptada. Si la olvida no se puede recuperar: anótela en un lugar
          seguro.
        </p>
      </div>
    </Caja>
  );
}

/* --------------------------------------------------------------- mínimos */

function TabMinimos(): React.JSX.Element {
  const { pedir, avisar, refrescarTodo } = useApp();
  const [meses, setMeses] = useState(3);
  const [factor, setFactor] = useState(1);
  const [filas, setFilas] = useState<MinimoSugerido[]>([]);
  const [nuevos, setNuevos] = useState<Record<number, string>>({});

  const calcular = useCallback(async () => {
    const r = await pedir(window.sfida.maestro.minimosSugeridos(meses, factor));
    setFilas(r ?? []);
    setNuevos(Object.fromEntries((r ?? []).map((f) => [f.id, String(f.actual)])));
  }, [pedir, meses, factor]);

  useEffect(() => {
    void calcular();
  }, [calcular]);

  return (
    <Caja>
      {/* Dos filas a propósito: en una sola no entraba en 1366 px. */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="w-[190px]">
          <Etiqueta>Calcular según el consumo de los últimos</Etiqueta>
          <SpinNumero valor={meses} alCambiar={setMeses} min={1} max={24} />
        </div>
        <div className="w-[160px]">
          <Etiqueta>Factor de seguridad</Etiqueta>
          <SpinNumero valor={factor} alCambiar={setFactor} min={0.1} max={5} decimales={1} paso={0.1} />
        </div>
        <Boton tono="claro" onClick={calcular}>Calcular</Boton>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="flex-1 text-[12px] text-suave">
          Escribí directamente en la columna «Nuevo mínimo».
        </p>
        <Boton tono="gris" onClick={() => setNuevos(Object.fromEntries(filas.map((f) => [f.id, String(f.sugerido)])))}>
          Copiar sugeridos
        </Boton>
        <Boton
          tono="verde"
          onClick={async () => {
            const pares: Array<[number, number]> = [];
            let invalidas = 0;
            for (const f of filas) {
              const v = Number(String(nuevos[f.id] ?? '').replace(',', '.'));
              if (!Number.isFinite(v)) { invalidas += 1; continue; }
              if (Math.abs(v - f.actual) > 0.0001) pares.push([f.id, v]);
            }
            if (!pares.length) return avisar('No hay cambios que guardar.', 'info');
            const n = await pedir(window.sfida.maestro.guardarMinimos(pares));
            if (n === null) return;
            avisar(`Se actualizaron ${n} artículos.` + (invalidas ? ` ${invalidas} celdas inválidas se ignoraron.` : ''), 'ok');
            await calcular();
            refrescarTodo();
          }}
        >
          Guardar cambios
        </Boton>
      </div>

      <Tabla
        columnas={[
          { clave: 'art', titulo: 'Artículo', render: (f: MinimoSugerido) => f.nombre },
          { clave: 'prom', titulo: 'Consumo prom. / mes', ancho: '180px', derecha: true, render: (f) => fmtNum(f.promedio) },
          { clave: 'act', titulo: 'Mínimo actual', ancho: '140px', derecha: true, render: (f) => fmtNum(f.actual) },
          { clave: 'sug', titulo: 'Sugerido', ancho: '120px', derecha: true, render: (f) => <span className="font-semibold">{fmtNum(f.sugerido)}</span> },
          {
            clave: 'nuevo', titulo: 'Nuevo mínimo', ancho: '140px',
            render: (f) => (
              <input
                value={nuevos[f.id] ?? ''}
                onChange={(e) => setNuevos((p) => ({ ...p, [f.id]: e.target.value }))}
                className="w-full cursor-text rounded-md border border-[#cfe0f5] bg-[#f7fbff] px-2 py-1 text-right text-[13px] outline-none select-text focus:border-azul"
              />
            ),
          },
        ]}
        filas={filas}
        clave={(f) => f.id}
        vacio={{ titulo: 'No hay artículos activos', detalle: 'Cargá artículos para poder calcular mínimos.' }}
        alto="max-h-[440px]"
      />
    </Caja>
  );
}

/* ------------------------------------------------------------- catálogos */

function TabCatalogos(): React.JSX.Element {
  const { pedir, avisar, refrescarTodo } = useApp();
  const { pedir: confirmar, nodo } = usarConfirmacion();
  const [cats, setCats] = useState<Categoria[]>([]);
  const [unidades, setUnidades] = useState<UnidadCatalogo[]>([]);
  const [inactivos, setInactivos] = useState<ArticuloListado[]>([]);
  const [sel, setSel] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    const [c, u, i] = await Promise.all([
      pedir(window.sfida.catalogos.categorias()),
      pedir(window.sfida.catalogos.unidades()),
      pedir(window.sfida.maestro.articulosInactivos()),
    ]);
    setCats(c ?? []);
    setUnidades(u ?? []);
    setInactivos(i ?? []);
  }, [pedir]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Caja titulo="Categorías y unidades" className="xl:col-span-1">
          <ul className="mb-2 space-y-1">
            {cats.map((c) => (
              <li key={c.id} className="rounded-md bg-gris-cab px-3 py-1.5 text-[13px]">{c.nombre}</li>
            ))}
          </ul>
          <p className="mb-3 text-[12px] text-suave">
            El sistema trabaja con estas dos categorías y nada más. No se pueden agregar ni borrar:
            así el catálogo no se llena de categorías repetidas.
          </p>

          <Etiqueta>Unidades de medida y sus equivalencias</Etiqueta>
          <Tabla
            columnas={[
              { clave: 'cod', titulo: 'Unidad', ancho: '80px', render: (u: UnidadCatalogo) => <span className="font-medium">{u.codigo}</span> },
              { clave: 'nom', titulo: 'Nombre', render: (u) => u.nombre },
              { clave: 'fam', titulo: 'Tipo', ancho: '95px', render: (u) => <span className="text-suave">{u.familia}</span> },
              { clave: 'eq', titulo: 'Equivale a', ancho: '150px', render: (u) => <span className="text-suave">{u.equivalencia}</span> },
            ]}
            filas={unidades}
            clave={(u) => u.codigo}
            alto="max-h-[220px]"
          />
          <p className="mt-2 text-[12px] text-suave">
            Las unidades son fijas. Al registrar un artículo se elige una de estas, y el sistema
            sabe a cuánto equivale (por ejemplo, 1 galón son 3.785 litros).
          </p>

          <div className="mt-3">
            <Boton
              tono="ambar"
              onClick={async () => {
                const ok = await confirmar({
                  titulo: 'Pasar todo a MAYÚSCULAS',
                  texto:
                    'Se van a reescribir en MAYÚSCULAS los artículos, sucursales, proveedores, ' +
                    'responsables y números de documento que ya están cargados.\n\n' +
                    'Es la misma regla con la que se guarda todo lo que usted digita desde ahora.',
                  tono: 'ambar',
                });
                if (!ok) return;
                const n = await pedir(window.sfida.catalogos.normalizarTextos());
                if (n === null) return;
                avisar(n ? `Listo: se ordenaron ${n} registro(s).` : 'No hizo falta cambiar nada: ya estaba todo ordenado.', n ? 'ok' : 'info');
                await cargar();
                refrescarTodo();
              }}
            >
              Pasar todo a MAYÚSCULAS
            </Boton>
            <p className="mt-2 text-[12px] text-suave">
              Reescribe en MAYÚSCULAS lo que ya está cargado. Sirve para lo que se digitó antes de
              esta versión.
            </p>
          </div>
        </Caja>

        <Caja titulo="Artículos desactivados" className="xl:col-span-2">
          <Tabla
            columnas={[
              { clave: 'cod', titulo: 'Código', ancho: '110px', render: (a: ArticuloListado) => a.codigo },
              { clave: 'nom', titulo: 'Artículo', render: (a) => a.nombre },
              { clave: 'cat', titulo: 'Categoría', ancho: '160px', render: (a) => a.categoria ?? '-' },
            ]}
            filas={inactivos}
            clave={(a) => a.id}
            seleccionada={sel}
            alSeleccionar={(a) => setSel(a.id)}
            vacio={{ titulo: 'No hay artículos desactivados', detalle: 'Los que tienen movimientos se desactivan en vez de borrarse.' }}
            alto="max-h-[380px]"
          />
          <div className="mt-3">
            <Boton
              tono="verde"
              onClick={async () => {
                if (!sel) return avisar('Seleccione un artículo desactivado.', 'info');
                const r = await pedir(window.sfida.articulos.reactivar(sel));
                if (r === null) return;
                avisar('Artículo reactivado.', 'ok');
                setSel(null);
                await cargar();
                refrescarTodo();
              }}
            >
              Reactivar
            </Boton>
            <p className="mt-2 text-[12px] text-suave">
              Los artículos con movimientos no se borran: se desactivan para conservar el
              historial. Acá puede volver a activarlos.
            </p>
          </div>
        </Caja>
      </div>
      {nodo}
    </>
  );
}

/* ------------------------------------------------------------- auditoría */

function TabAuditoria(): React.JSX.Element {
  const { pedir, avisar } = useApp();
  const { pedir: confirmar, nodo } = usarConfirmacion();
  const [texto, setTexto] = useState('');
  const busqueda = useDebounce(texto);
  const [filas, setFilas] = useState<FilaAuditoria[]>([]);

  const cargar = useCallback(async () => {
    const r = await pedir(window.sfida.maestro.auditoria(busqueda, 400));
    setFilas(r ?? []);
  }, [pedir, busqueda]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const esGrave = (accion: string): boolean =>
    accion.includes('DENEGADO') || accion.includes('ANULA') || accion.includes('BORRADO');

  return (
    <>
      <Caja
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <Buscador valor={texto} alCambiar={setTexto} placeholder="Buscar en el historial…" className="w-[260px]" />
            <Boton
              tono="claro"
              onClick={async () => {
                const todas = (await pedir(window.sfida.maestro.auditoria('', 5000))) ?? [];
                const r = await pedir(
                  window.sfida.reportes.exportar(
                    'auditoria',
                    ['Fecha y hora', 'Acción', 'Detalle'],
                    todas.map((a) => [a.momento, a.accion, a.detalle ?? '']),
                  ),
                );
                if (r) avisar(`Archivo guardado: ${r}`, 'ok');
              }}
            >
              Exportar
            </Boton>
            <Boton
              tono="gris"
              onClick={async () => {
                const ok = await confirmar({
                  titulo: 'Limpiar historial',
                  texto: '¿Dejar solo los últimos 200 registros del historial?',
                  tono: 'ambar',
                });
                if (!ok) return;
                await pedir(window.sfida.maestro.limpiarAuditoria());
                avisar('Historial depurado.', 'ok');
                await cargar();
              }}
            >
              Limpiar antiguos
            </Boton>
          </div>
        }
      >
        <Tabla
          columnas={[
            { clave: 'mom', titulo: 'Fecha y hora', ancho: '185px', render: (a: FilaAuditoria) => a.momento },
            { clave: 'acc', titulo: 'Acción', ancho: '175px', render: (a) => <span className={esGrave(a.accion) ? 'font-semibold text-coral' : ''}>{a.accion}</span> },
            { clave: 'det', titulo: 'Detalle', render: (a) => a.detalle ?? '' },
          ]}
          filas={filas}
          clave={(a) => a.id}
          vacio={{ titulo: 'El historial está vacío', detalle: 'Las acciones se van registrando solas a medida que se usa el programa.' }}
          sinResultados={texto ? { titulo: 'Nada coincide con la búsqueda', detalle: 'Probá con otra palabra.' } : undefined}
          alto="max-h-[520px]"
        />
      </Caja>
      {nodo}
    </>
  );
}

/* ------------------------------------------------------ respaldos y datos */

function TabDatos(): React.JSX.Element {
  const { pedir, avisar, refrescarTodo } = useApp();
  const { pedir: confirmar, nodo } = usarConfirmacion();
  const { encendidas, setEncendidas } = useInterruptorAnimaciones();
  const [info, setInfo] = useState<InfoBaseDatos | null>(null);
  const [empresa, setEmpresa] = useState<DatosEmpresa>({ empresa: '', empresa_dir: '', empresa_ruc: '' });

  useEffect(() => {
    void pedir(window.sfida.sistema.infoBaseDatos()).then(setInfo);
    void pedir(window.sfida.sistema.empresa()).then((e) => e && setEmpresa(e));
  }, [pedir]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Caja titulo="Datos de la empresa">
          <div className="space-y-3">
            <div>
              <Etiqueta>Nombre que sale en los vales</Etiqueta>
              <Campo valor={empresa.empresa} alCambiar={(v) => setEmpresa({ ...empresa, empresa: v })} mayusculas placeholder="SFIDA" />
            </div>
            <div>
              <Etiqueta>Dirección</Etiqueta>
              <Campo valor={empresa.empresa_dir} alCambiar={(v) => setEmpresa({ ...empresa, empresa_dir: v })} mayusculas placeholder="DIRECCIÓN DEL ALMACÉN" />
            </div>
            <div>
              <Etiqueta>RUC (opcional, sale impreso en el vale)</Etiqueta>
              <Campo valor={empresa.empresa_ruc} alCambiar={(v) => setEmpresa({ ...empresa, empresa_ruc: v })} mayusculas placeholder="20XXXXXXXXX" />
            </div>
            <Boton
              tono="verde"
              onClick={async () => {
                const r = await pedir(window.sfida.sistema.guardarEmpresa(empresa));
                if (r !== null) avisar('Datos de la empresa guardados.', 'ok');
              }}
            >
              Guardar datos
            </Boton>
          </div>
        </Caja>

        <Caja titulo="Copia de seguridad">
          <p className="mb-3 text-[12px] break-all text-suave select-text">
            Base de datos: {info?.ruta ?? '…'}
          </p>
          <div className="mb-3 rounded-lg bg-verde-clr px-3.5 py-2.5 text-[12px] text-verde">
            <b>El programa se respalda solo.</b> Cada vez que se abre guarda una copia en la
            subcarpeta <b>respaldos</b>, y conserva las <b>10 más recientes</b>. Si algo se cargó
            mal, ahí está el archivo de antes.
            <br />
            Eso protege de un error de digitación, pero <b>no</b> de que se rompa el disco o se
            pierda la computadora: para eso hace falta una copia <b>fuera</b> de esta PC, en una
            USB o en la nube. Ese es el botón de acá abajo, y conviene usarlo una vez por semana.
          </div>
          <div className="flex flex-wrap gap-2">
            <Boton
              tono="verde"
              onClick={async () => {
                const r = await pedir(window.sfida.maestro.respaldar());
                if (r) avisar(`Copia guardada en ${r}`, 'ok');
              }}
            >
              Crear copia de seguridad
            </Boton>
            <Boton
              tono="ambar"
              onClick={async () => {
                const ok = await confirmar({
                  titulo: 'Restaurar',
                  texto:
                    'Se reemplazarán TODOS los datos actuales por los de esa copia.\n' +
                    'Se guardará una copia de lo actual antes de reemplazar.',
                  tono: 'ambar',
                });
                if (!ok) return;
                const r = await pedir(window.sfida.maestro.restaurar());
                if (r) avisar('Datos restaurados. Cierre y vuelva a abrir el programa para trabajar con la información restaurada.', 'ok');
              }}
            >
              Restaurar desde una copia
            </Boton>
            <Boton tono="claro" onClick={() => void window.sfida.sistema.abrirCarpetaDatos()}>
              Abrir la carpeta
            </Boton>
          </div>
        </Caja>

        <Caja titulo="Apariencia">
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
            <input type="checkbox" checked={encendidas} onChange={(e) => setEncendidas(e.target.checked)} />
            Animaciones suaves
          </label>
          <p className="mt-2 text-[12px] text-suave">
            Hace que las pantallas entren deslizándose y que los avisos aparezcan de a poco. Si la
            computadora es antigua y nota que el programa se mueve a los tirones, destilde esta
            casilla: todo sigue funcionando igual, solo que sin movimiento.
          </p>
        </Caja>

        <Caja titulo="Zona de riesgo">
          <div className="rounded-lg bg-coral-clr px-3.5 py-2.5 text-[13px] font-semibold text-[#b3282c]">
            Borrar todos los movimientos elimina ingresos, egresos y ajustes. Los artículos y
            sucursales se conservan. Úselo solo si terminó las pruebas y va a empezar con datos
            reales.
          </div>
          <div className="mt-3">
            <Boton
              tono="rojo"
              onClick={async () => {
                const ok = await confirmar({
                  titulo: 'Borrar todos los movimientos',
                  texto: 'Esta acción NO se puede deshacer.',
                  palabra: 'BORRAR',
                });
                if (!ok) return;
                const r = await pedir(window.sfida.maestro.borrarMovimientos());
                if (r === null) return;
                avisar('Se borraron todos los movimientos.', 'ok');
                refrescarTodo();
              }}
            >
              Borrar todos los movimientos
            </Boton>
          </div>
        </Caja>
      </div>
      {nodo}
    </>
  );
}
