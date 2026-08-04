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
