import type { ReactNode } from "react";
import { isValidElement } from "react";
import {
  ArrowLeft, ArrowRight, ArrowRightLeft, Award, BadgeCheck, Bell, Building2, CalendarClock, CalendarPlus, Check, Copy,
  CreditCard, Crown, Download, ExternalLink, Eye, Eraser, FilePlus2, FilterX, Gavel, History, House, KeyRound,
  Landmark, Layers, LifeBuoy, Link2, LogOut, Mail, Megaphone, MessageCircle, MessageSquareText, Mic, Pencil,
  PiggyBank, Play, Plus, Power, Printer, RefreshCw, RotateCcw, Rocket, Save, Search, Send, Settings, SkipForward,
  Sparkles, Square, Trash2, Upload, UserPlus, Users, Wallet, X, Paperclip, PenLine, Undo2, Phone,
  type LucideIcon,
} from "lucide-react";

/**
 * Sistema de significado de la interfaz «Guía»: cada función tiene SU icono y
 * SU color (siempre los mismos, en el menú, en la cabecera de la pantalla y en
 * el dock) y cada acción se reconoce por un icono y un color de intención.
 * Los tonos son los 13 de globals.css (`--c-<tono>-*`); `data-h="<tono>"` los aplica.
 */
export type Tono =
  | "violet" | "blue" | "sky" | "teal" | "green" | "lime" | "amber" | "orange" | "red"
  | "pink" | "fuchsia" | "indigo" | "slate" | "ai";

export type ClaveModulo =
  | "inicio" | "generar" | "bitacora" | "asistente" | "cartera" | "presupuesto" | "residentes" | "pqrs"
  | "comunicados" | "asambleas" | "certificados" | "propiedades" | "historial" | "suscripcion" | "configuracion"
  | "soporte" | "onboarding" | "portafolio" | "generarLote" | "propiedadesEmpresa";

export type Modulo = {
  clave: ClaveModulo;
  nombre: string;
  href: string;
  icono: LucideIcon;
  tono: Tono;
  /** Qué hace, en una frase llana (sirve de ayuda y de descripción). */
  queHace: string;
  /** Rutas adicionales que pertenecen a esta función. */
  alias?: string[];
};

export const MODULOS: Record<ClaveModulo, Modulo> = {
  inicio: { clave: "inicio", nombre: "Inicio", href: "/dashboard", icono: House, tono: "violet", queHace: "Lo que necesita tu atención hoy." },
  generar: { clave: "generar", nombre: "Generar", href: "/dashboard/generar", icono: FilePlus2, tono: "blue", queHace: "Crea actas e informes en minutos." },
  bitacora: { clave: "bitacora", nombre: "Bitácora", href: "/dashboard/calendario", icono: CalendarClock, tono: "orange", queHace: "Vencimientos legales y mantenimientos." },
  asistente: { clave: "asistente", nombre: "Asistente IA", href: "/dashboard/asistente", icono: Sparkles, tono: "ai", queHace: "Agentes de IA que trabajan por ti." },
  cartera: { clave: "cartera", nombre: "Cartera", href: "/dashboard/cartera", icono: Wallet, tono: "green", queHace: "Quién debe y cuánto." },
  presupuesto: { clave: "presupuesto", nombre: "Presupuesto", href: "/dashboard/presupuesto", icono: PiggyBank, tono: "lime", queHace: "Lo presupuestado y lo gastado." },
  residentes: { clave: "residentes", nombre: "Residentes", href: "/dashboard/residentes", icono: Users, tono: "sky", queHace: "Unidades y su portal de consulta." },
  pqrs: { clave: "pqrs", nombre: "PQRS", href: "/dashboard/pqrs", icono: MessageSquareText, tono: "pink", queHace: "Peticiones, quejas y reclamos." },
  comunicados: { clave: "comunicados", nombre: "Comunicados", href: "/dashboard/comunicados", icono: Megaphone, tono: "amber", queHace: "Avisos para toda la copropiedad." },
  asambleas: { clave: "asambleas", nombre: "Asambleas", href: "/dashboard/asambleas", icono: Landmark, tono: "fuchsia", queHace: "Convocatorias, quórum y actas." },
  certificados: { clave: "certificados", nombre: "Certificados", href: "/dashboard/certificados", icono: BadgeCheck, tono: "teal", queHace: "Paz y salvo y certificaciones." },
  propiedades: { clave: "propiedades", nombre: "Propiedades", href: "/dashboard/propiedades", icono: Building2, tono: "blue", queHace: "Tus copropiedades y sus datos." },
  historial: { clave: "historial", nombre: "Historial", href: "/dashboard/historial", icono: History, tono: "slate", queHace: "Todos los documentos que has creado." },
  suscripcion: { clave: "suscripcion", nombre: "Suscripción", href: "/dashboard/suscripcion", icono: CreditCard, tono: "teal", queHace: "Tu plan, tu uso y tus pagos.", alias: ["/dashboard/epayco"] },
  configuracion: { clave: "configuracion", nombre: "Configuración", href: "/dashboard/configuracion", icono: Settings, tono: "indigo", queHace: "Tu perfil, tu marca y la apariencia." },
  soporte: { clave: "soporte", nombre: "Ayuda y soporte", href: "/dashboard/soporte", icono: LifeBuoy, tono: "sky", queHace: "Escríbenos si algo no funciona." },
  onboarding: { clave: "onboarding", nombre: "Primeros pasos", href: "/dashboard/onboarding", icono: Rocket, tono: "violet", queHace: "Deja lista tu cuenta en cuatro pasos." },
  portafolio: { clave: "portafolio", nombre: "Portafolio", href: "/empresa", icono: Crown, tono: "amber", queHace: "Todas tus copropiedades de un vistazo." },
  generarLote: { clave: "generarLote", nombre: "Generar en lote", href: "/empresa/generar", icono: Layers, tono: "blue", queHace: "Los informes del mes de todas tus propiedades." },
  propiedadesEmpresa: { clave: "propiedadesEmpresa", nombre: "Propiedades", href: "/empresa/propiedades", icono: Building2, tono: "indigo", queHace: "Las copropiedades de tu portafolio." },
};

