"use client";

/**
 * PÁGINA DE MUESTRA DEL KIT — SOLO PARA VERIFICAR. Vive en la rama mientras dura
 * el rediseño (los agentes la usan como catálogo) y SE BORRA ANTES DEL PR.
 * Renderiza todos los componentes de src/components/kit y sus estados dentro
 * de <div data-shell="app"> para comprobar tokens, fuentes y contraste antes
 * de migrar el armazón. Los datos son ilustrativos (como en las maquetas).
 */
import "@/components/kit/fuentes";
import { useState } from "react";
import {
  AccionesFila, AreaTexto, Aviso, avisar, BarraLote, Boton, BotonFila, BotonLote, BotonSugerencia, Buscador,
  CabeceraApp, CabeceraPieza, Campo, Casilla, Categoria, Colofon, Cornisa, Dock, Entrada, EnObra, ErrorCarga,
  Escribiendo, Esqueleto, Estado, FichaAgente, FilaArchivo, FilaObligacion, FranjaPreparacion, GrupoCampos,
  GrupoIndice, Indice, Insignia, Interruptor, ItemIndice, Kpi, Kpis, ListaArchivos, ListaObligaciones, MasEnLista, Medidor, MenuMas, Modal,
  NavPasos, Opcion, OpcionFila, OpcionesFila, RejillaMeses, Resumen, Pagina, Paginacion, Panel, Pasos, PestanasUnidas, PieIndice, PieTabla, Pieza,
  ProgresoGeneracion, RegionAvisos, RotuloIA, Seccion, Segmentos, Selector, SinResultados, Tabla, TipoArchivo,
  TiraSemanal, Urgencia, Urgencias, Vacio, ZonaSubida, type ColumnaTabla,
  MensajeUsuario, RespuestaAgente, Redactor, TarjetaPlan, LeyendaGrafica, Flecha,
} from "@/components/kit";

type Unidad = { id: string; piso: string; rol: string; nombre: string; correo?: string; portal: boolean };
const UNIDADES: Unidad[] = [
  { id: "101", piso: "1", nombre: "María Restrepo", rol: "Propietaria", correo: "maria.restrepo@correo.com", portal: true },
  { id: "102", piso: "1", nombre: "Juan Cárdenas", rol: "Arrendatario", correo: "juan.cardenas@correo.com", portal: true },
  { id: "103", piso: "1", nombre: "Ana Lucía Peña", rol: "Propietaria", correo: "ana.pena@correo.com", portal: true },
  { id: "201", piso: "2", nombre: "Carlos Mejía", rol: "Propietario", correo: "carlos.mejia@correo.com", portal: true },
  { id: "202", piso: "2", nombre: "Andrés Gil", rol: "Arrendatario", portal: true },
  { id: "203", piso: "2", nombre: "Diego Ramírez", rol: "Propietario", correo: "diego.ramirez@correo.com", portal: false },
];

type Doc = { id: string; mes: string; fecha: string; tipo: string; titulo: string; prop: string; estado: "ok" | "curso" | "error" };
const DOCS: Doc[] = [
  { id: "d1", mes: "Septiembre 2026 · 3", fecha: "23 sep", tipo: "INF", titulo: "Informe de gestión agosto", prop: "Mirador 93", estado: "ok" },
  { id: "d2", mes: "Septiembre 2026 · 3", fecha: "22 sep", tipo: "ACTA", titulo: "Acta del consejo", prop: "Los Pinos", estado: "curso" },
  { id: "d3", mes: "Septiembre 2026 · 3", fecha: "20 sep", tipo: "PRES", titulo: "Presentación de asamblea", prop: "Torres del Río", estado: "error" },
  { id: "d4", mes: "Agosto 2026 · 1", fecha: "30 ago", tipo: "INF", titulo: "Informe de gestión julio", prop: "Los Pinos", estado: "ok" },
];

const ESTADOS_BOTON = ["Reposo", "Cursor encima", "Presionado", "Foco", "Deshabilitado"] as const;
const FORZADO = ["", "f-hover", "f-press", "f-foco", ""];

