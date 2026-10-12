import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cada ruta o lectura que consulta una tabla del SQL de arranque llama a su ensure*Schema ANTES de la primera consulta a la base.
 * El `build` ya no empuja el esquema (`prisma db push` fallaba en cada despliegue): una tabla existe en producción solo si alguna de
 * esas funciones la creó. Sin la llamada, la ruta moría con «relation does not exist» en una base sin migrar.
 *
 * Es una prueba dirigida por tabla: cada caso corre la ruta con una base y unos ensure* simulados que anotan en un registro común, en
 * orden, cada llamada («ensure:agentes», «db:agentMemory.upsert»…), y exige que el ensure de la familia correcta aparezca antes de la
 * primera consulta de cada modelo. Las pantallas de servidor que no se pueden ejecutar aquí (la página de métricas) y las de cliente
 * (cartera, presupuesto) se comprueban sobre el código fuente al final.
 */

const h = vi.hoisted(() => {
  const orden: string[] = [];
  const respuestas = new Map<string, unknown>();
  /** db.<modelo>.<método>(...) anota «db:modelo.método» y devuelve lo configurado en `respuestas` (o null). */
  const db = new Proxy(
    {},
    {
      get(_t, modelo) {
        if (typeof modelo === "symbol" || modelo === "then") return undefined;
        return new Proxy(
          {},
          {
            get(_m, metodo) {
              return () => {
                orden.push(`db:${String(modelo)}.${String(metodo)}`);
                return Promise.resolve(respuestas.get(`${String(modelo)}.${String(metodo)}`) ?? null);
              };
            },
          }
        );
      },
    }
  );
  return { orden, respuestas, db };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => void h.orden.push("ensure:admin") }));
vi.mock("@/lib/ensure-agent-tables", () => ({ ensureAgentTables: async () => void h.orden.push("ensure:agentes"), isMissingRelationError: () => false }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => void h.orden.push("ensure:reuniones") }));
vi.mock("@/lib/ensure-operacion-schema", () => ({ ensureOperacionSchema: async () => void h.orden.push("ensure:operacion") }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1", email: "ana@x.co" } }) }));
// Los limitadores tocan la base: aquí cuentan como «primera consulta» y deniegan para que la ruta termine enseguida.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => {
    h.orden.push("db:rateLimit");
    return { allowed: false, retryAfterSec: 1 };
  },
  clientIp: () => "1.2.3.4",
}));
vi.mock("@/lib/admin-auth", () => ({ requireAdminOr401: async () => ({ userId: "admin1" }) }));
vi.mock("@/lib/meetings/cola", () => ({ vigilante: async () => (h.orden.push("db:cola.vigilante"), 0) }));
vi.mock("@/lib/meetings/acta-orquestador", () => ({ avanzarActasEnCurso: async () => void h.orden.push("db:acta.avanzar") }));
vi.mock("@/lib/meetings/trabajador", () => ({ trabajar: async () => (h.orden.push("db:trabajador"), { procesadas: 0 }) }));
vi.mock("@react-pdf/renderer", () => ({
  Document: "Document", Page: "Page", Text: "Text", View: "View",
  StyleSheet: { create: <T,>(x: T) => x },
  Font: { registerHyphenationCallback: () => {} },
  renderToBuffer: async () => Buffer.from(""),
}));

const ctx = { params: Promise.resolve({ agentId: "themis" }) };
const json = (body: unknown) => ({ json: async () => body, url: "http://localhost/api" }) as unknown as NextRequest;
const peticion = (url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) => new NextRequest(`http://localhost${url}`, init);

type Caso = {
  nombre: string;
  /** Prefijo de la consulta a la base → marca del ensure que debe haberse llamado ANTES de la primera. */
  antes: Record<string, string>;
  /** Mínimo de llamadas a cada ensure (cuando varias lecturas independientes deben asegurar la suya). */
  minimos?: Record<string, number>;
  respuestas?: Record<string, unknown>;
  correr: () => Promise<unknown>;
};

const PROPIEDAD = { id: "p1", name: "Torres del Parque", address: null, city: null, units: 10, features: null };
const TODO_VISIBLE = { cartera: true, presupuesto: true, pqrs: true, comunicados: true, asambleas: true, certificados: true } as never;
const NADA_VISIBLE = { cartera: false, presupuesto: false, pqrs: false, comunicados: false, asambleas: false, certificados: false } as never;

