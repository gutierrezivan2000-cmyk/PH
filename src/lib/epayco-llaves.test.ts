import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({ db: { user: { updateMany: vi.fn() } } }));
vi.mock("@/lib/db", () => ({ db }));

import { leerPKey, leerPKeyYMigrar } from "./epayco-llaves";
import { validateSignatureWith } from "./epayco";
import { decryptSecret, encryptSecret } from "./secret-box";

const P_KEY = "pk_secreta_de_prueba_ZZ9q_7731";

let errores: ReturnType<typeof vi.spyOn>;
const log = () => JSON.stringify(errores.mock.calls);

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "secreto-de-prueba-de-auth-para-derivar-la-clave");
  vi.stubEnv("ENCRYPTION_KEY", undefined as unknown as string);
  db.user.updateMany.mockReset();
  db.user.updateMany.mockResolvedValue({ count: 1 });
  errores = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  errores.mockRestore();
});

describe("leerPKey", () => {
  it("ausente: null, undefined y vacío", () => {
    for (const v of [null, undefined, ""]) expect(leerPKey(v, "t")).toEqual({ estado: "ausente" });
  });

  it("devuelve la llave en claro a partir del valor cifrado", () => {
    expect(leerPKey(encryptSecret(P_KEY), "t")).toEqual({ estado: "ok", pKey: P_KEY });
  });

  it("devuelve tal cual una llave antigua en claro", () => {
    expect(leerPKey(P_KEY, "t")).toEqual({ estado: "ok", pKey: P_KEY });
  });

  it("ilegible cuando cambió la clave o el dato se alteró, y el log lleva el motivo pero no el valor", () => {
    const guardada = encryptSecret(P_KEY);
    vi.stubEnv("AUTH_SECRET", "otro-secreto-de-auth-completamente-distinto");
    expect(leerPKey(guardada, "t")).toEqual({ estado: "ilegible" });
    expect(leerPKey(guardada.slice(0, 25), "t")).toEqual({ estado: "ilegible" });
    expect(log()).toContain("decrypt_failed");
    expect(log()).toContain("bad_format");
    for (const prohibido of [P_KEY, guardada]) expect(log()).not.toContain(prohibido);
  });
});

describe("leerPKeyYMigrar (migración perezosa)", () => {
  beforeEach(() => {
    vi.stubEnv("MIGRAR_LLAVES_EPAYCO", "true");
  });

  it("con MIGRAR_LLAVES_EPAYCO apagado (por omisión) la llave en claro se lee pero NO se reescribe", async () => {
    vi.stubEnv("MIGRAR_LLAVES_EPAYCO", undefined as unknown as string);
    const l = await leerPKeyYMigrar("u1", P_KEY, "t");
    expect(l).toEqual({ estado: "ok", pKey: P_KEY });
    expect(db.user.updateMany).not.toHaveBeenCalled();
    vi.stubEnv("MIGRAR_LLAVES_EPAYCO", "false");
    await leerPKeyYMigrar("u1", P_KEY, "t");
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("una llave en claro se re-guarda cifrada, comparando contra el valor leído", async () => {
    const l = await leerPKeyYMigrar("u1", P_KEY, "t");
    expect(l).toEqual({ estado: "ok", pKey: P_KEY });
    expect(db.user.updateMany).toHaveBeenCalledTimes(1);
    const arg = db.user.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "u1", epaycoPKey: P_KEY });
    expect(decryptSecret(arg.data.epaycoPKey)).toBe(P_KEY);
  });

  it("una llave ya cifrada no se vuelve a escribir", async () => {
    await leerPKeyYMigrar("u1", encryptSecret(P_KEY), "t");
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("sin llave o con una ilegible no se escribe nada", async () => {
    await leerPKeyYMigrar("u1", null, "t");
    await leerPKeyYMigrar("u1", "enc:v1:a:AAAA", "t");
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it("nunca falla por el re-guardado: ni si la base de datos rechaza ni si no hay clave de cifrado", async () => {
    db.user.updateMany.mockRejectedValueOnce(Object.assign(new Error(`where epaycoPKey = ${P_KEY}`), { code: "P2002" }));
    expect(await leerPKeyYMigrar("u1", P_KEY, "t")).toEqual({ estado: "ok", pKey: P_KEY });
    expect(log()).toContain("P2002");

    vi.stubEnv("AUTH_SECRET", undefined as unknown as string);
    db.user.updateMany.mockClear();
    expect(await leerPKeyYMigrar("u1", P_KEY, "t")).toEqual({ estado: "ok", pKey: P_KEY });
    expect(db.user.updateMany).not.toHaveBeenCalled();

    expect(log()).not.toContain(P_KEY);
  });
});

describe("validateSignatureWith", () => {
  const p = { x_ref_payco: "R-1", x_transaction_id: "T-1", x_amount: "100000", x_currency_code: "COP" };
  const firma = (llave: string) =>
    createHash("sha256").update(`98765^${llave}^R-1^T-1^100000^COP`).digest("hex");

  it("valida con la llave en claro", () => {
    expect(validateSignatureWith("98765", P_KEY, { ...p, x_signature: firma(P_KEY) })).toBe(true);
    expect(validateSignatureWith("98765", P_KEY, { ...p, x_signature: firma("otra") })).toBe(false);
  });

  it("rechaza (y lo registra sin el valor) si por error llega la llave todavía cifrada", () => {
    const guardada = encryptSecret(P_KEY);
    // Aunque la firma se hubiera calculado con el texto cifrado, no se acepta.
    expect(validateSignatureWith("98765", guardada, { ...p, x_signature: firma(guardada) })).toBe(false);
    expect(errores).toHaveBeenCalled();
    for (const prohibido of [P_KEY, guardada]) expect(log()).not.toContain(prohibido);
  });
});
