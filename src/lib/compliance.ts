// Compliance calendar rules engine.
//
// Pure functions — no DB, no AI. Auto items are derived from each property's
// building profile (Property.features) plus fixed legal obligations (Ley 675
// and related norms). The API layer merges these with ComplianceRecord rows
// (done/dismissed marks + custom items) and with Generation data (monthly
// report status).

export interface BuildingFeatures {
  ascensor?: boolean;
  piscina?: boolean;
  plantaElectrica?: boolean;
  gimnasio?: boolean;
  empleadosDirectos?: boolean;
  /** "YYYY-MM-DD" — next/last known expiry of the common-areas insurance. */
  polizaVence?: string | null;
}

export type ComplianceCategory =
  | "legal"
  | "poliza"
  | "mantenimiento"
  | "sgsst"
  | "finanzas"
  | "informe"
  | "asamblea"
  | "custom";

export const CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  legal: "Legal",
  poliza: "Póliza",
  mantenimiento: "Mantenimiento",
  sgsst: "SG-SST",
  finanzas: "Finanzas",
  informe: "Informe",
  asamblea: "Asamblea",
  custom: "Recordatorio",
};

export interface AutoItem {
  key: string;
  title: string;
  description: string;
  category: ComplianceCategory;
  /** ISO date "YYYY-MM-DD" (local, no time component). */
  dueDate: string;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Days from `from` (today) to the ISO date. Negative = overdue. */
export function daysUntil(dueDate: string, from: Date): number {
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((due.getTime() - base.getTime()) / 86400000);
}

const WINDOW_PAST_DAYS = 180; // keep overdue items visible for 6 months
const WINDOW_FUTURE_DAYS = 365;

/**
 * Auto obligations for one property, filtered to the visibility window
 * [today - 180d, today + 365d]. Keys are stable across runs so completion
 * marks (ComplianceRecord.itemKey) survive.
 */
export function generateAutoItems(
  features: BuildingFeatures | null | undefined,
  today: Date
): AutoItem[] {
  const f = features || {};
  const items: AutoItem[] = [];
  const years = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];

  for (const y of years) {
    // Asamblea ordinaria — dentro de los 3 primeros meses del año (Art. 39, Ley 675).
    items.push({
      key: `asamblea-${y}`,
      title: `Asamblea ordinaria ${y}`,
      description:
        "Celebrar la asamblea general ordinaria dentro de los tres (3) primeros meses del año (Art. 39, Ley 675 de 2001). La convocatoria debe enviarse con mínimo 15 días calendario de antelación.",
      category: "legal",
      dueDate: iso(y, 3, 31),
    });

    // Presupuesto del año siguiente + fondo de imprevistos (Art. 35: mínimo 1%).
    items.push({
      key: `presupuesto-${y}`,
      title: `Preparar presupuesto ${y + 1}`,
      description:
        "Elaborar el proyecto de presupuesto del próximo año para aprobación de la asamblea, incluyendo el fondo de imprevistos (mínimo 1% del presupuesto anual — Art. 35, Ley 675).",
      category: "finanzas",
      dueDate: iso(y, 12, 15),
    });

    if (f.ascensor) {
      items.push({
        key: `ascensor-${y}`,
        title: `Certificación de ascensores ${y}`,
        description:
          "Inspección y certificación anual de ascensores por organismo acreditado (NTC 5926 y norma local aplicable).",
        category: "mantenimiento",
        dueDate: iso(y, 12, 31),
      });
    }

    if (f.piscina) {
      items.push({
        key: `piscina-${y}`,
        title: `Cumplimiento normativo de piscina ${y}`,
        description:
          "Verificar cumplimiento de la Ley 1209 de 2008 (seguridad en piscinas): certificado, dispositivos de seguridad, personal y registros al día.",
        category: "mantenimiento",
        dueDate: iso(y, 12, 31),
      });
    }

    if (f.plantaElectrica) {
      items.push(
        {
          key: `planta-${y}-s1`,
          title: `Mantenimiento planta eléctrica (1er semestre ${y})`,
          description:
            "Mantenimiento preventivo semestral de la planta eléctrica de emergencia (pruebas de carga, combustible, baterías).",
          category: "mantenimiento",
          dueDate: iso(y, 6, 30),
        },
        {
          key: `planta-${y}-s2`,
          title: `Mantenimiento planta eléctrica (2do semestre ${y})`,
          description:
            "Mantenimiento preventivo semestral de la planta eléctrica de emergencia (pruebas de carga, combustible, baterías).",
          category: "mantenimiento",
          dueDate: iso(y, 12, 31),
        }
      );
    }

    if (f.empleadosDirectos) {
      items.push({
        key: `sgsst-${y}`,
        title: `Autoevaluación SG-SST ${y}`,
        description:
          "Realizar la autoevaluación anual del Sistema de Gestión de Seguridad y Salud en el Trabajo (Resolución 0312 de 2019 / Decreto 1072 de 2015) para empleados directos de la copropiedad.",
        category: "sgsst",
        dueDate: iso(y, 12, 31),
      });
    }

    // Renovación de póliza de zonas comunes (Art. 15: incendio y terremoto).
    if (f.polizaVence) {
      const parts = f.polizaVence.split("-").map(Number);
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
        const [, pm, pd] = parts;
        const day = Math.min(pd, lastDayOfMonth(y, pm));
        items.push({
          key: `poliza-${y}`,
          title: `Renovar póliza de zonas comunes ${y}`,
          description:
            "Renovar el seguro de zonas comunes contra incendio y terremoto (obligatorio — Art. 15, Ley 675 de 2001). Cotiza con antelación para comparar coberturas.",
          category: "poliza",
          dueDate: iso(y, pm, day),
        });
      }
    }
  }

  return items.filter((it) => {
    const d = daysUntil(it.dueDate, today);
    return d >= -WINDOW_PAST_DAYS && d <= WINDOW_FUTURE_DAYS;
  });
}

