import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, puerta } = vi.hoisted(() => ({
  db: {
    property: { findFirst: vi.fn() },
    unit: { findFirst: vi.fn() },
    certificate: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
  puerta: { error: null as unknown },
}));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1", email: "jefe@x.com", role: "admin" } }) }));
vi.mock("@/lib/modulos-acceso", () => ({ exigirModulo: async () => (puerta.error ? { error: puerta.error } : { userId: "u1" }) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => {} }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: async () => ({ allowed: true, status: "testing" }) }));

import { PATCH, POST } from "./route";

const post = (b: unknown) => POST(new Request("http://x/api/certificates", { method: "POST", body: JSON.stringify(b) }) as never);
const patch = (b: unknown) => PATCH(new Request("http://x/api/certificates", { method: "PATCH", body: JSON.stringify(b) }) as never);
const base = { propertyId: "p1", type: "paz_y_salvo", recipientName: "Ana Gómez" };
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);
const futuro = (dias: number) => new Date(Date.now() + dias * 86_400_000);

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  Object.values(db).forEach((t) => Object.values(t).forEach((f) => f.mockReset()));
  puerta.error = null;
  db.property.findFirst.mockResolvedValue({ id: "p1" });
  db.certificate.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "c1", ...data }));
});

describe("POST paz y salvo", () => {
  it("con la unidad en mora: 409, con el valor adeudado, y no se crea nada", async () => {
    db.unit.findFirst.mockResolvedValue({
      label: "Apto 502",
      charges: [{ amount: 300_000, paidAmount: 0, dueDate: hace(40) }],
      payments: [],
    });
    const r = await post({ ...base, unitId: "un1" });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: "saldo_pendiente", enMora: 300_000 });
    expect(db.certificate.create).not.toHaveBeenCalled();
  });

  it("con la unidad al día: se emite y queda registrado con qué se verificó, el saldo (un cobro que aún no vence no impide el paz y salvo) y una vigencia", async () => {
    db.unit.findFirst.mockResolvedValue({
      label: "Apto 502",
      charges: [{ amount: 300_000, paidAmount: 300_000, dueDate: hace(40) }, { amount: 300_000, paidAmount: 0, dueDate: futuro(10) }],
      payments: [{ amount: 300_000 }],
    });
    const r = await post({ ...base, unitId: "un1" });
    expect(r.status).toBe(201);
    const meta = db.certificate.create.mock.calls[0][0].data.meta;
    expect(meta).toMatchObject({ verificadoCon: "cartera", saldoAlEmitir: 300_000, vencidoAlEmitir: 0 });
    expect(meta.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(meta.verificadoEn).toBeTruthy();
  });

  it("sin unidad del directorio: exige la confirmación y, con ella, queda como «declarado»", async () => {
    expect((await post({ ...base, unitLabel: "Apto 9" })).status).toBe(400);
    expect(db.certificate.create).not.toHaveBeenCalled();
    expect((await post({ ...base, unitLabel: "Apto 9", confirmaAlDia: true })).status).toBe(201);
    expect(db.certificate.create.mock.calls[0][0].data.meta.verificadoCon).toBe("declarado");
  });

  it("el certificado de residencia no consulta la cartera, pero también vence", async () => {
    const r = await post({ propertyId: "p1", type: "residencia", recipientName: "Ana", unitLabel: "Apto 9" });
    expect(r.status).toBe(201);
    expect(db.certificate.create.mock.calls[0][0].data.meta.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("una cuenta sin acceso al módulo no emite nada", async () => {
    puerta.error = new Response(null, { status: 404 });
    expect((await post({ ...base, unitLabel: "Apto 9", confirmaAlDia: true })).status).toBe(404);
    expect(db.certificate.create).not.toHaveBeenCalled();
  });
});

describe("PATCH revocar", () => {
  it("restaurar ya no existe: la revocación es definitiva", async () => {
    expect((await patch({ id: "c1", action: "restore" })).status).toBe(400);
    expect(db.certificate.update).not.toHaveBeenCalled();
  });
  it("revocar exige un motivo y lo guarda con quién y cuándo", async () => {
    db.certificate.findFirst.mockResolvedValue({ id: "c1", status: "valid", meta: { validUntil: "2026-11-01" } });
    expect((await patch({ id: "c1", action: "revoke", reason: "mal" })).status).toBe(400);
    expect((await patch({ id: "c1", action: "revoke", reason: "Se expidió a la unidad equivocada" })).status).toBe(200);
    const data = db.certificate.update.mock.calls[0][0].data;
    expect(data.status).toBe("revoked");
    expect(data.meta.validUntil).toBe("2026-11-01");
    expect(data.meta.revocacion).toMatchObject({ motivo: "Se expidió a la unidad equivocada", por: "u1" });
  });
  it("revocar un certificado ya revocado no cambia nada", async () => {
    db.certificate.findFirst.mockResolvedValue({ id: "c1", status: "revoked", meta: {} });
    expect((await patch({ id: "c1", action: "revoke", reason: "Motivo suficiente" })).status).toBe(200);
    expect(db.certificate.update).not.toHaveBeenCalled();
  });
});
