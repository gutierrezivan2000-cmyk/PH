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
