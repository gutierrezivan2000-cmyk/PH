import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake de la base: `$transaction` mantiene un único turno (como el bloqueo de fila de la copropiedad) y el conteo tiene
// una pausa, para que dos guardados simultáneos se crucen si el conteo no va dentro de la transacción.
const { db, estado } = vi.hoisted(() => {
  const estado = { notas: [] as { propertyId: string; userId: string; content: string }[], turno: Promise.resolve() };
  const tic = () => new Promise((r) => setTimeout(r, 5));
  const tx = {
    $queryRaw: async () => [],
    propertyMemory: {
      count: async ({ where }: { where: { propertyId: string; userId: string } }) => {
        const n = estado.notas.filter((x) => x.propertyId === where.propertyId && x.userId === where.userId).length;
        await tic();
        return n;
      },
      findFirst: async ({ where }: { where: { propertyId: string; userId: string; content: string } }) => {
        await tic();
        const hallada = estado.notas.find((x) => x.propertyId === where.propertyId && x.userId === where.userId && x.content === where.content);
        return hallada ? { id: "x" } : null;
      },
      create: async ({ data }: { data: { propertyId: string; userId: string; content: string } }) => {
        estado.notas.push({ propertyId: data.propertyId, userId: data.userId, content: data.content });
        return { id: "n" };
      },
    },
  };
  const db = {
    property: { findFirst: async () => ({ id: "p1" }) },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      const previo = estado.turno;
      let liberar!: () => void;
      estado.turno = new Promise<void>((r) => (liberar = r));
      await previo;
      try {
        return await fn(tx);
      } finally {
        liberar();
      }
    },
  };
  return { db, estado };
});
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-operacion-schema", () => ({ ensureOperacionSchema: async () => {} }));

import { TOPE_DE_NOTAS_POR_PROPIEDAD, guardarNota } from "./consultas";

beforeEach(() => {
  estado.notas.length = 0;
  estado.turno = Promise.resolve();
});

describe("guardarNota: tope y duplicados", () => {
  it("guarda una nota nueva en la copropiedad del foco", async () => {
    const r = await guardarNota("u1", "metra", "p1", { contenido: "El ascensor 2 se revisa los martes." });
    expect(r).toMatch(/Nota guardada/);
    expect(estado.notas).toHaveLength(1);
  });

  it("no guarda una nota igual a una que ya existe", async () => {
    estado.notas.push({ propertyId: "p1", userId: "u1", content: "El ascensor 2 se revisa los martes." });
    const r = await guardarNota("u1", "metra", "p1", { contenido: "El ascensor 2 se revisa los martes." });
    expect(r).toBe("Esa nota ya estaba guardada.");
    expect(estado.notas).toHaveLength(1);
  });

  it("con la memoria llena, responde que está llena y no guarda", async () => {
    for (let i = 0; i < TOPE_DE_NOTAS_POR_PROPIEDAD; i++) estado.notas.push({ propertyId: "p1", userId: "u1", content: `nota ${i} de relleno` });
    const r = await guardarNota("u1", "metra", "p1", { contenido: "Una más que no debe entrar" });
    expect(r).toMatch(/está llena/);
    expect(estado.notas).toHaveLength(TOPE_DE_NOTAS_POR_PROPIEDAD);
  });

  it("dos notas a la vez con un solo lugar libre: solo entra una (el tope no se rebasa)", async () => {
    for (let i = 0; i < TOPE_DE_NOTAS_POR_PROPIEDAD - 1; i++) estado.notas.push({ propertyId: "p1", userId: "u1", content: `nota ${i} de relleno` });
    // Se traslapan (la segunda empieza mientras la primera aún cuenta), pero no en el mismo instante: vitest se salta el
    // simulacro cuando dos import() dinámicos de un módulo simulado ocurren a la vez.
    const primera = guardarNota("u1", "metra", "p1", { contenido: "Primera nota simultánea" });
    await new Promise((r) => setTimeout(r, 10));
    const segunda = guardarNota("u1", "metra", "p1", { contenido: "Segunda nota simultánea" });
    const [a, b] = await Promise.all([primera, segunda]);
    expect(estado.notas).toHaveLength(TOPE_DE_NOTAS_POR_PROPIEDAD);
    expect([a, b].filter((r) => r.includes("está llena"))).toHaveLength(1);
  });
});