const CASOS: Caso[] = [
  /* ── agentes: AgentMemory, AgentChat, AgentMessage ── */
  {
    nombre: "memoria del agente · PUT (agentMemory.upsert)",
    antes: { "db:agentMemory.upsert": "ensure:agentes" },
    respuestas: { "agentMemory.upsert": { content: "x" } },
    correr: async () => (await import("../app/api/agents/[agentId]/memory/route")).PUT(json({ content: "recordar esto" }) as NextRequest, ctx),
  },
  {
    nombre: "memoria del agente · GET (agentMemory.findUnique)",
    antes: { "db:agentMemory.findUnique": "ensure:agentes" },
    correr: async () => (await import("../app/api/agents/[agentId]/memory/route")).GET(json({}) as NextRequest, ctx),
  },
  {
    nombre: "chats del agente · DELETE (agentChat.deleteMany)",
    antes: { "db:agentChat.deleteMany": "ensure:agentes" },
    correr: async () => (await import("../app/api/agents/[agentId]/chats/route")).DELETE(peticion("/api/agents/themis/chats?chatId=c1", { method: "DELETE" }), ctx),
  },
  {
    nombre: "chats del agente · GET (agentChat.findMany)",
    antes: { "db:agentChat.findMany": "ensure:agentes" },
    correr: async () => (await import("../app/api/agents/[agentId]/chats/route")).GET(json({}) as NextRequest, ctx),
  },
  {
    nombre: "exportar un chat (agentChat.findFirst)",
    antes: { "db:agentChat.findFirst": "ensure:agentes" },
    correr: async () => (await import("../app/api/agents/[agentId]/chat/export/route")).GET(peticion("/api/agents/themis/chat/export?chatId=c1&format=txt"), ctx),
  },

  /* ── administración: métricas ── */
  {
    nombre: "métricas del panel de administración · GET (usuarios, suscripciones, chats)",
    antes: { "db:user.count": "ensure:admin", "db:agentChat.groupBy": "ensure:agentes", "db:ticket.count": "ensure:admin" },
    correr: async () => (await import("../app/api/admin/metrics/route")).GET(peticion("/api/admin/metrics")).catch(() => {}),
  },

  /* ── cron de reuniones ── */
  {
    nombre: "cron process-meetings (MeetingTask, Meeting, MeetingSource, MeetingLivePart)",
    antes: { "db:cola.vigilante": "ensure:reuniones", "db:trabajador": "ensure:reuniones" },
    correr: async () => {
      vi.stubEnv("CRON_SECRET", "secreto-de-prueba");
      return (await import("../app/api/cron/process-meetings/route")).GET(peticion("/api/cron/process-meetings", { headers: { authorization: "Bearer secreto-de-prueba" } }));
    },
  },

  /* ── autenticación: el limitador (RateLimit) y los códigos (VerificationToken). /api/csp-report NO está aquí a propósito: es un
        endpoint público y de mucho tráfico cuyo limitador falla cerrado y descarta el informe, sin consecuencias; no dispara SQL de arranque. ── */
  {
    nombre: "verificar el correo · POST (RateLimit antes que nada)",
    antes: { "db:rateLimit": "ensure:admin" },
    correr: async () => (await import("../app/api/auth/verify/route")).POST(json({ email: "ana@x.co", code: "123456" }) as NextRequest),
  },
  {
    nombre: "reenviar el código · POST (RateLimit antes que nada)",
    antes: { "db:rateLimit": "ensure:admin" },
    correr: async () => (await import("../app/api/auth/resend-code/route")).POST(json({ email: "ana@x.co" }) as NextRequest),
  },

  /* ── agentes como empleados: lo que leen sus herramientas y su briefing ── */
  {
    nombre: "consultar_operacion · sección «reuniones» (Meeting)",
    antes: { "db:property.findFirst": "ensure:admin", "db:meeting.findMany": "ensure:reuniones" },
    respuestas: { "property.findFirst": PROPIEDAD, "meeting.findMany": [] },
    correr: async () => (await import("./agentes/consultas")).consultarOperacion("u1", NADA_VISIBLE, "p1", { seccion: "reuniones" }),
  },
  {
    nombre: "consultar_operacion · sección «reuniones» con reunionId (meeting.findFirst)",
    antes: { "db:meeting.findFirst": "ensure:reuniones" },
    respuestas: { "property.findFirst": PROPIEDAD },
    correr: async () => (await import("./agentes/consultas")).consultarOperacion("u1", NADA_VISIBLE, "p1", { seccion: "reuniones", reunionId: "m1" }),
  },
  {
    nombre: "consultar_operacion · secciones «actividad» (PropertyEvent) y «memoria» (PropertyMemory)",
    antes: { "db:propertyEvent.findMany": "ensure:operacion" },
    minimos: { "ensure:operacion": 2 },
    respuestas: { "property.findFirst": PROPIEDAD, "propertyEvent.findMany": [], "propertyMemory.findMany": [] },
    correr: async () => {
      const { consultarOperacion } = await import("./agentes/consultas");
      await consultarOperacion("u1", NADA_VISIBLE, "p1", { seccion: "actividad" });
      await consultarOperacion("u1", NADA_VISIBLE, "p1", { seccion: "memoria" });
    },
  },
  {
    nombre: "briefing de una copropiedad (Property, Meeting, PropertyPerson, PropertyMemory, PropertyEvent)",
    antes: {
      "db:property.findFirst": "ensure:admin",
      "db:meeting.findMany": "ensure:reuniones",
      "db:propertyPerson.findMany": "ensure:reuniones",
      "db:propertyMemory.findMany": "ensure:operacion",
      "db:propertyEvent.findMany": "ensure:operacion",
    },
    // Cada lectura independiente asegura la suya: dos de reuniones/personas y dos de memoria/eventos.
    minimos: { "ensure:reuniones": 2, "ensure:operacion": 2 },
    respuestas: {
      "property.findFirst": PROPIEDAD, "complianceRecord.findMany": [], "commonAsset.findMany": [], "meeting.findMany": [], "generation.findMany": [],
      "propertyDocument.findMany": [], "propertyPerson.findMany": [], "propertyMemory.findMany": [], "propertyEvent.findMany": [],
    },
    correr: async () => (await import("./agentes/briefing-datos")).cargarDatosDePropiedad("u1", "p1", NADA_VISIBLE),
  },
  {
    nombre: "contexto operativo del chat (Property de la cuenta)",
    antes: { "db:property.findMany": "ensure:admin" },
    correr: async () => (await import("./agentes/briefing-datos")).contextoOperativo("u1", TODO_VISIBLE),
  },
];

