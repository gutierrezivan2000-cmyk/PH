/**
 * Base de datos falsa en memoria, SOLO para pruebas de las rutas de Reuniones.
 *
 * Implementa lo mínimo de la API de Prisma que usan esas rutas (igualdad, `in`, `NOT`, orden, conteo,
 * agregado de máximo y transacciones de lista). No es Prisma: sirve para comprobar la lógica de la ruta
 * (estados, pertenencia, idempotencia), no las consultas SQL.
 */
type Fila = Record<string, unknown>;
type Donde = Record<string, unknown> | undefined;

const COMPARADORES: Record<string, (x: number, y: number) => boolean> = {
  gte: (x, y) => x >= y,
  gt: (x, y) => x > y,
  lte: (x, y) => x <= y,
  lt: (x, y) => x < y,
};

function coincide(fila: Fila, donde: Donde): boolean {
  return Object.entries(donde ?? {}).every(([clave, valor]) => {
    if (clave === "NOT") return !coincide(fila, valor as Donde);
    if (clave === "OR") return (valor as Donde[]).some((d) => coincide(fila, d));
    if (clave === "AND") return (valor as Donde[]).every((d) => coincide(fila, d));
    if (valor && typeof valor === "object" && !(valor instanceof Date)) {
      const operadores = valor as Record<string, unknown>;
      if ("in" in operadores) return (operadores.in as unknown[]).includes(fila[clave]);
      if ("startsWith" in operadores) return typeof fila[clave] === "string" && (fila[clave] as string).startsWith(String(operadores.startsWith));
      // `{ not: valor }`: distinto de ese valor (y `{ not: null }` es «tiene algo», como en Prisma).
      if ("not" in operadores) return operadores.not === null ? fila[clave] !== null && fila[clave] !== undefined : fila[clave] !== operadores.not;
      const comparadores = Object.keys(operadores).filter((k) => k in COMPARADORES);
      if (comparadores.length > 0) {
        return comparadores.every((k) => COMPARADORES[k](Number(fila[clave]), Number(operadores[k])));
      }
    }
    // Una columna sin valor es null, como en la base de datos.
    if (valor === null) return fila[clave] === null || fila[clave] === undefined;
    // Las fechas se comparan por valor, como en la base de datos.
    if (valor instanceof Date && fila[clave] instanceof Date) return valor.getTime() === (fila[clave] as Date).getTime();
    return fila[clave] === valor;
  });
}

/** Un choque de clave única, con el código que usa Prisma. */
export const errorUnico = () => Object.assign(new Error("P2002: restricción de unicidad"), { code: "P2002" });

const valorNumerico = (v: unknown) => (v instanceof Date ? v.getTime() : (v as number));

export class TablaFalsa {
  filas: Fila[] = [];
  private secuencia = 0;
  /**
   * `unico`: campos que juntos no pueden repetirse (como un @@unique de Prisma). `defaults`: valores por omisión de
   * las columnas con `@default` (se evalúa en cada creación).
   */
  constructor(private readonly prefijo: string, private readonly unico: string[] = [], private readonly defaults: () => Fila = () => ({})) {}

  /** Como Prisma, lo que se lee es una copia (y, con `select`, solo esas columnas): cambiarla no cambia la tabla. */
  private copia(f: Fila, select?: Record<string, unknown>): Fila {
    if (!select) return { ...f };
    const salida: Fila = {};
    for (const [clave, pedido] of Object.entries(select)) if (pedido && clave in f) salida[clave] = f[clave];
    return salida;
  }

  async findFirst({ where, select, orderBy }: { where?: Donde; select?: Record<string, unknown>; orderBy?: Array<Record<string, "asc" | "desc">> | Record<string, "asc" | "desc"> } = {}) {
    // Con `orderBy`, la primera fila según ese orden (como Prisma); sin él, la primera que coincide.
    if (orderBy) return (await this.findMany({ where, orderBy, take: 1, select }))[0] ?? null;
    const f = this.filas.find((x) => coincide(x, where));
    return f ? this.copia(f, select) : null;
  }

  /** `findUnique` de Prisma: aquí es lo mismo que buscar el primero (los `where` únicos ya identifican una fila). */
  async findUnique(args: { where: Donde; select?: Record<string, unknown> }) {
    return this.findFirst(args);
  }

  async findMany({ where, orderBy, distinct, take, select }: {
    where?: Donde;
    orderBy?: Array<Record<string, "asc" | "desc">> | Record<string, "asc" | "desc">;
    distinct?: string[];
    take?: number;
    select?: Record<string, unknown>;
  } = {}) {
    let hallados = this.filas.filter((f) => coincide(f, where));
    if (distinct?.length) {
      const vistos = new Set<string>();
      hallados = hallados.filter((f) => {
        const clave = JSON.stringify(distinct.map((c) => f[c]));
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
      });
    }
    const criterios = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
    const ordenados = hallados.sort((a, b) => {
      for (const criterio of criterios) {
        const [clave, sentido] = Object.entries(criterio)[0];
        const x = a[clave] as number | string | Date;
        const y = b[clave] as number | string | Date;
        if (x < y) return sentido === "asc" ? -1 : 1;
        if (x > y) return sentido === "asc" ? 1 : -1;
      }
      return 0;
    });
    return (take === undefined ? ordenados : ordenados.slice(0, take)).map((f) => this.copia(f, select));
  }

