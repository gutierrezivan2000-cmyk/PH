import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, encryptionStatus, isEncrypted, SecretBoxError } from "./secret-box";

const AUTH = "secreto-de-prueba-de-auth-para-derivar-la-clave";
const P_KEY = "p_key_de_prueba_0123456789abcdef";

/** Fija (o quita, con undefined) las dos variables de las que sale la clave. */
function entorno(v: { AUTH_SECRET?: string; ENCRYPTION_KEY?: string }) {
  vi.stubEnv("AUTH_SECRET", v.AUTH_SECRET as string);
  vi.stubEnv("ENCRYPTION_KEY", v.ENCRYPTION_KEY as string);
}

const claveHex = () => randomBytes(32).toString("hex");
const claveBase64 = () => randomBytes(32).toString("base64");

/** Cambia un byte del contenido binario (iv | etiqueta | cifrado) y vuelve a armar el valor. */
function alterarByte(valor: string, posicion: number): string {
  const [prefijo, b64] = [valor.slice(0, valor.lastIndexOf(":") + 1), valor.slice(valor.lastIndexOf(":") + 1)];
  const bytes = Buffer.from(b64, "base64url");
  bytes[posicion] ^= 0x01;
  return prefijo + bytes.toString("base64url");
}

function lanza(fn: () => unknown): SecretBoxError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(SecretBoxError);
    return e as SecretBoxError;
  }
  throw new Error("se esperaba que lanzara");
}

beforeEach(() => entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: undefined }));
afterEach(() => vi.unstubAllEnvs());

describe("formato", () => {
  it("el valor guardado lleva el prefijo, el marcador de clave y no contiene el secreto", () => {
    const g = encryptSecret(P_KEY);
    expect(g).toMatch(/^enc:v1:a:[A-Za-z0-9_-]+$/);
    expect(g).not.toContain(P_KEY);
    expect(isEncrypted(g)).toBe(true);
  });

  it("isEncrypted distingue un secreto antiguo en claro", () => {
    expect(isEncrypted(P_KEY)).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });
});

describe("ida y vuelta con cada modo de clave", () => {
  it("con AUTH_SECRET (marcador «a») y sin configurar nada nuevo", () => {
    const g = encryptSecret(P_KEY);
    expect(g.startsWith("enc:v1:a:")).toBe(true);
    expect(decryptSecret(g)).toBe(P_KEY);
  });

  it.each([
    ["32 bytes en hex", claveHex],
    ["32 bytes en base64", claveBase64],
    ["texto largo (HKDF)", () => "una-frase-larga-que-no-es-hex-ni-base64-de-32-bytes!"],
  ])("con ENCRYPTION_KEY de %s (marcador «k»)", (_n, hacer) => {
    entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: hacer() });
    const g = encryptSecret(P_KEY);
    expect(g.startsWith("enc:v1:k:")).toBe(true);
    expect(decryptSecret(g)).toBe(P_KEY);
  });

  it("con ENCRYPTION_KEY y sin AUTH_SECRET", () => {
    entorno({ AUTH_SECRET: undefined, ENCRYPTION_KEY: claveHex() });
    expect(decryptSecret(encryptSecret(P_KEY))).toBe(P_KEY);
  });

  it("conserva acentos, espacios y caracteres no ASCII", () => {
    const raro = "  llave ñandú 🔑 con espacios  ";
    expect(decryptSecret(encryptSecret(raro))).toBe(raro);
  });

  it("la misma ENCRYPTION_KEY en hex y en base64 (los mismos 32 bytes) es la misma clave", () => {
    const bytes = randomBytes(32);
    entorno({ AUTH_SECRET: undefined, ENCRYPTION_KEY: bytes.toString("hex") });
    const g = encryptSecret(P_KEY);
    entorno({ AUTH_SECRET: undefined, ENCRYPTION_KEY: bytes.toString("base64") });
    expect(decryptSecret(g)).toBe(P_KEY);
  });

  it("ENCRYPTION_KEY con espacios o salto de línea alrededor se interpreta igual", () => {
    const hex = claveHex();
    entorno({ AUTH_SECRET: undefined, ENCRYPTION_KEY: hex });
    const g = encryptSecret(P_KEY);
    entorno({ AUTH_SECRET: undefined, ENCRYPTION_KEY: `  ${hex}\n` });
    expect(decryptSecret(g)).toBe(P_KEY);
  });
});