beforeEach(() => {
  h.orden.length = 0;
  h.respuestas.clear();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("cada lectura asegura su esquema ANTES de la primera consulta a la base", () => {
  for (const caso of CASOS) {
    it(caso.nombre, async () => {
      for (const [clave, valor] of Object.entries(caso.respuestas ?? {})) h.respuestas.set(clave, valor);
      await Promise.resolve(caso.correr()).catch(() => {}); // lo que pase DESPUÉS de las consultas no es lo que se prueba

      for (const [prefijo, ensure] of Object.entries(caso.antes)) {
        const consulta = h.orden.findIndex((e) => e.startsWith(prefijo));
        expect(consulta, `la ruta no llegó a «${prefijo}» (registro: ${h.orden.join(" → ")})`).toBeGreaterThanOrEqual(0);
        const llamada = h.orden.indexOf(ensure);
        expect(llamada, `${ensure} no se llamó antes de «${prefijo}» (registro: ${h.orden.join(" → ")})`).toBeGreaterThanOrEqual(0);
        expect(llamada, `${ensure} se llamó DESPUÉS de «${prefijo}» (registro: ${h.orden.join(" → ")})`).toBeLessThan(consulta);
      }
      for (const [ensure, minimo] of Object.entries(caso.minimos ?? {})) {
        expect(h.orden.filter((e) => e === ensure).length, `${ensure} debía llamarse al menos ${minimo} veces`).toBeGreaterThanOrEqual(minimo);
      }
    });
  }

  it("en demo (sin base) las rutas de agentes ni consultan ni aseguran nada", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const memoria = await import("../app/api/agents/[agentId]/memory/route");
    expect((await memoria.PUT(json({ content: "x" }) as NextRequest, ctx)).status).toBe(403);
    expect((await memoria.GET(json({}) as NextRequest, ctx)).status).toBe(200);
    const chats = await import("../app/api/agents/[agentId]/chats/route");
    expect((await chats.GET(json({}) as NextRequest, ctx)).status).toBe(200);
    expect(h.orden).toEqual([]);
  });

  it("una petición inválida ni toca la base ni dispara el SQL de arranque (400 antes de asegurar)", async () => {
    const memoria = await import("../app/api/agents/[agentId]/memory/route");
    expect((await memoria.PUT(json({ content: 42 }) as NextRequest, ctx)).status).toBe(400);
    const chats = await import("../app/api/agents/[agentId]/chats/route");
    expect((await chats.DELETE(peticion("/api/agents/themis/chats", { method: "DELETE" }), ctx)).status).toBe(400);
    const verify = await import("../app/api/auth/verify/route");
    expect((await verify.POST(json({ email: "ana@x.co" }) as NextRequest)).status).toBe(400);
    expect(h.orden).toEqual([]);
  });

});

/* ───────────────────────── Lo que no se puede ejecutar aquí: se comprueba el código fuente ───────────────────────── */

const leer = (ruta: string) => readFileSync(path.resolve(process.cwd(), ruta), "utf8");

describe("pantallas y rutas que se comprueban sobre el código fuente", () => {
  it("la página de métricas (servidor) asegura el esquema de administración y el de agentes ANTES de leer", () => {
    const fuente = leer("src/app/admin/metricas/page.tsx");
    const carga = fuente.indexOf("async function loadMetrics()");
    expect(carga).toBeGreaterThan(0);
    const cuerpo = fuente.slice(carga);
    const admin = cuerpo.indexOf("await ensureAdminSchema()");
    const agentes = cuerpo.indexOf("await ensureAgentTables()");
    const primeraConsulta = cuerpo.indexOf("db.");
    expect(admin).toBeGreaterThanOrEqual(0);
    expect(agentes).toBeGreaterThan(admin); // las tablas de los agentes cuelgan de User
    expect(primeraConsulta).toBeGreaterThan(agentes);
    expect(fuente).toContain('from "@/lib/ensure-admin-schema"');
    expect(fuente).toContain('from "@/lib/ensure-agent-tables"');
  });

  it("las pantallas de cartera y presupuesto son componentes de cliente (no pueden tocar la base): sus rutas de API aseguran el esquema con requireCartera", () => {
    for (const pagina of ["src/app/(dashboard)/dashboard/cartera/page.tsx", "src/app/(dashboard)/dashboard/presupuesto/page.tsx"]) {
      const fuente = leer(pagina);
      expect(fuente.trimStart().startsWith('"use client"'), `${pagina} debe ser de cliente`).toBe(true);
      expect(fuente, `${pagina} no debe importar la base`).not.toMatch(/@\/lib\/(db|ensure-)/);
    }
    // requireCartera asegura el esquema una sola vez para todas las rutas que lo llaman…
    const servidor = leer("src/lib/cartera-server.ts");
    expect(servidor).toContain("await ensureAdminSchema()");
    // …y todas las rutas de cartera y presupuesto lo llaman antes de su primera consulta.
    const rutas = ["src/app/api/cartera", "src/app/api/presupuesto"].flatMap((raiz) =>
      (readdirSync(path.resolve(process.cwd(), raiz), { recursive: true }) as string[]).filter((f) => f.endsWith("route.ts")).map((f) => path.join(raiz, f))
    );
    expect(rutas.length).toBeGreaterThanOrEqual(8);
    for (const ruta of rutas) {
      const fuente = leer(ruta);
      const guarda = fuente.indexOf("requireCartera(");
      const consulta = fuente.search(/\bdb\./);
      expect(guarda, `${ruta} debe pasar por requireCartera`).toBeGreaterThanOrEqual(0);
      if (consulta >= 0) expect(guarda, `${ruta}: requireCartera antes de la primera consulta`).toBeLessThan(consulta);
    }
  });
});
