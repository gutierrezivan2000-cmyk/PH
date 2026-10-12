import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => {
  // La ruta lee DEMO_MODE al cargarse: se fija antes de importarla.
  process.env.DEMO_MODE = "false";
  return {
    db: {
      user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    },
  };
});
vi.mock("@/lib/cartera-server", () => ({ requireCartera: async () => ({ userId: "u1", accessStatus: "testing" }) }));
vi.mock("@/lib/db", () => ({ db }));

import { GET, POST } from "./route";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

// Cola inconfundible: si la API devolviera «los últimos 4» saldría "7731".
const P_KEY = "pk_secreta_de_prueba_ZZ9q_7731";
const COLA = "7731";

const post = (b: Record<string, unknown>) =>
  POST(new Request("http://x/api/pagos/config", { method: "POST", body: JSON.stringify(b) }) as never);

const fila = (epaycoPKey: string | null) => ({
  epaycoPublicKey: "pub_test_123",
  epaycoPCustId: "98765",
  epaycoPKey,
  epaycoTest: true,
});

let errores: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "secreto-de-prueba-de-auth-para-derivar-la-clave");
  vi.stubEnv("ENCRYPTION_KEY", undefined as unknown as string);
  db.user.findUnique.mockReset();
  db.user.update.mockReset();
  db.user.updateMany.mockReset();
  db.user.update.mockResolvedValue({});
  db.user.updateMany.mockResolvedValue({ count: 1 });
  errores = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  errores.mockRestore();
});
afterAll(() => vi.unstubAllEnvs());

/** Todo lo que el servidor pudo haber escrito en el log, como texto. */
const log = () => JSON.stringify(errores.mock.calls, (_k, v) => (v instanceof Error ? `${v.name}: ${v.message}` : v));

describe("GET /api/pagos/config nunca devuelve la P_KEY ni un fragmento", () => {
  it("con la llave cifrada solo responde un booleano", async () => {
    const guardada = encryptSecret(P_KEY);
    db.user.findUnique.mockResolvedValue(fila(guardada));
    const r = await GET();
    const texto = await r.text();
    const body = JSON.parse(texto);

    expect(r.status).toBe(200);
    expect(body).toEqual({
      configured: true,
      publicKey: "pub_test_123",
      pCustId: "98765",
      pKeyConfigured: true,
      pKeyIlegible: false,
      test: true,
    });
    expect(body).not.toHaveProperty("pKeyMasked");
    expect(body).not.toHaveProperty("pKey");
    // Ni la llave, ni sus últimos dígitos, ni el valor cifrado, ni el prefijo del cifrado.
    for (const prohibido of [P_KEY, COLA, guardada, "enc:v1", "••"]) expect(texto).not.toContain(prohibido);
    // Ya estaba cifrada: no hay nada que migrar.
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("con una llave antigua en claro tampoco devuelve nada y, con MIGRAR_LLAVES_EPAYCO=true, la deja cifrada", async () => {
    vi.stubEnv("MIGRAR_LLAVES_EPAYCO", "true");
    db.user.findUnique.mockResolvedValue(fila(P_KEY));
    const r = await GET();
    const texto = await r.text();

    expect(JSON.parse(texto)).toMatchObject({ configured: true, pKeyConfigured: true, pKeyIlegible: false });
    for (const prohibido of [P_KEY, COLA, "••"]) expect(texto).not.toContain(prohibido);

    expect(db.user.updateMany).toHaveBeenCalledTimes(1);
    const arg = db.user.updateMany.mock.calls[0][0];
    // Compara y cambia: no pisa una llave nueva que se guarde justo en medio.
    expect(arg.where).toEqual({ id: "u1", epaycoPKey: P_KEY });
    expect(arg.data.epaycoPKey).toMatch(/^enc:v1:a:/);
    expect(arg.data.epaycoPKey).not.toContain(P_KEY);
    expect(decryptSecret(arg.data.epaycoPKey)).toBe(P_KEY);
  });

  it("si falla el re-guardado cifrado la petición sigue funcionando y el log no lleva la llave", async () => {
    db.user.findUnique.mockResolvedValue(fila(P_KEY));
    db.user.updateMany.mockRejectedValue(new Error(`fallo con where epaycoPKey = ${P_KEY}`));
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ configured: true, pKeyConfigured: true });
    expect(log()).not.toContain(P_KEY);
    expect(log()).not.toContain(COLA);
  });

  it("si no hay con qué cifrar, la lectura sigue funcionando y no se escribe nada", async () => {
    vi.stubEnv("AUTH_SECRET", undefined as unknown as string);
    db.user.findUnique.mockResolvedValue(fila(P_KEY));
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ configured: true, pKeyConfigured: true });
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(log()).not.toContain(P_KEY);
  });

  it("sin llave guardada: pKeyConfigured false", async () => {
    db.user.findUnique.mockResolvedValue(fila(null));
    const body = await (await GET()).json();
    expect(body).toMatchObject({ configured: false, pKeyConfigured: false, pKeyIlegible: false });
    expect(body).not.toHaveProperty("pKeyMasked");
  });

  it("llave cifrada que ya no se puede leer: lo avisa sin devolver nada y registra solo el motivo", async () => {
    const guardada = encryptSecret(P_KEY);
    vi.stubEnv("AUTH_SECRET", "otro-secreto-de-auth-completamente-distinto");
    db.user.findUnique.mockResolvedValue(fila(guardada));
    const r = await GET();
    const texto = await r.text();
    expect(r.status).toBe(200);
    expect(JSON.parse(texto)).toMatchObject({ configured: false, pKeyConfigured: false, pKeyIlegible: true });
    for (const prohibido of [P_KEY, COLA, guardada]) {
      expect(texto).not.toContain(prohibido);
      expect(log()).not.toContain(prohibido);
    }
    expect(log()).toContain("decrypt_failed");
  });

  it("no está configurado si falta la llave pública o el P_CUST_ID, aunque la P_KEY sirva", async () => {
    db.user.findUnique.mockResolvedValue({ ...fila(encryptSecret(P_KEY)), epaycoPCustId: null });
    expect(await (await GET()).json()).toMatchObject({ configured: false, pKeyConfigured: true });
  });
});