describe("IV único", () => {
  it("dos cifrados del mismo secreto son distintos y ambos descifran", () => {
    const a = encryptSecret(P_KEY);
    const b = encryptSecret(P_KEY);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(P_KEY);
    expect(decryptSecret(b)).toBe(P_KEY);
  });

  it("100 cifrados no repiten el IV", () => {
    const ivs = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const bytes = Buffer.from(encryptSecret(P_KEY).split(":")[3], "base64url");
      ivs.add(bytes.subarray(0, 12).toString("hex"));
    }
    expect(ivs.size).toBe(100);
  });
});

describe("detección de alteraciones", () => {
  it.each([
    ["el IV", 0],
    ["la etiqueta de autenticación", 12],
    ["el texto cifrado", 28],
  ])("un byte cambiado en %s lanza decrypt_failed", (_n, pos) => {
    const g = encryptSecret(P_KEY);
    const e = lanza(() => decryptSecret(alterarByte(g, pos)));
    expect(e.code).toBe("decrypt_failed");
  });

  it("cambiar un carácter del medio del valor guardado también se detecta", () => {
    const g = encryptSecret(P_KEY);
    const i = g.length - 10;
    const alterado = g.slice(0, i) + (g[i] === "A" ? "B" : "A") + g.slice(i + 1);
    expect(lanza(() => decryptSecret(alterado)).code).toBe("decrypt_failed");
  });

  it("cambiar el marcador de clave (a ↔ k) no engaña a la autenticación", () => {
    const hex = claveHex();
    entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: hex });
    const g = encryptSecret(P_KEY);
    expect(g.startsWith("enc:v1:k:")).toBe(true);
    expect(lanza(() => decryptSecret(g.replace("enc:v1:k:", "enc:v1:a:"))).code).toBe("decrypt_failed");
  });

  it("un valor truncado o con formato roto lanza bad_format, no devuelve basura", () => {
    const g = encryptSecret(P_KEY);
    expect(lanza(() => decryptSecret(g.slice(0, 20))).code).toBe("bad_format");
    expect(lanza(() => decryptSecret("enc:v1:a:")).code).toBe("bad_format");
    expect(lanza(() => decryptSecret("enc:v1:z:AAAA")).code).toBe("bad_format");
    expect(lanza(() => decryptSecret("enc:v9:a:AAAA")).code).toBe("bad_format");
  });

  it("los mensajes de error nunca incluyen el secreto, la clave ni el valor guardado", () => {
    const hex = claveHex();
    entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: hex });
    const g = encryptSecret(P_KEY);
    const errores = [
      lanza(() => decryptSecret(alterarByte(g, 30))),
      lanza(() => decryptSecret(g.slice(0, 20))),
    ];
    entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: undefined });
    errores.push(lanza(() => decryptSecret(g)));
    for (const e of errores) {
      const texto = `${e.name} ${e.message} ${e.code} ${e.stack ?? ""}`;
      for (const secreto of [P_KEY, hex, AUTH, g]) expect(texto).not.toContain(secreto);
    }
  });
});

describe("clave equivocada", () => {
  it("otra AUTH_SECRET no descifra un valor «a»", () => {
    const g = encryptSecret(P_KEY);
    entorno({ AUTH_SECRET: "otro-secreto-de-auth-completamente-distinto", ENCRYPTION_KEY: undefined });
    expect(lanza(() => decryptSecret(g)).code).toBe("decrypt_failed");
  });

  it("otra ENCRYPTION_KEY no descifra un valor «k»", () => {
    entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: claveHex() });
    const g = encryptSecret(P_KEY);
    entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: claveHex() });
    expect(lanza(() => decryptSecret(g)).code).toBe("decrypt_failed");
  });

  it("un valor «k» sin ENCRYPTION_KEY configurada lanza key_unavailable (no cae a AUTH_SECRET)", () => {
    entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: claveHex() });
    const g = encryptSecret(P_KEY);
    entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: undefined });
    expect(lanza(() => decryptSecret(g)).code).toBe("key_unavailable");
  });

  it("un valor «a» sin AUTH_SECRET lanza key_unavailable", () => {
    const g = encryptSecret(P_KEY);
    entorno({ AUTH_SECRET: undefined, ENCRYPTION_KEY: claveHex() });
    expect(lanza(() => decryptSecret(g)).code).toBe("key_unavailable");
  });
});