/**
 * The current month's management-report item. Marked done automatically by the
 * API when a completed Generation exists for (property, month, year).
 */
export function monthlyReportItem(today: Date): AutoItem {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const monthName = today.toLocaleDateString("es-CO", { month: "long" });
  return {
    key: `informe-${y}-${m}`,
    title: `Informe de gestión de ${monthName}`,
    description:
      "Generar el informe de gestión del mes para la copropiedad. Se marca automáticamente al completar una generación en SOPH.IA.",
    category: "informe",
    dueDate: iso(y, m, lastDayOfMonth(y, m)),
  };
}

// ── Assembly-derived deadlines (Ley 675) ────────────────────────────────────

/** Add n business days (Mon–Fri) to a date. Ignores Colombian holidays, which
 *  makes the computed deadline slightly EARLIER than the legal one — a
 *  conservative reminder, never a late one. */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d;
}

function toIso(d: Date): string {
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export interface AssemblyLike {
  id: string;
  type: string; // "ordinaria" | "extraordinaria"
  date: Date;
  status: string; // "convocada" | "realizada" | "cancelada"
  convokedAt: Date | null;
  actaReadyAt: Date | null;
}

export interface AssemblyDerivedItem extends AutoItem {
  /** Marked done automatically from the assembly record itself. */
  autoDone: boolean;
}

/** Legal deadlines derived from an assembly (skips cancelled ones):
 *  - ordinaria: enviar convocatoria ≥15 días calendario antes (Art. 39).
 *  - acta disponible dentro de los 20 días hábiles siguientes (Art. 47).
 *  - ventana de impugnación: 2 meses desde la reunión (Art. 49). */
export function assemblyItems(a: AssemblyLike, today: Date): AssemblyDerivedItem[] {
  if (a.status === "cancelada") return [];
  const items: AssemblyDerivedItem[] = [];
  const meetingDay = new Date(a.date.getFullYear(), a.date.getMonth(), a.date.getDate());
  const dateLabel = meetingDay.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
  });

  if (a.type === "ordinaria") {
    const convDue = new Date(meetingDay);
    convDue.setDate(convDue.getDate() - 15);
    items.push({
      key: `asamblea-conv-${a.id}`,
      title: `Enviar convocatoria (asamblea del ${dateLabel})`,
      description:
        "La convocatoria a asamblea ordinaria debe enviarse con una antelación no inferior a 15 días calendario (Art. 39, Ley 675 de 2001).",
      category: "asamblea",
      dueDate: toIso(convDue),
      autoDone: !!a.convokedAt,
    });
  }

  const meetingPassed = meetingDay.getTime() <= today.getTime();
  if (meetingPassed || a.status === "realizada") {
    items.push({
      key: `asamblea-acta-${a.id}`,
      title: `Publicar acta (asamblea del ${dateLabel})`,
      description:
        "El acta debe estar disponible para los propietarios dentro de los 20 días hábiles siguientes a la reunión (Art. 47, Ley 675 de 2001).",
      category: "asamblea",
      dueDate: toIso(addBusinessDays(meetingDay, 20)),
      autoDone: !!a.actaReadyAt,
    });

    const impugEnd = new Date(meetingDay);
    impugEnd.setMonth(impugEnd.getMonth() + 2);
    items.push({
      key: `asamblea-impug-${a.id}`,
      title: `Fin de ventana de impugnación (asamblea del ${dateLabel})`,
      description:
        "Las decisiones de la asamblea pueden impugnarse judicialmente dentro de los 2 meses siguientes (Art. 49, Ley 675 de 2001). Conserva acta, convocatoria y listado de asistencia.",
      category: "asamblea",
      dueDate: toIso(impugEnd),
      autoDone: false,
    });
  }

  return items.filter((it) => {
    const d = daysUntil(it.dueDate, today);
    return d >= -WINDOW_PAST_DAYS && d <= WINDOW_FUTURE_DAYS;
  });
}

/** Parse Property.features (Json column) defensively. */
export function parseFeatures(raw: unknown): BuildingFeatures {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  return {
    ascensor: o.ascensor === true,
    piscina: o.piscina === true,
    plantaElectrica: o.plantaElectrica === true,
    gimnasio: o.gimnasio === true,
    empleadosDirectos: o.empleadosDirectos === true,
    polizaVence:
      typeof o.polizaVence === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.polizaVence)
        ? o.polizaVence
        : null,
  };
}