const CSS_MUESTRA = `
.muestra-kit { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: var(--g); row-gap: 40px; }
.muestra-kit > .w12 { grid-column: 1 / -1; } .muestra-kit > .w6a { grid-column: 1 / 7; } .muestra-kit > .w6b { grid-column: 7 / 13; }
.muestra-kit > .w4a { grid-column: 1 / 5; } .muestra-kit > .w4b { grid-column: 5 / 9; } .muestra-kit > .w4c { grid-column: 9 / 13; }
.muestra-kit > .w7 { grid-column: 1 / 8; } .muestra-kit > .w5 { grid-column: 8 / 13; }
.bmat { display: grid; grid-template-columns: 112px repeat(5, minmax(0, 1fr)); gap: 14px 16px; align-items: center; }
.bmat .rl { font-size: 14px; font-weight: 700; } .bmat .ch { font-size: 13px; color: var(--ink-3); font-weight: 600; }
.bmat .k-btn { width: 100%; }
.tams { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.tams small { display: block; margin-top: 6px; font-size: 13px; color: var(--ink-3); }
.chips { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
.fila-ej { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 14px; color: var(--ink-2); }
.modal-demo { position: relative; padding: 28px; background: var(--scrim); }
.modal-demo .k-modal { position: relative; }
@media (min-width: 861px) {
  .caja-indice { height: 640px; overflow: hidden; border: 2px solid var(--rule); }
  .caja-indice .k-indice { position: relative; height: 100%; }
}
/* Estados forzados (solo muestra): copian las reglas :hover / :active / :focus-visible del kit. */
.f-hover.k-btn { background: var(--accent-hi); border-color: var(--accent-hi); text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 5px; }
.f-press.k-btn { background: var(--accent-lo); border-color: var(--accent-lo); box-shadow: inset 0 0 0 2px var(--on-accent); text-decoration: none; }
.f-hover.k-btn.k-sec { background: var(--hl); text-decoration: none; } .f-press.k-btn.k-sec { background: var(--surface-3); box-shadow: none; }
.f-hover.k-btn.k-fan { background: var(--hl); border-color: transparent; text-decoration: underline; } .f-press.k-btn.k-fan { background: var(--surface-3); border-color: transparent; box-shadow: none; text-decoration: underline; }
.f-hover.k-btn.k-pel { background: var(--danger); color: var(--on-danger); border-color: var(--danger); text-decoration: none; }
.f-press.k-btn.k-pel { background: var(--danger); color: var(--on-danger); border-color: var(--danger); box-shadow: inset 0 0 0 2px var(--on-danger); }
.f-foco { outline: 3px solid var(--focus); outline-offset: 2px; }
.f-foco-in .k-in, .k-in.f-foco { outline: 3px solid var(--focus); outline-offset: 2px; }
@media (max-width: 1180px) {
  .muestra-kit > .w6a, .muestra-kit > .w6b, .muestra-kit > .w7, .muestra-kit > .w5 { grid-column: 1 / -1; }
  .muestra-kit > .w4a { grid-column: 1 / 7; } .muestra-kit > .w4b { grid-column: 7 / 13; } .muestra-kit > .w4c { grid-column: 1 / -1; }
  .bmat { grid-template-columns: 96px repeat(5, minmax(0, 1fr)); }
}
@media (max-width: 860px) {
  .muestra-kit { grid-template-columns: minmax(0, 1fr); row-gap: 32px; }
  .muestra-kit > * { grid-column: 1 / -1 !important; }
  .bmat { grid-template-columns: 1fr 1fr; } .bmat .ch { display: none; } .bmat .rl { grid-column: 1 / -1; margin-top: 8px; }
  .chips { grid-template-columns: 1fr; }
  .modal-demo { padding: 16px; }
}
`;