describe("secreto antiguo en claro", () => {
  it("se devuelve tal cual", () => {
    expect(decryptSecret(P_KEY)).toBe(P_KEY);
    expect(decryptSecret("")).toBe("");
  });

  it("se lee aunque no haya ninguna clave de cifrado configurada", () => {
    entorno({ AUTH_SECRET: undefined, ENCRYPTION_KEY: undefined });
    expect(decryptSecret(P_KEY)).toBe(P_KEY);
  });
});

describe("el marcador de clave se respeta cuando aparece ENCRYPTION_KEY", () => {
  it("lo cifrado con AUTH_SECRET sigue leyéndose después de definir ENCRYPTION_KEY, y lo nuevo usa «k»", () => {
    const viejo = encryptSecret(P_KEY);
    expect(viejo.startsWith("enc:v1:a:")).toBe(true);

    entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: claveBase64() });
    expect(decryptSecret(viejo)).toBe(P_KEY);

    const nuevo = encryptSecret("otra-p-key");
    expect(nuevo.startsWith("enc:v1:k:")).toBe(true);
    expect(decryptSecret(nuevo)).toBe("otra-p-key");
    // Y el viejo sigue siendo «a»: nadie lo reescribe por su cuenta.
    expect(decryptSecret(viejo)).toBe(P_KEY);
  });

  it("encryptionStatus informa de qué clave se usaría, sin devolver claves", () => {
    expect(encryptionStatus()).toEqual({ source: "a", invalidEncryptionKey: false });
    entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: claveHex() });
    expect(encryptionStatus()).toEqual({ source: "k", invalidEncryptionKey: false });
    entorno({ AUTH_SECRET: undefined, ENCRYPTION_KEY: undefined });
    expect(encryptionStatus()).toEqual({ source: null, invalidEncryptionKey: false });
    entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: "corta" });
    expect(encryptionStatus()).toEqual({ source: null, invalidEncryptionKey: true });
  });
});

describe("sin claves o con claves mal puestas", () => {
  it("sin ENCRYPTION_KEY ni AUTH_SECRET, cifrar lanza no_key y nunca devuelve texto en claro", () => {
    entorno({ AUTH_SECRET: undefined, ENCRYPTION_KEY: undefined });
    const e = lanza(() => encryptSecret(P_KEY));
    expect(e.code).toBe("no_key");
    expect(e.message).not.toContain(P_KEY);
  });

  it("variables vacías o solo espacios cuentan como ausentes", () => {
    entorno({ AUTH_SECRET: "   ", ENCRYPTION_KEY: "  " });
    expect(lanza(() => encryptSecret(P_KEY)).code).toBe("no_key");
  });

  it("una ENCRYPTION_KEY corta lanza invalid_key al cifrar, en vez de caer en silencio a AUTH_SECRET", () => {
    entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: "demasiado-corta" });
    expect(lanza(() => encryptSecret(P_KEY)).code).toBe("invalid_key");
  });

  it("aun así, lo cifrado con AUTH_SECRET se sigue leyendo si ENCRYPTION_KEY quedó mal puesta", () => {
    const g = encryptSecret(P_KEY);
    entorno({ AUTH_SECRET: AUTH, ENCRYPTION_KEY: "demasiado-corta" });
    expect(decryptSecret(g)).toBe(P_KEY);
  });

  it("no se cifra un secreto vacío", () => {
    expect(lanza(() => encryptSecret("")).code).toBe("empty");
    expect(lanza(() => encryptSecret(undefined as unknown as string)).code).toBe("empty");
  });
});

describe("respaldo a NEXTAUTH_SECRET (igual que auth.ts)", () => {
  it("cifra y descifra cuando solo existe NEXTAUTH_SECRET", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("ENCRYPTION_KEY", "");
    vi.stubEnv("NEXTAUTH_SECRET", "secreto-solo-nextauth-para-derivar-la-clave-1234");
    const guardado = encryptSecret("p_key_de_prueba");
    expect(decryptSecret(guardado)).toBe("p_key_de_prueba");
  });
});