describe("POST /api/pagos/config guarda la P_KEY siempre cifrada", () => {
  it("una llave nueva se escribe cifrada y descifra al valor original (recortado)", async () => {
    const r = await post({ publicKey: "pub_test_123", pCustId: "98765", pKey: `  ${P_KEY}  `, test: true });
    expect(r.status).toBe(200);
    const { data, where } = db.user.update.mock.calls[0][0];
    expect(where).toEqual({ id: "u1" });
    expect(data.epaycoPKey).toMatch(/^enc:v1:a:/);
    expect(data.epaycoPKey).not.toContain(P_KEY);
    expect(decryptSecret(data.epaycoPKey)).toBe(P_KEY);
    expect(data.epaycoPublicKey).toBe("pub_test_123");
    expect(data.epaycoPCustId).toBe("98765");
  });

  it("con ENCRYPTION_KEY definida se usa esa clave (marcador «k»)", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "c".repeat(64));
    await post({ publicKey: "pub", pCustId: "1", pKey: P_KEY });
    const { data } = db.user.update.mock.calls[0][0];
    expect(data.epaycoPKey).toMatch(/^enc:v1:k:/);
    expect(decryptSecret(data.epaycoPKey)).toBe(P_KEY);
  });

  it.each([[undefined], [""], ["   "], ["••••7731"]])(
    "si no llega una llave nueva (%j) se conserva la guardada: no se toca la columna",
    async (pKey) => {
      const r = await post({ publicKey: "pub", pCustId: "1", pKey });
      expect(r.status).toBe(200);
      expect(db.user.update.mock.calls[0][0].data).not.toHaveProperty("epaycoPKey");
    }
  );

  it("sin ENCRYPTION_KEY ni AUTH_SECRET responde un error claro y no escribe nada (nunca en claro)", async () => {
    vi.stubEnv("AUTH_SECRET", undefined as unknown as string);
    const r = await post({ publicKey: "pub", pCustId: "1", pKey: P_KEY });
    const texto = await r.text();
    expect(r.status).toBe(500);
    expect(JSON.parse(texto).error).toContain("clave de cifrado");
    expect(db.user.update).not.toHaveBeenCalled();
    for (const prohibido of [P_KEY, COLA]) {
      expect(texto).not.toContain(prohibido);
      expect(log()).not.toContain(prohibido);
    }
  });

  it("con una ENCRYPTION_KEY inválida tampoco escribe nada", async () => {
    vi.stubEnv("ENCRYPTION_KEY", "corta");
    const r = await post({ publicKey: "pub", pCustId: "1", pKey: P_KEY });
    expect(r.status).toBe(500);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
