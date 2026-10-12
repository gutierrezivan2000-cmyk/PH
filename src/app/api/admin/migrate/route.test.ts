import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ $executeRawUnsafe: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));

const peticion = (secreto?: string) =>
  new Request("http://localhost/api/admin/migrate", { method: "POST", headers: secreto ? { "x-admin-secret": secreto } : {} }) as unknown as NextRequest;

async function cargar() {
  vi.resetModules();
  const [ruta, admin, agentes, reuniones, operacion] = await Promise.all([
    import("./route"),
    import("@/lib/ensure-admin-schema"),
    import("@/lib/ensure-agent-tables"),
    import("@/lib/ensure-meetings-schema"),
    import("@/lib/ensure-operacion-schema"),
  ]);
  return {
    ruta,
    familias: {
      admin: admin.SENTENCIAS_ADMIN,
      agentes: agentes.SENTENCIAS_AGENTES,
      reuniones: reuniones.SENTENCIAS_REUNIONES,
      operacion: operacion.SENTENCIAS_OPERACION,
    },
  };
}

beforeEach(() => {
  vi.stubEnv("ADMIN_MIGRATE_SECRET", "secreto-de-prueba");
  db.$executeRawUnsafe.mockReset();
  db.$executeRawUnsafe.mockResolvedValue(0);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/admin/migrate", () => {
  it("sin el secreto correcto no ejecuta nada", async () => {
    const { ruta } = await cargar();
    expect((await ruta.POST(peticion())).status).toBe(401);
    expect((await ruta.POST(peticion("otro"))).status).toBe(401);
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("si el servidor no tiene ADMIN_MIGRATE_SECRET responde 500 y no ejecuta nada", async () => {
    vi.stubEnv("ADMIN_MIGRATE_SECRET", "");
    const { ruta } = await cargar();
    expect((await ruta.POST(peticion("lo-que-sea"))).status).toBe(500);
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("ejecuta las sentencias de las cuatro familias, en orden: primero las de admin (tablas base) y al final las de operación", async () => {
    const { ruta, familias } = await cargar();
    const res = await ruta.POST(peticion("secreto-de-prueba"));
    expect(res.status).toBe(200);
    const ejecutadas = db.$executeRawUnsafe.mock.calls.map((c) => String(c[0]));
    expect(ejecutadas).toEqual([...familias.admin, ...familias.agentes, ...familias.reuniones, ...familias.operacion]);
    expect(ejecutadas[0]).toMatch(/^CREATE TABLE IF NOT EXISTS "User" \(/);
    const cuerpo = (await res.json()) as { results: { name: string; status: string }[] };
    expect(cuerpo.results).toHaveLength(ejecutadas.length);
    expect(cuerpo.results.every((r) => r.status === "ok")).toBe(true);
  });

  it("una sentencia que falla se informa pero no frena a las demás", async () => {
    db.$executeRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('"Ticket_userId_fkey"')) throw new Error("boom");
      return 0;
    });
    const { ruta, familias } = await cargar();
    const cuerpo = (await (await ruta.POST(peticion("secreto-de-prueba"))).json()) as { results: { name: string; status: string; error?: string }[] };
    const total = familias.admin.length + familias.agentes.length + familias.reuniones.length + familias.operacion.length;
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(total);
    const fallidas = cuerpo.results.filter((r) => r.status === "failed");
    expect(fallidas).toHaveLength(1);
    expect(fallidas[0].error).toBe("boom");
  });
});

describe("GET /api/admin/migrate", () => {
  it("lista los nombres de todas las sentencias sin ejecutar ninguna", async () => {
    const { ruta, familias } = await cargar();
    const cuerpo = (await (await ruta.GET()).json()) as { statements: string[] };
    expect(cuerpo.statements).toHaveLength(familias.admin.length + familias.agentes.length + familias.reuniones.length + familias.operacion.length);
    expect(cuerpo.statements[0]).toMatch(/^admin 1: CREATE TABLE IF NOT EXISTS "User"/);
    expect(cuerpo.statements.some((n) => n.startsWith("reuniones "))).toBe(true);
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