const RAICES = new Set(["/dashboard", "/empresa"]);
const CANDIDATOS = Object.values(MODULOS)
  .flatMap((m) => [m.href, ...(m.alias ?? [])].map((ruta) => ({ ruta, m })))
  .sort((a, b) => b.ruta.length - a.ruta.length);

/** La función a la que pertenece una ruta (o null fuera de las pantallas conocidas). */
export function moduloDe(pathname: string | null | undefined): Modulo | null {
  const p = pathname || "";
  for (const { ruta, m } of CANDIDATOS) {
    if (p === ruta || (!RAICES.has(ruta) && p.startsWith(`${ruta}/`))) return m;
  }
  return null;
}

/** Texto plano de un nodo de React (para reconocer el verbo de un botón). */
export function textoDe(nodo: ReactNode): string {
  if (nodo == null || typeof nodo === "boolean") return "";
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoDe).join("");
  if (isValidElement<{ children?: ReactNode }>(nodo)) return textoDe(nodo.props.children);
  return "";
}

export type IconoAccion = { Icono: LucideIcon; tono: Tono; fin?: boolean };
type Regla = { re: RegExp; icono: LucideIcon; tono: Tono; fin?: boolean };

/**
 * Reglas para reconocer la acción por su verbo (en español, sin tildes). La
 * primera que coincide gana: primero frases con sentido propio, luego el verbo
 * inicial. Un botón puede fijar su icono y tono a mano (`icono`, `tono`).
 */
