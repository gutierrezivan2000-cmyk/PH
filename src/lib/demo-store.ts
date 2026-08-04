/**
 * Demo in-memory store — simulates database for demo mode.
 * Data is seeded on startup and resets when the server restarts.
 * DEMO_MODE=true bypasses all external services.
 */

export const DEMO_USER = {
  id: "demo-user-001",
  name: "Carlos Ramirez",
  email: "demo@phgestion.app",
  image: "https://ui-avatars.com/api/?name=Carlos+R&background=1e40af&color=fff&size=64",
};

export interface DemoProperty {
  id: string;
  userId: string;
  name: string;
  address: string | null;
  city: string | null;
  units: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemoGeneration {
  id: string;
  userId: string;
  propertyId: string;
  type: string;
  status: string;
  month: number;
  year: number;
  inputFiles: object[];
  inputText: string | null;
  outputFiles: Record<string, string> | null;
  tokensUsed: number;
  costUsd: number;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
  property: DemoProperty;
}

// ---- Seeded properties ----
const seededProperties: DemoProperty[] = [
  {
    id: "prop-demo-001",
    userId: DEMO_USER.id,
    name: "Conjunto Residencial Los Pinos",
    address: "Carrera 45 # 23-67",
    city: "Bogota",
    units: 120,
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  },
  {
    id: "prop-demo-002",
    userId: DEMO_USER.id,
    name: "Torres del Rio",
    address: "Calle 80 # 55-12",
    city: "Medellin",
    units: 80,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  },
];

// ---- Seeded historical generations ----
const seededGenerations: DemoGeneration[] = [
  {
    id: "gen-demo-feb-001",
    userId: DEMO_USER.id,
    propertyId: "prop-demo-001",
    type: "full",
    status: "completed",
    month: 2,
    year: 2026,
    inputFiles: [{ name: "informe-feb.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }],
    inputText: null,
    outputFiles: {
      informeHtml: "/api/demo/files/gen-demo-feb-001/informe",
      actaHtml: "/api/demo/files/gen-demo-feb-001/acta",
      presentacionPptx: "/api/demo/files/gen-demo-feb-001/pptx",
    },
    tokensUsed: 14320,
    costUsd: 0.18,
    errorMessage: null,
    createdAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000 + 45000),
    property: seededProperties[0],
  },
  {
    id: "gen-demo-jan-001",
    userId: DEMO_USER.id,
    propertyId: "prop-demo-001",
    type: "full",
    status: "completed",
    month: 1,
    year: 2026,
    inputFiles: [{ name: "novedades-enero.txt", type: "text/plain" }],
    inputText: null,
    outputFiles: {
      informeHtml: "/api/demo/files/gen-demo-jan-001/informe",
      actaHtml: "/api/demo/files/gen-demo-jan-001/acta",
      presentacionPptx: "/api/demo/files/gen-demo-jan-001/pptx",
    },
    tokensUsed: 12850,
    costUsd: 0.16,
    errorMessage: null,
    createdAt: new Date(Date.now() - 58 * 24 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 58 * 24 * 60 * 60 * 1000 + 38000),
    property: seededProperties[0],
  },
];

// ---- Mutable store (module-level singleton) ----
const _store = {
  properties: [...seededProperties],
  generations: [...seededGenerations],
  // In-memory file buffers: generationId -> { informe, acta, pptx }
  fileBuffers: {} as Record<string, {
    informeHtml?: string;
    actaHtml?: string;
    presentacionPptx?: Buffer;
  }>,
};

// --- Properties ---
export function getProperties(userId: string): DemoProperty[] {
  return _store.properties.filter((p) => p.userId === userId);
}

export function createProperty(data: {
  userId: string;
  name: string;
  address?: string;
  city?: string;
  units?: number | null;
}): DemoProperty {
  const prop: DemoProperty = {
    id: `prop-${Date.now()}`,
    userId: data.userId,
    name: data.name,
    address: data.address ?? null,
    city: data.city ?? null,
    units: data.units ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  _store.properties.push(prop);
  return prop;
}

export function deleteProperty(id: string, userId: string): void {
  _store.properties = _store.properties.filter((p) => !(p.id === id && p.userId === userId));
}

export function getPropertyById(id: string, userId: string): DemoProperty | undefined {
  return _store.properties.find((p) => p.id === id && p.userId === userId);
}

export function updateProperty(
  id: string,
  userId: string,
  data: { name?: string; address?: string; city?: string; units?: number | null }
): DemoProperty | undefined {
  const idx = _store.properties.findIndex((p) => p.id === id && p.userId === userId);
  if (idx === -1) return undefined;
  _store.properties[idx] = {
    ..._store.properties[idx],
    ...data,
    updatedAt: new Date(),
  };
  return _store.properties[idx];
}

// --- Generations ---
export function getGenerations(userId: string): DemoGeneration[] {
  return _store.generations
    .filter((g) => g.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function getGenerationById(id: string, userId: string): DemoGeneration | undefined {
  return _store.generations.find((g) => g.id === id && g.userId === userId);
}

export function createGeneration(data: Omit<DemoGeneration, "id" | "createdAt" | "completedAt">): DemoGeneration {
  const gen: DemoGeneration = {
    ...data,
    id: `gen-${Date.now()}`,
    createdAt: new Date(),
    completedAt: null,
  };
  _store.generations.push(gen);
  return gen;
}

export function updateGeneration(id: string, update: Partial<DemoGeneration>): void {
  const idx = _store.generations.findIndex((g) => g.id === id);
  if (idx !== -1) {
    _store.generations[idx] = { ..._store.generations[idx], ...update };
  }
}

// --- File buffers ---
export function saveFileBuffers(
  generationId: string,
  files: { informeHtml?: string; actaHtml?: string; presentacionPptx?: Buffer }
): void {
  _store.fileBuffers[generationId] = files;
}

export function getFileBuffers(generationId: string) {
  return _store.fileBuffers[generationId];
}

// --- Usage ---
export function getUsageSummary(userId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const monthlyGenerations = _store.generations.filter(
    (g) => g.userId === userId && g.createdAt >= startOfMonth && g.status === "completed"
  ).length;

  const dailyGenerations = _store.generations.filter(
    (g) => g.userId === userId && g.createdAt >= startOfDay && g.status === "completed"
  ).length;

  return {
    monthlyGenerations,
    dailyGenerations,
    monthlyTokens: monthlyGenerations * 13000,
    monthlyCost: monthlyGenerations * 0.17,
    limits: { generationsPerDay: 3, generationsPerMonth: 15 },
  };
}

export function checkUsageLimitDemo(userId: string): { allowed: boolean; reason?: string } {
  const usage = getUsageSummary(userId);
  if (usage.dailyGenerations >= 3) {
    return { allowed: false, reason: "Has alcanzado el limite diario de 3 generaciones." };
  }
  if (usage.monthlyGenerations >= 15) {
    return { allowed: false, reason: "Has alcanzado el limite mensual de 15 generaciones." };
  }
  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────
// Cartera / residentes demo fixtures (F2–F3).
// The demo is a SALES surface: showing Cartera, Residentes and Presupuesto
// completely empty sold nothing and made the product look unfinished. These
// fixtures give a prospect a realistic building to explore.
// ─────────────────────────────────────────────────────────────────────

export interface DemoUnit {
  id: string;
  propertyId: string;
  label: string;
  residentName: string | null;
  email: string | null;
  phone: string | null;
  coeficiente: number | null;
  monthlyFee: number | null;
  portalToken: string | null;
  /** charged - paid, in COP. Positive = owes. */
  balance: number;
  overdueAmount: number;
  overdueDays: number;
  lastPaymentAt: string | null;
}

const FEE = 350000;
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function mkUnit(
  n: number,
  name: string,
  opts: { balance?: number; overdueDays?: number; lastPay?: number; noEmail?: boolean } = {}
): DemoUnit {
  const balance = opts.balance ?? 0;
  const overdueDays = opts.overdueDays ?? 0;
  return {
    id: `unit-demo-${n}`,
    propertyId: "prop-demo-001",
    label: `Apto ${n}`,
    residentName: name,
    email: opts.noEmail ? null : `${name.split(" ")[0].toLowerCase()}@correo.com`,
    phone: `30${(10000000 + n * 137).toString().slice(0, 8)}`,
    coeficiente: Number((0.7 + (n % 9) * 0.06).toFixed(2)),
    monthlyFee: FEE,
    portalToken: `demo${String(n).padStart(3, "0")}TokenPortal${n}`,
    balance,
    overdueAmount: overdueDays > 0 ? balance : 0,
    overdueDays,
    lastPaymentAt: opts.lastPay != null ? daysAgo(opts.lastPay) : null,
  };
}

const seededUnits: DemoUnit[] = [
  mkUnit(101, "María Restrepo", { lastPay: 4 }),
  mkUnit(102, "Juan Cárdenas", { balance: FEE, overdueDays: 12, lastPay: 42 }),
  mkUnit(103, "Ana Lucía Peña", { lastPay: 9 }),
  mkUnit(201, "Carlos Mejía", { balance: FEE * 3, overdueDays: 74, lastPay: 96 }),
  mkUnit(202, "Sofía Villamil", { balance: -120000, lastPay: 2 }),
  mkUnit(203, "Diego Ramírez", { lastPay: 15 }),
  mkUnit(301, "Laura Ochoa", { balance: FEE * 2, overdueDays: 41, lastPay: 63 }),
  mkUnit(302, "Andrés Gil", { lastPay: 6, noEmail: true }),
  mkUnit(303, "Paula Jaramillo", { balance: FEE, overdueDays: 5, lastPay: 38 }),
  mkUnit(401, "Ricardo Suárez", { balance: FEE * 5, overdueDays: 118, lastPay: 140 }),
  mkUnit(402, "Camila Torres", { lastPay: 11 }),
  mkUnit(403, "Felipe Arango", { lastPay: 20 }),
];

export function getDemoUnits(propertyId: string): DemoUnit[] {
  return propertyId === "prop-demo-001" ? seededUnits : [];
}

/** KPI block matching what /api/cartera computes from real data. */
export function getDemoCarteraKpis(propertyId: string) {
  const units = getDemoUnits(propertyId);
  return {
    totalOwed: units.reduce((s, u) => s + Math.max(0, u.balance), 0),
    overdueUnits: units.filter((u) => u.overdueDays > 0 && u.balance > 0).length,
    collectedThisMonth: 4 * FEE + 180000,
    chargedThisMonth: units.length * FEE,
    unitsCount: units.length,
  };
}

// ── Presupuesto ──────────────────────────────────────────────────────
const B = (id: string, concept: string, group: "ingreso" | "gasto", budgeted: number) => ({
  id,
  concept,
  group,
  budgeted,
});

const seededBudgetItems = [
  B("bi-cuotas", "Cuotas de administración", "ingreso", 50_400_000),
  B("bi-parq", "Parqueaderos y zonas comunes", "ingreso", 4_800_000),
  B("bi-int", "Intereses de mora", "ingreso", 1_200_000),
  B("bi-vig", "Vigilancia", "gasto", 21_600_000),
  B("bi-aseo", "Aseo y jardinería", "gasto", 9_600_000),
  B("bi-serv", "Servicios públicos zonas comunes", "gasto", 8_400_000),
  B("bi-admin", "Honorarios de administración", "gasto", 7_200_000),
  B("bi-mant", "Mantenimiento y reparaciones", "gasto", 6_000_000),
  B("bi-seg", "Seguros (póliza área común)", "gasto", 2_400_000),
];

/** Ledger movements — deliberately mixed so execution lands under, on and OVER budget. */
const seededLedger = [
  // ingresos
  ["bi-cuotas", "ingreso", 4_180_000, "Recaudo de cuotas", 4],
  ["bi-cuotas", "ingreso", 4_050_000, "Recaudo de cuotas", 35],
  ["bi-cuotas", "ingreso", 4_200_000, "Recaudo de cuotas", 66],
  ["bi-parq", "ingreso", 400_000, "Arriendo parqueaderos visitantes", 30],
  ["bi-int", "ingreso", 92_000, "Intereses de mora liquidados", 12],
  // gastos
  ["bi-vig", "gasto", 1_800_000, "Vigilancia — julio", 6],
  ["bi-vig", "gasto", 1_800_000, "Vigilancia — junio", 37],
  ["bi-vig", "gasto", 1_800_000, "Vigilancia — mayo", 68],
  ["bi-aseo", "gasto", 800_000, "Aseo — julio", 8],
  ["bi-aseo", "gasto", 800_000, "Aseo — junio", 39],
  ["bi-serv", "gasto", 940_000, "Energía zonas comunes", 10],
  ["bi-serv", "gasto", 610_000, "Acueducto zonas comunes", 11],
  ["bi-admin", "gasto", 600_000, "Honorarios administración", 5],
  ["bi-mant", "gasto", 2_350_000, "Reparación bomba de presión", 18],
  ["bi-mant", "gasto", 1_180_000, "Pintura de fachada — anticipo", 44],
  ["bi-seg", "gasto", 2_400_000, "Póliza área común (anual)", 90],
  [null, "gasto", 320_000, "Papelería y notificaciones", 22],
  // fondo de imprevistos
  [null, "fondo_aporte", 1_680_000, "Aporte 1% Ley 675 — julio", 4],
  [null, "fondo_aporte", 1_620_000, "Aporte 1% Ley 675 — junio", 35],
  [null, "fondo_retiro", 900_000, "Retiro autorizado — impermeabilización", 26],
] as const;

export function getDemoBudget(propertyId: string, year: number) {
  const nowYear = new Date().getFullYear();
  if (propertyId !== "prop-demo-001" || year !== nowYear) return { items: [], entries: [] };
  return {
    items: seededBudgetItems,
    entries: seededLedger.map(([itemId, type, amount, concept, ago], i) => ({
      id: `led-demo-${i}`,
      userId: DEMO_USER.id,
      propertyId,
      date: daysAgo(ago),
      concept,
      itemId,
      type,
      amount,
      note: null,
      createdAt: daysAgo(ago),
    })),
  };
}

// ── PQRS ─────────────────────────────────────────────────────────────
const mkPqrs = (
  code: string,
  type: string,
  subject: string,
  status: string,
  unit: number,
  who: string,
  ago: number,
  thread: [boolean, string][]
) => ({
  id: `pqrs-demo-${code}`,
  userId: DEMO_USER.id,
  propertyId: "prop-demo-001",
  unitId: `unit-demo-${unit}`,
  code,
  type,
  subject,
  status,
  residentName: who,
  residentContact: `${who.split(" ")[0].toLowerCase()}@correo.com`,
  unitLabel: `Apto ${unit}`,
  property: { name: "Conjunto Residencial Los Pinos" },
  messages: thread.map(([fromAdmin, content], i) => ({
    id: `pqrsm-demo-${code}-${i}`,
    pqrsId: `pqrs-demo-${code}`,
    fromAdmin,
    content,
    createdAt: daysAgo(ago - i * 0.4),
  })),
  createdAt: daysAgo(ago),
  updatedAt: daysAgo(ago - (thread.length - 1) * 0.4),
});

const seededPqrs = [
  mkPqrs("PQR-7F3K2Q", "queja", "Ruido en el salón comunal después de las 11 p.m.", "en_proceso", 302, "Andrés Gil", 3, [
    [false, "El sábado hubo una reunión en el salón comunal con música hasta pasadas las 12. El reglamento dice que el uso termina a las 11 p.m."],
    [true, "Gracias por reportarlo. Ya revisamos la planilla de reserva y notificamos al residente responsable. Reforzamos el aviso en cartelera y con la vigilancia."],
  ]),
  mkPqrs("PQR-9M1B4T", "peticion", "Solicitud de paz y salvo para venta del inmueble", "resuelto", 203, "Diego Ramírez", 8, [
    [false, "Necesito el paz y salvo del apartamento para la escritura, ¿qué debo hacer?"],
    [true, "Su unidad está al día. Le generamos el paz y salvo con código de verificación; lo puede descargar desde su portal."],
  ]),
  mkPqrs("PQR-2X8H5L", "reclamo", "Filtración de agua desde el apartamento superior", "radicado", 201, "Carlos Mejía", 1, [
    [false, "Hay una filtración en el techo del baño. Creo que viene del 301. Necesito que revisen urgente porque ya se dañó el cielorraso."],
  ]),
  mkPqrs("PQR-5D6N8W", "sugerencia", "Instalar puntos de reciclaje en cada torre", "radicado", 402, "Camila Torres", 5, [
    [false, "Propongo instalar canecas de separación en cada torre. Hoy solo hay un punto en el parqueadero y casi nadie separa."],
  ]),
  mkPqrs("PQR-4T7Y1V", "queja", "Portón vehicular se cierra muy rápido", "cerrado", 103, "Ana Lucía Peña", 21, [
    [false, "El portón se cierra antes de que alcance a pasar el carro. Ya casi golpea dos veces."],
    [true, "Se ajustó el temporizador del portón a 18 segundos y se hizo mantenimiento al sensor. Quedamos atentos."],
    [false, "Confirmado, ya funciona bien. Gracias."],
  ]),
];

export function getDemoPqrs(propertyId?: string | null, status?: string) {
  const all = !propertyId || propertyId === "prop-demo-001" ? seededPqrs : [];
  const counts: Record<string, number> = {};
  for (const p of all) counts[p.status] = (counts[p.status] || 0) + 1;
  return { pqrs: status ? all.filter((p) => p.status === status) : all, counts };
}

// ── Comunicados ──────────────────────────────────────────────────────
const seededAnnouncements = [
  {
    id: "ann-demo-1",
    userId: DEMO_USER.id,
    propertyId: "prop-demo-001",
    subject: "Corte programado de agua — martes 12, 8:00 a.m. a 2:00 p.m.",
    content:
      "Estimados residentes:\n\nEl acueducto realizará mantenimiento en la red del sector. El servicio se suspenderá el martes 12 entre las 8:00 a.m. y las 2:00 p.m.\n\nRecomendamos almacenar agua la noche anterior. El tanque de reserva cubrirá las zonas comunes.\n\nAdministración.",
    status: "sent",
    recipientCount: 11,
    sentAt: daysAgo(2),
    createdAt: daysAgo(2),
    property: { name: "Conjunto Residencial Los Pinos" },
  },
  {
    id: "ann-demo-2",
    userId: DEMO_USER.id,
    propertyId: "prop-demo-001",
    subject: "Recordatorio: cuota de administración de agosto",
    content:
      "Estimados residentes:\n\nLes recordamos que la cuota de administración de agosto vence el día 10. Pueden pagar desde el enlace privado de su unidad o en la oficina de administración.\n\nA partir del día 11 se liquidan intereses de mora conforme al reglamento.\n\nAdministración.",
    status: "sent",
    recipientCount: 11,
    sentAt: daysAgo(6),
    createdAt: daysAgo(6),
    property: { name: "Conjunto Residencial Los Pinos" },
  },
  {
    id: "ann-demo-3",
    userId: DEMO_USER.id,
    propertyId: "prop-demo-001",
    subject: "Resultados de la asamblea ordinaria 2026",
    content:
      "Estimados copropietarios:\n\nAdjuntamos el resumen de las decisiones aprobadas en la asamblea ordinaria: presupuesto 2026, cuota de administración y plan de mantenimiento de fachada.\n\nEl acta completa estará disponible en el portal dentro de los términos de ley.\n\nAdministración.",
    status: "sent",
    recipientCount: 11,
    sentAt: daysAgo(19),
    createdAt: daysAgo(19),
    property: { name: "Conjunto Residencial Los Pinos" },
  },
];

export function getDemoAnnouncements(propertyId?: string | null) {
  return !propertyId || propertyId === "prop-demo-001" ? seededAnnouncements : [];
}

// ── Asambleas ────────────────────────────────────────────────────────
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

const seededAssemblies = [
  {
    id: "asm-demo-1",
    userId: DEMO_USER.id,
    propertyId: "prop-demo-001",
    type: "extraordinaria",
    date: inDays(24),
    modality: "mixta",
    location: "Salón comunal · enlace virtual en la convocatoria",
    agenda: [
      "Verificación del quórum",
      "Nombramiento de presidente y secretario",
      "Propuesta de impermeabilización de cubiertas",
      "Aprobación de cuota extraordinaria",
      "Proposiciones y varios",
    ],
    status: "convocada",
    convokedAt: daysAgo(3),
    actaReadyAt: null,
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
    property: { name: "Conjunto Residencial Los Pinos" },
  },
  {
    id: "asm-demo-2",
    userId: DEMO_USER.id,
    propertyId: "prop-demo-001",
    type: "ordinaria",
    date: daysAgo(23),
    modality: "presencial",
    location: "Salón comunal — Carrera 45 # 23-67",
    agenda: [
      "Verificación del quórum",
      "Informe de gestión de la administración",
      "Estados financieros 2025",
      "Presupuesto 2026 y cuota de administración",
      "Elección de consejo de administración",
      "Proposiciones y varios",
    ],
    status: "realizada",
    convokedAt: daysAgo(38),
    actaReadyAt: daysAgo(19),
    createdAt: daysAgo(38),
    updatedAt: daysAgo(19),
    property: { name: "Conjunto Residencial Los Pinos" },
  },
];

export function getDemoAssemblies(propertyId?: string | null) {
  return !propertyId || propertyId === "prop-demo-001" ? seededAssemblies : [];
}

// ── Certificados ─────────────────────────────────────────────────────
const mkCert = (
  n: number,
  type: string,
  who: string,
  unit: number,
  ago: number,
  status = "valid",
  meta: Record<string, string> = {}
) => ({
  id: `cert-demo-${n}`,
  userId: DEMO_USER.id,
  propertyId: "prop-demo-001",
  unitId: `unit-demo-${unit}`,
  type,
  recipientName: who,
  unitLabel: `Apto ${unit}`,
  meta,
  verifyCode: `DEMOcert${n}${String(unit)}`,
  status,
  revokedAt: status === "revoked" ? daysAgo(ago - 5) : null,
  createdAt: daysAgo(ago),
  property: { name: "Conjunto Residencial Los Pinos" },
});

const seededCertificates = [
  mkCert(1, "paz_y_salvo", "Diego Ramírez", 203, 7, "valid", {
    recipientDocument: "1.020.445.118",
    validUntil: inDays(23).slice(0, 10),
    note: "Solicitado para trámite de escritura.",
  }),
  mkCert(2, "residencia", "María Restrepo", 101, 13, "valid", {
    recipientDocument: "52.874.301",
    residesSince: "2019-03-01",
  }),
  mkCert(3, "paz_y_salvo", "Camila Torres", 402, 29, "valid", {
    recipientDocument: "1.032.998.740",
    validUntil: daysAgo(-1).slice(0, 10),
  }),
  mkCert(4, "paz_y_salvo", "Laura Ochoa", 301, 46, "revoked", {
    recipientDocument: "43.556.209",
    note: "Revocado: la unidad presentó mora posterior a la expedición.",
  }),
];

export function getDemoCertificates(propertyId?: string | null) {
  return !propertyId || propertyId === "prop-demo-001" ? seededCertificates : [];
}
