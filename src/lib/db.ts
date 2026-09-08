import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Demo-mode stand-in for the Prisma client.
 *
 * It used to be a bare `{}`, so a route that forgot its demo guard blew up with
 * `Cannot read properties of undefined (reading 'findMany')` — a 500 with no
 * hint of which route or which model. This proxy throws the same way (any use
 * of the DB in demo IS a bug) but names the exact call, so the omission is
 * obvious in the log instead of needing a bisect.
 */
function createDemoStub(): PrismaClient {
  const fail = (path: string) => () => {
    throw new Error(
      `[demo] db.${path}() con DEMO_MODE=true. Esta ruta necesita su rama de demo ANTES de tocar \`db\`.`
    );
  };
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method) => fail(`${name}.${String(method)}`) });

  return new Proxy(
    {},
    {
      get(_t, prop) {
        // Symbols and `then` must stay undefined: awaiting or inspecting the
        // stub should not itself throw, only actually querying should.
        if (typeof prop === "symbol" || prop === "then") return undefined;
        const key = String(prop);
        return key.startsWith("$") ? fail(key) : model(key);
      },
    }
  ) as PrismaClient;
}

function createPrismaClient(): PrismaClient {
  if (process.env.DEMO_MODE === "true") return createDemoStub();

  // Dynamic require to avoid crashing in demo when pg is not configured
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaPg } = require("@prisma/adapter-pg");
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