const REGLAS: Regla[] = [
  { re: /cerrar sesion|^salir/, icono: LogOut, tono: "red" },
  { re: /contrasena|\bclave\b/, icono: KeyRound, tono: "indigo" },
  { re: /whatsapp/, icono: MessageCircle, tono: "green" },
  { re: /^copiar/, icono: Copy, tono: "slate" },
  { re: /correo|e-?mail/, icono: Mail, tono: "teal" },
  { re: /filtro/, icono: FilterX, tono: "slate" },
  { re: /^limpiar/, icono: Eraser, tono: "slate" },
  { re: /^(chat|escribe|contact|hablar)/, icono: MessageCircle, tono: "sky" },
  { re: /^(llamar)/, icono: Phone, tono: "green" },
  { re: /^(generar|redactar|mejorar|sugerir|analizar|resumir|preparar)\b/, icono: Sparkles, tono: "ai" },
  { re: /con (ia|themis|chronos|metra|nomethes|hermes|logistes)\b/, icono: Sparkles, tono: "ai" },
  { re: /^(nuevo|nueva|agregar|anadir|crear|registrar|sumar)\b/, icono: Plus, tono: "green" },
  { re: /^(invitar)/, icono: UserPlus, tono: "teal" },
  { re: /^(guardar|conservar)/, icono: Save, tono: "violet" },
  { re: /^(continuar|siguiente|avanzar|seguir|ir\b)/, icono: ArrowRight, tono: "violet", fin: true },
  { re: /^(volver|atras|anterior|regresar)/, icono: ArrowLeft, tono: "slate" },
  { re: /^(descargar|exportar|bajar)/, icono: Download, tono: "blue" },
  { re: /^(imprimir|abrir e imprimir)/, icono: Printer, tono: "slate" },
  { re: /^(abrir)/, icono: ExternalLink, tono: "blue" },
  { re: /^(ver|revisar|consultar|mostrar)\b/, icono: Eye, tono: "blue" },
  { re: /^adjuntar/, icono: Paperclip, tono: "sky" },
  { re: /^(importar|subir|cargar|anadir archivo)/, icono: Upload, tono: "sky" },
  { re: /^(enviar|compartir|convocar|notificar|publicar|remitir)/, icono: Send, tono: "teal" },
  { re: /^(programar|agendar)/, icono: CalendarPlus, tono: "orange" },
  { re: /^(editar|modificar|renombrar)/, icono: Pencil, tono: "amber" },
  { re: /^(cambiar)/, icono: ArrowRightLeft, tono: "amber" },
  { re: /^(firmar)/, icono: PenLine, tono: "indigo" },
  { re: /^(eliminar|borrar|quitar quitar|quitar)\b/, icono: Trash2, tono: "red" },
  { re: /^(desactivar|deshabilitar|pausar)/, icono: Power, tono: "red" },
  { re: /^(activar|habilitar)/, icono: Power, tono: "green" },
  { re: /^(cancelar|cerrar|omitir por|ahora no|descartar|no,|rechazar)/, icono: X, tono: "slate" },
  { re: /^(omitir)/, icono: SkipForward, tono: "slate" },
  { re: /^(reintentar|intentar|renovar|actualizar|recargar|reiniciar|refrescar)/, icono: RefreshCw, tono: "blue" },
  { re: /^(restablecer|usar el predeterminado|usar)/, icono: RotateCcw, tono: "slate" },
  { re: /^(deshacer)/, icono: Undo2, tono: "slate" },
  { re: /^(buscar|filtrar|encontrar)/, icono: Search, tono: "slate" },
  { re: /^(pagar|suscribir|contratar|comprar|mejorar plan|elegir plan|adquirir)/, icono: CreditCard, tono: "green" },
  { re: /^(aplicar|confirmar|aprobar|aceptar|terminar|finalizar|completar|marcar|listo|entendido|hecho)/, icono: Check, tono: "green" },
  { re: /^(iniciar|empezar|comenzar|activar prueba)/, icono: Play, tono: "violet" },
  { re: /^(grabar)/, icono: Mic, tono: "red" },
  { re: /^(detener|parar)/, icono: Square, tono: "red" },
  { re: /^(avisar|recordar|recordatorio)/, icono: Bell, tono: "orange" },
  { re: /^(vincular|enlazar)/, icono: Link2, tono: "blue" },
];

/** Módulos que se nombran en el propio botón («Ver propiedades», «Ir al historial»): llevan SU icono. */
const NOMBRES_MODULO: Array<[RegExp, ClaveModulo]> = [
  [/\bpropiedades\b/, "propiedades"], [/\bresidentes\b/, "residentes"], [/\bhistorial\b/, "historial"],
  [/\bbitacora\b/, "bitacora"], [/\bplanes\b|\bsuscripcion\b/, "suscripcion"], [/\bagentes\b|\basistente\b/, "asistente"],
  [/\bsoporte\b|\btickets\b/, "soporte"], [/\bconfiguracion\b/, "configuracion"],
];

const normaliza = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^[^a-z0-9]+/, "").replace(/\s+/g, " ").trim();

/**
 * Icono y tono que corresponden a lo que hace un botón, según su texto.
 * Siempre devuelve uno (flecha violeta al final si no reconoce el verbo).
 */
export function iconoDeAccion(texto: string): IconoAccion {
  const t = normaliza(texto);
  if (/^(ver|ir|abrir|volver a)\b/.test(t) && !/^volver al inicio|^volver$/.test(t)) {
    for (const [re, clave] of NOMBRES_MODULO) {
      if (re.test(t)) { const m = MODULOS[clave]; return { Icono: m.icono, tono: m.tono }; }
    }
  }
  if (/^historial$/.test(t)) return { Icono: MODULOS.historial.icono, tono: MODULOS.historial.tono };
  for (const r of REGLAS) {
    if (r.re.test(t)) return { Icono: r.icono, tono: r.tono, fin: r.fin };
  }
  return { Icono: ArrowRight, tono: "violet", fin: true };
}