export default function KitMuestra() {
  const [sel, setSel] = useState<Set<string>>(new Set(["101", "102"]));
  const [filtro, setFiltro] = useState("todas");
  const [prop, setProp] = useState("lp");
  const [vista, setVista] = useState("lista");
  const [pest, setPest] = useState("resumen");
  const [acta, setActa] = useState(true);
  const [copia, setCopia] = useState(false);
  const [periodo, setPeriodo] = useState("sep");
  const [avisosChronos, setAvisosChronos] = useState(true);
  const [whats, setWhats] = useState(false);
  const [modal, setModal] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [alcance, setAlcance] = useState("todas");
  const [indice, setIndice] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [texto, setTexto] = useState("");
  const [propGen, setPropGen] = useState("lp");
  const [mesGen, setMesGen] = useState<number | null>(9);

  const columnas: ColumnaTabla<Unidad>[] = [
    { id: "u", titulo: "Unidad", ancho: "minmax(0, 1fr)", principal: true, claseCelda: "k-c-id", celda: (u) => u.id },
    { id: "r", titulo: "Residente", ancho: "minmax(0, 3fr)", claseCelda: "k-c-nom", celda: (u) => <>{u.nombre}<span>{u.rol}</span></> },
    {
      id: "c", titulo: "Correo", ancho: "minmax(0, 3fr)", claseCelda: "k-c-correo",
      celda: (u) => (u.correo ? u.correo : <Estado tipo="falta">Sin correo</Estado>),
    },
    { id: "p", titulo: "Portal", ancho: "minmax(0, 2fr)", celda: (u) => (u.portal ? <Estado tipo="ok">Activo</Estado> : <Estado tipo="sin">Sin enlace</Estado>) },
    {
      id: "a", titulo: "Acciones", tituloOculto: true, alinear: "fin", ancho: "minmax(0, 3fr)", claseCelda: "k-td-acc",
      celda: (u) => (
        <AccionesFila>
          {!u.portal ? <BotonFila>Generar enlace</BotonFila> : !u.correo ? <BotonFila>Agregar correo</BotonFila> : <BotonFila>Copiar enlace</BotonFila>}
          {u.portal && (
            <MenuMas etiquetaAccesible={`Más acciones · unidad ${u.id}`} items={[
              { etiqueta: "Abrir el portal de la unidad", alElegir: () => avisar({ tipo: "info", titulo: "Muestra.", texto: "Aquí se abriría el portal." }) },
              { etiqueta: "Enviar enlace por correo", alElegir: () => {} },
              { etiqueta: "Enviar enlace por WhatsApp", alElegir: () => {} },
              { etiqueta: "Desactivar portal…", nota: "pide confirmación", peligro: true, alElegir: () => setModal(true) },
              { etiqueta: "Generar un enlace nuevo", alElegir: () => {} },
            ]} />
          )}
        </AccionesFila>
      ),
    },
  ];

  const columnasDocs: ColumnaTabla<Doc>[] = [
    { id: "f", titulo: "Fecha", ancho: "minmax(0, 1fr)", principal: true, celda: (d) => <span className="k-fecha">{d.fecha}</span> },
    { id: "d", titulo: "Documento", ancho: "minmax(0, 4fr)", celda: (d) => <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}><TipoArchivo>{d.tipo}</TipoArchivo><b style={{ fontSize: 16, fontWeight: 650 }}>{d.titulo}</b></span> },
    { id: "c", titulo: "Copropiedad", ancho: "minmax(0, 2fr)", celda: (d) => <span style={{ fontSize: 15 }}>{d.prop}</span> },
    { id: "e", titulo: "Estado", ancho: "minmax(0, 2fr)", celda: (d) => d.estado === "ok" ? <Estado tipo="ok">Listo</Estado> : d.estado === "curso" ? <Estado tipo="enCurso">Procesando</Estado> : <Estado tipo="vencido">Error</Estado> },
    { id: "x", titulo: "Acciones", tituloOculto: true, alinear: "fin", ancho: "minmax(0, 2fr)", claseCelda: "k-td-acc", celda: () => <BotonFila>Abrir</BotonFila> },
  ];

  return (
    <div data-shell="app" style={{ background: "var(--surface-0)", color: "var(--ink)", minHeight: "100dvh" }}>
      <style>{CSS_MUESTRA}</style>

      {/* Armazón: cabecera y cornisa */}
      <div id="muestra-cab">
        <CabeceraApp nn="—" titulo="Muestra del kit"
          buscador={<Buscador etiquetaAccesible="Buscar obligación, unidad o documento…" atajo="/" />}
          alBuscar={() => {}}
          accion={<Boton flecha="avanza" href="/dashboard/generar">Generar informe</Boton>} />
      </div>
      <Cornisa valor={alcance} alCambiar={setAlcance} copropiedades={[
        { id: "m93", nombre: "Edificio Mirador 93", vencidas: 0 },
        { id: "lp", nombre: "Conjunto Residencial Los Pinos", vencidas: 2 },
        { id: "tr", nombre: "Torres del Río", vencidas: 1 },
      ]} />

      <Pagina>
        <Pieza>
          <CabeceraPieza nn="—" titulo="Hoja de estados del kit"
            subtitulo="Cada control en reposo, al pasar el cursor, presionado, con foco y deshabilitado"
            acciones={<>
              <Boton variante="secundario" cargando={guardando} textoCargando="Guardando…" onClick={() => { setGuardando(true); setTimeout(() => setGuardando(false), 2500); }}>Guardar borrador</Boton>
              <Boton flecha="crea" onClick={() => avisar({ tipo: "ok", titulo: "Informe generado.", texto: "Los Pinos · septiembre 2026", accion: { etiqueta: "Abrir", alElegir: () => {} } })}>Probar aviso</Boton>
            </>} />

          <div className="muestra-kit">
            <Panel className="w12" titulo="Botones" nota="rectos, sin sombra; foco = contorno de 3 px">
              <div className="bmat">
                <span />
                {ESTADOS_BOTON.map((e) => <span key={e} className="ch">{e}</span>)}
                {(["primario", "secundario", "fantasma", "peligro"] as const).map((v) => (
                  <div key={v} style={{ display: "contents" }}>
                    <span className="rl">{{ primario: "Primario", secundario: "Secundario", fantasma: "Fantasma", peligro: "Peligro" }[v]}</span>
                    {FORZADO.map((f, i) => (
                      <Boton key={i} variante={v} className={f || undefined} disabled={i === 4}
                        flecha={v === "primario" ? "avanza" : undefined}>
                        {{ primario: "Generar", secundario: "Guardar borrador", fantasma: "Ahora no", peligro: "Desactivar portal" }[v]}
                      </Boton>
                    ))}
                  </div>
                ))}
              </div>
              <div className="tams">
                <div><Boton tam={40}>Copiar</Boton><small>40 px · filas y barras</small></div>
                <div><Boton flecha="avanza">Continuar</Boton><small>44 px · por defecto</small></div>
                <div><Boton tam={56} flecha="avanza">Continuar a notas</Boton><small>56 px · acción principal del flujo</small></div>
                <div><Boton variante="secundario" flecha="vuelve">Documentos</Boton><small>← Atrás</small></div>
                <div><Boton cargando textoCargando="Generando…">Generar informe</Boton><small>cargando</small></div>
                <div><Boton variante="peligro" lleno>Desactivar portal</Boton><small>peligro lleno (modal)</small></div>
              </div>
            </Panel>

            <Panel className="w4a" titulo="Campos">
              <Campo id="m-nombre" etiqueta="Nombre de la copropiedad">
                <Entrada id="m-nombre" defaultValue="Conjunto Residencial Los Pinos" />
              </Campo>
              <Campo id="m-nit" etiqueta="NIT" ayuda="Con dígito de verificación." className="f-foco-in">
                <Entrada id="m-nit" defaultValue="900.458.221-7" aria-describedby="m-nit-ayuda" />
              </Campo>
              <Campo id="m-correo" etiqueta="Correo del consejo" error="Falta el dominio: por ejemplo, consejo@lospinos.com">
                <Entrada id="m-correo" defaultValue="consejo@lospinos" invalido aria-describedby="m-correo-err" />
              </Campo>
              <Campo id="m-ciudad" etiqueta="Ciudad">
                <Selector id="m-ciudad" defaultValue="bog"><option value="bog">Bogotá D. C.</option><option value="med">Medellín</option></Selector>
              </Campo>
              <Campo id="m-plan" etiqueta="Plan">
                <Entrada id="m-plan" defaultValue="Pro · lo cambias en Suscripción" disabled />
              </Campo>
            </Panel>

            <Panel className="w4b" titulo="Casillas, opciones, interruptor">
              <div className="k-ctls">
                <Casilla etiqueta="Incluir el acta del consejo" checked={acta} onChange={(e) => setActa(e.target.checked)} />
                <Casilla etiqueta="Enviar copia al revisor fiscal" checked={copia} onChange={(e) => setCopia(e.target.checked)} />
                <Casilla etiqueta="Seleccionar todas (parcial)" indeterminada checked={false} onChange={() => {}} />
                <Casilla etiqueta="Presentación (no disponible)" disabled />
                <div role="radiogroup" aria-label="Periodo" className="k-ctls">
                  <Opcion name="m-per" etiqueta="Septiembre 2026" checked={periodo === "sep"} onChange={() => setPeriodo("sep")} />
                  <Opcion name="m-per" etiqueta="Agosto 2026" checked={periodo === "ago"} onChange={() => setPeriodo("ago")} />
                </div>
                <Interruptor etiqueta="Avisos de Chronos por correo" activo={avisosChronos} alCambiar={setAvisosChronos} />
                <Interruptor etiqueta="Avisos por WhatsApp" activo={whats} alCambiar={setWhats} />
              </div>
              <Campo id="m-notas" etiqueta="Notas para la IA" opcional className="mt-4">
                <AreaTexto id="m-notas" placeholder="Ej.: la piscina estuvo cerrada del 5 al 12 por reparación de la bomba…" />
              </Campo>
            </Panel>

            <Panel className="w4c" titulo="Estados e insignias" nota="forma + color + palabra">
              <div className="chips">
                <Estado tipo="ok">Activo · Listo</Estado>
                <Estado tipo="pendiente">Pendiente</Estado>
                <Estado tipo="vencido">Vencida · Error</Estado>
                <Estado tipo="falta">Sin correo</Estado>
                <Estado tipo="enCurso">En curso</Estado>
                <Estado tipo="enObra">En obra</Estado>
                <Estado tipo="sin">Sin enlace</Estado>
                <Estado tipo="ok" neutro>Listo (neutro)</Estado>
              </div>
              <div className="fila-ej">
                <Insignia unidad="por generar">2</Insignia> por generar <Insignia alerta unidad="vencidas">3</Insignia> vencidas
              </div>
              <div className="fila-ej">
                <TipoArchivo>PDF</TipoArchivo><TipoArchivo>XLS</TipoArchivo><TipoArchivo>ACTA</TipoArchivo>
                <Categoria>Mantenimiento</Categoria><Categoria>SG-SST</Categoria>
              </div>
              <div style={{ marginTop: 18 }}>
                <Segmentos etiquetaAccesible="Pestañas de ejemplo" modo="pestanas" valor={pest} alCambiar={setPest}
                  items={[{ id: "resumen", etiqueta: "Resumen" }, { id: "unidades", etiqueta: "Unidades", conteo: 48 }, { id: "docs", etiqueta: "Documentos" }]} />
              </div>
              <div style={{ marginTop: 18 }}>
                <PestanasUnidas vista etiquetaAccesible="Vista" valor={vista} alCambiar={setVista}
                  items={[{ id: "lista", etiqueta: "Lista" }, { id: "mes", etiqueta: "Mes" }]} />
              </div>
            </Panel>

            <Panel className="w6a" titulo="Avisos" nota="abajo a la derecha; 6 s o hasta que se cierren">
              <div style={{ display: "grid", gap: 12 }}>
                <Aviso tipo="ok" rol={null} titulo="Informe generado." texto="Los Pinos · septiembre 2026" accion={{ etiqueta: "Abrir", alElegir: () => {} }} />
                <Aviso tipo="error" rol={null} titulo="No se pudo enviar el correo." texto="La unidad 202 no tiene correo registrado." accion={{ etiqueta: "Agregar correo", alElegir: () => {} }} alCerrar={() => {}} />
                <Aviso rol={null} titulo="Enlace copiado." texto="Pégalo en WhatsApp o en un correo." alCerrar={() => {}} />
                <Aviso enLinea rol={null} tipo="error" titulo="Tu plan venció el 1 de octubre." texto="Renueva para seguir generando." accion={{ etiqueta: "Ver planes", href: "/dashboard/suscripcion" }} />
                <div className="k-btns">
                  <Boton variante="secundario" tam={40} onClick={() => avisar({ tipo: "error", titulo: "No se pudo enviar el correo.", texto: "La unidad 202 no tiene correo registrado." })}>Probar aviso de error</Boton>
                  <Boton variante="secundario" tam={40} onClick={() => avisar({ tipo: "info", titulo: "Enlace copiado.", texto: "Pégalo en WhatsApp o en un correo." })}>Probar aviso informativo</Boton>
                </div>
              </div>
            </Panel>

            <Panel className="w6b" titulo="Modal de confirmación" nota="velo + foco atrapado + Escape">
              <div className="modal-demo">
                <div className="k-modal" role="group" aria-label="Vista previa del modal">
                  <h2>¿Desactivar el portal de la unidad 102?</h2>
                  <div className="cuerpo"><p>Juan Cárdenas dejará de ver sus documentos y su estado de cuenta. Puedes generar un enlace nuevo cuando quieras.</p></div>
                  <div className="acc">
                    <Boton variante="secundario">Cancelar</Boton>
                    <Boton variante="peligro" lleno>Desactivar portal</Boton>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 14 }}><Boton variante="secundario" tam={40} onClick={() => setModal(true)}>Abrir el modal real</Boton></div>
            </Panel>

            <Panel className="w6a" titulo="Generando" nota="progreso del asistente, paso final">
              <ProgresoGeneracion titulo="Informe de gestión · septiembre 2026" subtitulo="Conjunto Residencial Los Pinos" porcentaje={62}
                etapas={[
                  { nombre: "Preparando los 4 archivos", estado: "listo" },
                  { nombre: "Analizando el contenido", estado: "listo" },
                  { nombre: "Generando los documentos con IA", estado: "curso" },
                  { nombre: "Creando el informe y el acta", estado: "espera" },
                  { nombre: "Finalizando", estado: "espera" },
                ]}
                nota="El proceso continúa aunque cierres esta página. Te avisamos cuando esté listo."
                acciones={<Boton variante="secundario" href="/dashboard">Volver al inicio</Boton>} />
              <div style={{ marginTop: 16 }}>
                <ProgresoGeneracion titulo="Acta del consejo · septiembre 2026" subtitulo="Torres del Río" porcentaje={40}
                  etapas={[
                    { nombre: "Preparando los 2 archivos", estado: "listo" },
                    { nombre: "Analizando el contenido", estado: "error", motivo: "El audio está vacío: vuelve a grabarlo o súbelo de nuevo." },
                  ]}
                  acciones={<Boton variante="secundario">Reintentar</Boton>} />
              </div>
            </Panel>

            <Panel className="w6b" titulo="Esqueleto de carga" nota="bloques planos; pulso solo sin «reducir movimiento»">
              <Esqueleto variante="completo" filas={3} />
            </Panel>
          </div>
        </Pieza>

        {/* Asistente Generar: pasos + subida */}
        <Pieza>
          <CabeceraPieza nn="02" titulo="Archivos para el informe de gestión"
            subtitulo="Generar · paso 4 de 5 · Conjunto Residencial Los Pinos · septiembre 2026"
            acciones={<Boton variante="secundario">Guardar borrador</Boton>} />
          <Pasos actual={4} pasos={[
            { nombre: "Propiedad", valor: "Los Pinos", alVolver: () => {} },
            { nombre: "Periodo", valor: "Sep 2026", alVolver: () => {} },
            { nombre: "Documentos", valor: "Informe y acta", alVolver: () => {} },
            { nombre: "Archivos", valor: "4 listos · 1 con error" },
            { nombre: "Notas", valor: "Opcional" },
          ]} />
          <div className="muestra-kit">
            <div className="w7">
              <ZonaSubida titulo="Suelta aquí los archivos del mes" texto="o haz clic para elegirlos. Solo alimentan el informe de gestión."
                formatos={<>PDF, Word, Excel e imágenes · hasta 20 archivos · audios de hasta 200&nbsp;MB</>} multiple alElegir={() => {}} />
              <ListaArchivos>
                <FilaArchivo nombre="Estados financieros agosto 2026.xlsx" detalle="1,8 MB" estado="listo" alQuitar={() => {}} />
                <FilaArchivo nombre="Bitácora de mantenimientos — planta y bombas.docx" detalle="212 KB" estado="listo" alQuitar={() => {}} />
                <FilaArchivo nombre="Nota de voz — reunión con vigilancia.m4a" detalle="18,4 MB · 12 min" estado="subiendo" progreso={64} alQuitar={() => {}} etiquetaQuitar="Cancelar la subida de Nota de voz" />
                <FilaArchivo nombre="Foto cuarto de bombas.heic" estado="error" mensaje="Formato no admitido: expórtala como JPG y súbela de nuevo." alQuitar={() => {}} />
              </ListaArchivos>
            </div>
            <div className="w5">
              <Panel titulo="Qué subir" nota="3 de 5 cubiertos" as="aside">
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {[["Estados financieros del mes", true], ["Reporte de cartera y recaudos", true], ["Registros de mantenimiento", true], ["Fotos de obras, mejoras o daños", false], ["Novedades de seguridad o proveedores", false]].map(([t, ok]) => (
                    <li key={String(t)} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "11px 0", borderTop: "1px solid var(--line)", fontSize: 15 }}>
                      <span>{t}</span>{ok ? <Estado tipo="ok" tamLetra={14}>Subido</Estado> : <Estado tipo="pendiente" tamLetra={14}>Falta</Estado>}
                    </li>
                  ))}
                </ul>
              </Panel>
              <NavPasos>
                <Boton variante="secundario" flecha="vuelve">Documentos</Boton>
                <Boton tam={56} flecha="avanza">Continuar a notas</Boton>
              </NavPasos>
              <div style={{ marginTop: 24 }}>
                <ZonaSubida compacta titulo="Manual de convivencia" texto="PDF o Word · opcional" alElegir={() => {}} />
              </div>
            </div>
          </div>
        </Pieza>

        {/* Asistente Generar: recetas de los pasos 1, 2 y 5 */}
        <Pieza>
          <CabeceraPieza nn="02" titulo="Generar documentos · pasos 1, 2 y 5"
            subtitulo="Fila seleccionable de 64 px, rejilla de meses y resumen de lo elegido" />
          <div className="muestra-kit">
            <div className="w7">
              <OpcionesFila etiquetaAccesible="Copropiedad">
                <OpcionFila name="m-prop" etiqueta="Conjunto Residencial Los Pinos" detalle="48 unidades" extra="último informe: agosto"
                  checked={propGen === "lp"} onChange={() => setPropGen("lp")} />
                <OpcionFila name="m-prop" etiqueta="Torres del Río" detalle="96 unidades" extra="último informe: agosto"
                  checked={propGen === "tr"} onChange={() => setPropGen("tr")} />
                <OpcionFila name="m-prop" etiqueta="Edificio Mirador 93" detalle="24 unidades"
                  checked={propGen === "m93"} onChange={() => setPropGen("m93")} />
              </OpcionesFila>
              <div style={{ marginTop: 28 }}>
                <RejillaMeses nombre="m-mes" etiquetaAccesible="Mes del informe · 2026" valor={mesGen} alCambiar={setMesGen}
                  deshabilitado={(m) => m > 9} />
              </div>
            </div>
            <div className="w5">
              <Resumen etiquetaAccesible="Resumen de la generación" filas={[
                { etiqueta: "Propiedad", valor: "Conjunto Residencial Los Pinos" },
                { etiqueta: "Periodo", valor: "Septiembre 2026" },
                { etiqueta: "Documentos", valor: "Informe de gestión y acta del consejo" },
                { etiqueta: "Archivos", valor: "4 listos" },
              ]} />
              <div style={{ marginTop: 28 }}>
                <Medidor filas={[{ etiqueta: "Este mes", usado: 12, total: 15 }, { etiqueta: "Hoy", usado: 1, total: 3 }]} libres={2} unidadLibres="libres hoy" />
              </div>
            </div>
          </div>
        </Pieza>

        {/* Tabla con selección, lote y menú */}
        <Pieza>
          <CabeceraPieza nn="07" titulo="Residentes" subtitulo="Portal por unidad, sin usuarios ni contraseñas"
            acciones={<><Boton variante="secundario">Importar Excel con IA</Boton><Boton flecha="crea">Agregar unidad</Boton></>} />
          <PestanasUnidas etiquetaAccesible="Copropiedad" valor={prop} alCambiar={setProp} fin="47 de 48 con enlace · 46 con correo"
            items={[{ id: "lp", etiqueta: "Conjunto Residencial Los Pinos", conteo: "48 u." }, { id: "tr", etiqueta: "Torres del Río", conteo: "96 u." }, { id: "m93", etiqueta: "Edificio Mirador 93", conteo: "24 u." }]} />
          <div style={{ display: "flex", gap: 12, alignItems: "stretch", margin: "18px 0", flexWrap: "wrap" }}>
            <Segmentos etiquetaAccesible="Filtrar por estado" valor={filtro} alCambiar={setFiltro}
              items={[{ id: "todas", etiqueta: "Todas", conteo: 48 }, { id: "con", etiqueta: "Con enlace", conteo: 47 }, { id: "sin", etiqueta: "Sin enlace", conteo: 1 }, { id: "sc", etiqueta: "Sin correo", conteo: 2 }]} />
            <Buscador etiquetaAccesible="Buscar unidad, residente o correo" style={{ minWidth: 0 }} />
          </div>
          {sel.size > 0 && (
            <BarraLote n={sel.size} alQuitar={() => setSel(new Set())}>
              <BotonLote>Enviar enlace por correo</BotonLote>
              <BotonLote>Enviar por WhatsApp</BotonLote>
              <BotonLote>Generar enlaces nuevos</BotonLote>
            </BarraLote>
          )}
          <Tabla etiquetaAccesible="Unidades de Conjunto Residencial Los Pinos" filas={UNIDADES} claveFila={(u) => u.id} columnas={columnas}
            seleccion={{ ids: sel, alCambiar: setSel, etiquetaFila: (u) => `Seleccionar ${u.id}` }}
            agrupar={{ clave: (u) => u.piso, titulo: (k) => k, nota: "Piso", cabecera: "Piso" }} />
          <PieTabla texto="Mostrando 6 de 48 unidades · pisos 1 y 2"><Paginacion pagina={pagina} total={8} alCambiar={setPagina} /></PieTabla>

          <div style={{ marginTop: 48 }}>
            <Tabla etiquetaAccesible="Documentos de 2026" filas={DOCS} claveFila={(d) => d.id} columnas={columnasDocs}
              agrupar={{ clave: (d) => d.mes, titulo: (k) => k, estilo: "fila" }} filaConError={(d) => d.estado === "error"} />
          </div>
          <div style={{ marginTop: 32 }}>
            <Tabla etiquetaAccesible="Tabla vacía" filas={[] as Doc[]} claveFila={(d) => d.id} columnas={columnasDocs}
              vacio={<Vacio nivel={3} titulo="Aún no has generado documentos este año." texto="Cada informe sale del asistente de 5 pasos." acciones={<Boton flecha="avanza" href="/dashboard/generar">Generar el primero</Boton>} />} />
          </div>
        </Pieza>

        {/* Inicio: secciones numeradas, urgencia, tira, KPI, agentes */}
        <Pieza>
          <p className="k-fecha" style={{ margin: 0 }}><b style={{ color: "var(--ink)", fontWeight: 700 }}>Buenos días, Carlos.</b> Jueves 24 de septiembre de 2026 · semana 39</p>
          <p className="k-h1" style={{ margin: "8px 0 26px" }}>Hoy toca convocar dos asambleas.</p>
          <RotuloIA>Themis sugiere</RotuloIA>
          <div style={{ height: 32 }} />
          <Seccion id="m-s11" numero="01.1" titulo="Vencimientos" nota="ordenados por urgencia"
            enlace={{ href: "/dashboard/calendario", texto: "Abrir bitácora", refIndice: "03" }}>
            <Urgencias>
              <Urgencia nivel="a" n={3} titulo="Vencidas" detalle="Requieren acción hoy" />
              <Urgencia nivel="b" n={2} titulo="Esta semana" detalle="Vie 25 y sáb 26 sep" />
              <Urgencia nivel="c" n={0} titulo="Próximos 30 días" detalle="Nada en 30 días" />
            </Urgencias>
            <div className="muestra-kit" style={{ marginTop: 16, rowGap: 24 }}>
              <ListaObligaciones className="w6a" titulo="Vencidas" conteo={3} etiquetaAccesible="3 obligaciones vencidas">
                <FilaObligacion tipo="vencido" que="Asamblea ordinaria 2026" cuando="Hace 177 días · venció el 31 mar" donde="Conjunto Residencial Los Pinos"
                  accion={{ texto: "Convocar", href: "/dashboard/asistente/themis", etiquetaAccesible: "Convocar: Asamblea ordinaria 2026 · Los Pinos" }} />
                <FilaObligacion tipo="vencido" que="Póliza todo riesgo · áreas comunes" cuando="Hace 6 días · venció el 18 sep" donde="Conjunto Residencial Los Pinos"
                  accion={{ texto: "Renovar", href: "/dashboard/calendario" }} />
                <MasEnLista href="/dashboard/calendario">1 más en la bitácora</MasEnLista>
              </ListaObligaciones>
              <ListaObligaciones className="w6b" titulo="Esta semana" conteo={1} etiquetaAccesible="1 obligación esta semana">
                <TiraSemanal comoItem dias={[
                  { etiqueta: "L", dia: 21, estado: "pasado" }, { etiqueta: "M", dia: 22, estado: "pasado" }, { etiqueta: "M", dia: 23, estado: "pasado" },
                  { etiqueta: "Hoy", dia: 24, estado: "hoy" }, { etiqueta: "V", dia: 25, evento: "Extintores" }, { etiqueta: "S", dia: 26, evento: "Planta eléctrica" }, { etiqueta: "D", dia: 27 },
                ]} />
                <FilaObligacion tipo="semana" que="Revisión de extintores" cuando="Mañana · vie 25 sep" donde="Edificio Mirador 93" />
              </ListaObligaciones>
            </div>
          </Seccion>
          <Seccion id="m-s12" numero="01.2" titulo="Indicadores" nota="KPI y medidor">
            <Kpis>
              <Kpi cifra="38" etiqueta="Documentos generados en 2026" variacion="4 este mes" />
              <Kpi cifra="$ 12.480.000" tamLetra={32} etiqueta="Recaudo del mes" variacion="+4 % frente a agosto" />
              <Kpi cifra="7" alerta etiqueta="Unidades en mora" variacion="2 más que en agosto" malo />
              <Kpi cifra="3" unidad="libres" etiqueta="Generaciones que quedan" />
            </Kpis>
            <div style={{ marginTop: 28, maxWidth: 640 }}>
              <Medidor filas={[{ etiqueta: "Este mes", usado: 12, total: 15 }, { etiqueta: "Hoy", usado: 1, total: 3 }]} />
            </div>
          </Seccion>
          <Seccion id="m-s13" numero="01.3" titulo="Tus agentes" nota="2 activos · 4 en preparación"
            enlace={{ href: "/dashboard/asistente", texto: "Asistente IA", refIndice: "04" }}>
            <div className="muestra-kit" style={{ rowGap: 16 }}>
              <FichaAgente className="w6a" agente="themis" href="/dashboard/asistente/themis" />
              <FichaAgente className="w6b" agente="chronos" href="/dashboard/asistente/chronos"
                sugerencias={<><BotonSugerencia href="/dashboard/asistente/chronos">¿Qué vence antes de diciembre?</BotonSugerencia><BotonSugerencia href="/dashboard/asistente/chronos">Plazos de la asamblea</BotonSugerencia></>} />
              <FichaAgente className="w4a" agente="metra" activo={false} />
              <FichaAgente className="w4b" agente="hermes" activo={false} />
              <div className="w4c" style={{ alignSelf: "center" }}><Escribiendo agente="themis" /></div>
              <FranjaPreparacion className="w12" agentes={["metra", "nomethes", "hermes", "logistes"]} />
            </div>
          </Seccion>
        </Pieza>

        {/* Chat y planes */}
        <Pieza>
          <CabeceraPieza nn="04" titulo="Conversación con Themis" subtitulo="Asistente IA · asesora legal · Ley 675 de 2001" />
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
            <MensajeUsuario autor="Carlos Ramírez" hora="10:42">La asamblea ordinaria de Los Pinos no se hizo en marzo. ¿Qué plazos tengo si la convoco hoy?</MensajeUsuario>
            <RespuestaAgente agente="themis" hora="10:42" meta="2 fuentes"
              acciones={<><Boton flecha="avanza">Redactar convocatoria</Boton><Boton variante="secundario">Agregar a la bitácora</Boton><Boton variante="secundario">Copiar</Boton></>}>
              <div className="k-md">
                <p>La asamblea ordinaria debía reunirse dentro de los tres primeros meses del año<sup>1</sup>. Como esa fecha ya pasó, te recomiendo <strong>convocarla hoy mismo</strong>.</p>
                <table>
                  <caption>Calendario sugerido · Conjunto Residencial Los Pinos</caption>
                  <thead><tr><th>Paso</th><th>Actuación</th><th>Fecha</th></tr></thead>
                  <tbody>
                    <tr><td>1</td><td>Enviar convocatoria a propietarios</td><td>Hoy · jue 24 sep</td></tr>
                    <tr><td>2</td><td>Reunión en primera convocatoria</td><td>Sáb 10 oct</td></tr>
                  </tbody>
                </table>
                <ul><li>Orden del día completo.</li><li>Estados financieros adjuntos.</li></ul>
              </div>
              <ol className="k-notas"><li><sup>1</sup>Ley 675 de 2001, art. 39: reuniones ordinarias y convocatoria.</li></ol>
            </RespuestaAgente>
            <Redactor etiqueta="Mensaje para Themis" placeholder="Escribe tu pregunta a Themis…" valor={texto} alCambiar={setTexto} alEnviar={() => setTexto("")}
              herramientas={<><button type="button"><Flecha tipo="crea" />Adjuntar</button><span>Reglamento de Los Pinos en contexto</span></>} />
            <p className="k-aviso-ia">Themis puede equivocarse: verifica lo importante con la norma citada.</p>
          </div>
          <div className="muestra-kit" style={{ marginTop: 48 }}>
            <TarjetaPlan className="w4a" id="pl-pro" nombre="Pro" para="Para empezar · hasta 3 propiedades" precio="99.900" equivalencia="aprox. USD 24 al mes"
              beneficios={["Hasta 3 propiedades", "15 generaciones al mes (3 por día)", "Themis y Chronos incluidos"]} actual />
            <TarjetaPlan className="w4b" id="pl-bus" nombre="Business" para="Para administradores en crecimiento" precio="299.900" equivalencia="aprox. USD 73 al mes"
              recomendado="Recomendado · de 4 a 10 propiedades"
              beneficios={["Hasta 10 propiedades", "40 generaciones al mes (5 por día)", "Generación en lote"]}
              accion={<Boton flecha="avanza">Cambiar a Business</Boton>} />
            <TarjetaPlan className="w4c" id="pl-eli" nombre="Élite" para="Para grandes administradoras" precio="749.900" equivalencia="aprox. USD 183 al mes"
              beneficios={["Propiedades ilimitadas", "100 generaciones al mes (10 por día)", "Consola multipropiedad"]}
              accion={<Boton variante="secundario" flecha="avanza">Cambiar a Élite</Boton>} />
            <div className="w12"><LeyendaGrafica series={[{ nombre: "Presupuestado", serie: "s1" }, { nombre: "Ejecutado", serie: "s2" }, { nombre: "Proyectado", serie: "s3" }, { nombre: "Año anterior", serie: "s4" }, { nombre: "Excedido", serie: "mal" }]} /></div>
          </div>
        </Pieza>

        {/* Vacíos, en obra, grupos de campos */}
        <Pieza>
          <CabeceraPieza nn="—" titulo="En obra, vacío y sin resultados" subtitulo="Lo que aún no existe se dibuja como un plano; el texto siempre va sobre un sólido" />
          <div className="muestra-kit">
            <EnObra className="w12" nn="05" nombre="Cartera" trae="Cartera por unidad, intereses de mora y paz y salvos."
              accion={<Boton variante="secundario" href="/dashboard/soporte">Escríbenos</Boton>} />
            <div className="w4a"><Vacio nivel={3} titulo="Edificio Parque Central 127 aún no tiene unidades."
              texto="Sube el listado de copropietarios en Excel o PDF y la IA arma la tabla por ti. También puedes agregarlas a mano."
              acciones={<><Boton flecha="avanza">Importar Excel con IA</Boton><Boton variante="secundario">Agregar a mano</Boton></>} /></div>
            <div className="w4b"><SinResultados nivel={3} consulta="905" titulo="No encontramos «905» en Los Pinos."
              texto="Revisa el número o búscala en las otras copropiedades."
              acciones={<><Boton flecha="crea">Agregar la unidad 905</Boton><Boton variante="secundario">Buscar en las 3 copropiedades</Boton><Boton variante="fantasma">Limpiar búsqueda</Boton></>} /></div>
            <div className="w4c"><ErrorCarga nivel={3} titulo="No pudimos cargar las unidades." texto="Revisa tu conexión e inténtalo de nuevo."
              acciones={<Boton variante="secundario">Reintentar</Boton>} /></div>
            <div className="w7">
              <GrupoCampos titulo="Datos de la copropiedad" nota="Así aparece en tus informes y actas.">
                <Campo id="m-g1" etiqueta="Nombre del conjunto o edificio"><Entrada id="m-g1" placeholder="Ej.: Conjunto Residencial Los Pinos" /></Campo>
                <Campo id="m-g2" etiqueta="Dirección"><Entrada id="m-g2" placeholder="Calle 123 # 45-67" /></Campo>
              </GrupoCampos>
            </div>
            <div className="w5 caja-indice">
              <Indice abierto={indice} alCerrar={() => setIndice(false)} idPrincipal="muestra-cab"
                pie={<PieIndice nombre="Carlos Ramírez" correo="demo@phgestion.app" alSalir={() => {}} />}>
                <GrupoIndice letra="A" titulo="Día a día">
                  <ItemIndice n="01" href="/dashboard" actual>Inicio</ItemIndice>
                  <ItemIndice n="02" href="/dashboard/generar" dato={{ texto: "2 por generar", tipo: "pend" }}>Generar</ItemIndice>
                  <ItemIndice n="03" href="/dashboard/calendario" dato={{ texto: "3 vencidas", tipo: "alerta" }}>Bitácora</ItemIndice>
                  <ItemIndice n="04" href="/dashboard/asistente" dato={{ texto: "2 activos", tipo: "tot" }}>Asistente IA</ItemIndice>
                </GrupoIndice>
                <GrupoIndice letra="B" titulo="Finanzas">
                  <ItemIndice n="05" href="/dashboard/cartera" pronto>Cartera</ItemIndice>
                </GrupoIndice>
              </Indice>
            </div>
          </div>
          <div style={{ marginTop: 40 }}><Colofon izquierda="SOPH.IA · propiedad horizontal · Ley 675 de 2001" derecha="Muestra del kit · no se publica" /></div>
        </Pieza>
      </Pagina>

      <Dock alAbrirIndice={() => setIndice(true)} indiceAbierto={indice} destinos={[
        { href: "/dashboard/kit-muestra", etiqueta: "Inicio", actual: true },
        { href: "/dashboard/generar", etiqueta: "Generar", insignia: { n: 2, unidad: "por generar" } },
        { href: "/dashboard/calendario", etiqueta: "Bitácora", insignia: { n: 3, unidad: "vencidas", alerta: true } },
        { href: "/dashboard/asistente", etiqueta: "Asistente" },
      ]} />

      <Modal abierto={modal} alCerrar={() => setModal(false)} titulo="¿Desactivar el portal de la unidad 102?"
        acciones={<><Boton variante="secundario" onClick={() => setModal(false)}>Cancelar</Boton>
          <Boton variante="peligro" lleno onClick={() => { setModal(false); avisar({ tipo: "ok", titulo: "Portal desactivado.", texto: "Unidad 102 · Los Pinos" }); }}>Desactivar portal</Boton></>}>
        <p>Juan Cárdenas dejará de ver sus documentos y su estado de cuenta. Puedes generar un enlace nuevo cuando quieras.</p>
      </Modal>
      <RegionAvisos />
    </div>
  );
}