  async count({ where }: { where?: Donde } = {}) {
    return this.filas.filter((f) => coincide(f, where)).length;
  }

  /** Inserta varias filas (como `createMany` de Prisma). */
  async createMany({ data }: { data: Fila[] }) {
    for (const fila of data) await this.create({ data: fila });
    return { count: data.length };
  }

  async create({ data }: { data: Fila }) {
    if (this.unico.length && this.filas.some((f) => this.unico.every((c) => f[c] === data[c]))) throw errorUnico();
    const fila: Fila = { id: `${this.prefijo}${++this.secuencia}`, createdAt: new Date(), updatedAt: new Date(), ...this.defaults(), ...data };
    this.filas.push(fila);
    return this.copia(fila);
  }

  /** `where` puede ser un selector compuesto de Prisma ({ meetingId_session_seq: { … } }): se usa lo de adentro. */
  async upsert({ where, create, update }: { where: Fila; create: Fila; update: Fila }) {
    const valores = Object.values(where);
    const filtro = valores.length === 1 && valores[0] && typeof valores[0] === "object" ? (valores[0] as Fila) : where;
    const fila = this.filas.find((f) => coincide(f, filtro));
    if (fila) {
      this.aplicar(fila, update);
      return this.copia(fila);
    }
    return this.create({ data: create });
  }

  /** Aplica `data` a una fila, entendiendo `{ increment: n }` y `{ decrement: n }` como Prisma. */
  private aplicar(fila: Fila, data: Fila) {
    for (const [clave, valor] of Object.entries(data)) {
      if (valor && typeof valor === "object" && !(valor instanceof Date) && ("increment" in valor || "decrement" in valor)) {
        const v = valor as { increment?: number; decrement?: number };
        fila[clave] = (Number(fila[clave]) || 0) + (v.increment ?? 0) - (v.decrement ?? 0);
      } else if (valor !== undefined) {
        fila[clave] = valor;
      }
    }
    fila.updatedAt = new Date();
  }

  async update({ where, data }: { where: Fila; data: Fila }) {
    const fila = this.filas.find((f) => coincide(f, where));
    if (!fila) throw new Error("P2025: registro no encontrado");
    this.aplicar(fila, data);
    return this.copia(fila);
  }

  async updateMany({ where, data }: { where?: Donde; data: Fila }) {
    const hallados = this.filas.filter((f) => coincide(f, where));
    for (const f of hallados) this.aplicar(f, data);
    return { count: hallados.length };
  }

  async deleteMany({ where }: { where?: Donde } = {}) {
    const antes = this.filas.length;
    this.filas = this.filas.filter((f) => !coincide(f, where));
    return { count: antes - this.filas.length };
  }

  async delete({ where }: { where: Fila }) {
    const i = this.filas.findIndex((f) => coincide(f, where));
    if (i < 0) throw new Error("P2025: registro no encontrado");
    return this.filas.splice(i, 1)[0];
  }

  async aggregate({ where, _max, _sum, _count }: {
    where?: Donde;
    _max?: Record<string, true>;
    _sum?: Record<string, true>;
    _count?: true | { _all: true };
  }) {
    const hallados = this.filas.filter((f) => coincide(f, where));
    const maximos: Record<string, number | Date | null> = {};
    for (const clave of Object.keys(_max ?? {})) {
      if (!hallados.length) {
        maximos[clave] = null;
        continue;
      }
      const mayor = hallados.map((f) => f[clave]).reduce((m, v) => (valorNumerico(v) > valorNumerico(m) ? v : m));
      maximos[clave] = mayor as number | Date;
    }
    const sumas: Record<string, number | null> = {};
    for (const clave of Object.keys(_sum ?? {})) {
      sumas[clave] = hallados.length ? hallados.reduce((suma, f) => suma + (f[clave] as number), 0) : null;
    }
    return { _max: maximos, _sum: sumas, _count: _count === true ? hallados.length : { _all: hallados.length } };
  }
}

export function crearDbFalsa() {
  return {
    meeting: new TablaFalsa("m"),
    meetingSource: new TablaFalsa("s"),
    meetingLivePart: new TablaFalsa("v", ["meetingId", "session", "seq"]),
    meetingTask: new TablaFalsa("t", ["meetingId", "key"], () => ({
      status: "pendiente", attempts: 0, payload: {}, result: null, runAfter: new Date(), lockedAt: null, error: null,
    })),
    meetingMarker: new TablaFalsa("k"),
    meetingUtterance: new TablaFalsa("u"),
    meetingSpeaker: new TablaFalsa("h", ["meetingId", "label"], () => ({ name: null, role: null, personId: null, confirmed: false, suggestion: null, talkMs: 0, sampleStartMs: null, sampleEndMs: null })),
    generation: new TablaFalsa("g"),
    propertyPerson: new TablaFalsa("p"),
    usageRecord: new TablaFalsa("r"),
    subscription: new TablaFalsa("b"),
    user: new TablaFalsa("x"),
    property: new TablaFalsa("c"),
    // Las operaciones ya se lanzaron al armar la lista: basta con esperarlas todas.
    $transaction: async (operaciones: Promise<unknown>[]) => Promise.all(operaciones),
  };
}

export type DbFalsa = ReturnType<typeof crearDbFalsa>;
