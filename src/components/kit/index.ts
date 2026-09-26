/**
 * Kit «Índice» del dashboard de SOPH.IA (design/final/SPEC.md §f).
 * Documentación y patrones de página: design/final/KIT.md.
 *
 * Requisitos del armazón (una sola vez):
 *   - un ancestro con data-shell="app" (activa los tokens; <Armazon> lo pone),
 *   - import "@/components/kit/fuentes" (Archivo + IBM Plex Mono autoalojadas),
 *   - <RegionAvisos /> montado para que avisar() se vea.
 * Las clases k-* viven al final de src/app/globals.css (no hay kit.css que importar).
 */
export { Boton, BotonIcono, BotonFila, EnlaceVer, type VarianteBoton } from "./Boton";
export { Flecha, Chevron, Lupa, Cruz } from "./Iconos";
export { Campo, Entrada, AreaTexto, Selector, Buscador, GrupoCampos } from "./Campo";
export { Casilla, Opcion, Interruptor } from "./Casilla";
export { Estado, Cuadro, Insignia, Categoria, TipoArchivo, type TipoEstado } from "./Estado";
export { Pagina, Pieza, CabeceraPieza, Seccion, Panel, Reticula, Colofon } from "./Pagina";
export {
  Urgencia, Urgencias, TiraSemanal, FilaObligacion, ListaObligaciones, MasEnLista, type DiaTira,
} from "./Urgencia";
export { Kpi, Kpis, Medidor } from "./Kpi";
export {
  Tabla, AccionesFila, BarraLote, BotonLote, PieTabla, Paginacion,
  type ColumnaTabla, type Seleccion, type Agrupacion,
} from "./Tabla";
export { MenuMas, type ItemMenu } from "./Menu";
export { Segmentos, PestanasUnidas, type ItemPestana } from "./Pestanas";
export { Pasos, NavPasos, type PasoAsistente } from "./Pasos";
export { ZonaSubida, ListaArchivos, FilaArchivo } from "./Subida";
export { BarraProgreso, ProgresoGeneracion, type EtapaGeneracion } from "./Progreso";
export { Vacio, SinResultados, ErrorCarga } from "./Vacio";
export { Modal } from "./Modal";
export { Aviso, RegionAvisos, avisar, quitarAviso, EnlaceAviso, type TipoAviso, type AccionAviso } from "./Aviso";
export { Esqueleto } from "./Esqueleto";
export {
  Sigilo, FichaAgente, FranjaPreparacion, RotuloIA, Escribiendo, BotonSugerencia, AGENTES, type AgenteId,
} from "./Sigilo";
export { EnObra } from "./EnObra";
export { MensajeUsuario, RespuestaAgente, Redactor } from "./Chat";
export { TarjetaPlan, LeyendaGrafica } from "./Plan";
export {
  Armazon, Marca, Indice, GrupoIndice, ItemIndice, PieIndice, SelectorTema, CabeceraApp, Cornisa, Dock,
  type CopropiedadCornisa, type DestinoDock,
} from "./Armazon";
export { unir, nombreCorto, pesoLegible, tipoDeArchivo } from "./util";
