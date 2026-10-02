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
    if (valor && typeof valor === "object" && !(valor instanceof Date)) {
      const operadores = valor as Record<string, unknown>;
      if ("in" in operadores) return (operadores.in as unknown[]).includes(fila[clave]);
      const comparadores = Object.keys(operadores).filter((k) => k in COMPARADORES);
      if (comparadores.length > 0) {
        return comparadores.every((k) => COMPARADORES[k](Number(fila[clave]), Number(operadores[k])));
      }
    }
    return fila[clave] === valor;
  });
}

/** Un choque de clave única, con el código que usa Prisma. */
export const errorUnico = () => Object.assign(new Error("P2002: restricción de unicidad"), { code: "P2002" });

const valorNumerico = (v: unknown) => (v instanceof Date ? v.getTime() : (v as number));

export class TablaFalsa {
  filas: Fila[] = [];
  private secuencia = 0;
  /** `unico`: campos que juntos no pueden repetirse (como un @@unique de Prisma). */
  constructor(private readonly prefijo: string, private readonly unico: string[] = []) {}

  async findFirst({ where }: { where?: Donde } = {}) {
    return this.filas.find((f) => coincide(f, where)) ?? null;
  }

  async findMany({ where, orderBy, distinct }: {
    where?: Donde;
    orderBy?: Array<Record<string, "asc" | "desc">> | Record<string, "asc" | "desc">;
    distinct?: string[];
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
    return hallados.sort((a, b) => {
      for (const criterio of criterios) {
        const [clave, sentido] = Object.entries(criterio)[0];
        const x = a[clave] as number | string | Date;
        const y = b[clave] as number | string | Date;
        if (x < y) return sentido === "asc" ? -1 : 1;
        if (x > y) return sentido === "asc" ? 1 : -1;
      }
      return 0;
    });
  }

  async count({ where }: { where?: Donde } = {}) {
    return this.filas.filter((f) => coincide(f, where)).length;
  }

  async create({ data }: { data: Fila }) {
    if (this.unico.length && this.filas.some((f) => this.unico.every((c) => f[c] === data[c]))) throw errorUnico();
    const fila: Fila = { id: `${this.prefijo}${++this.secuencia}`, createdAt: new Date(), updatedAt: new Date(), ...data };
    this.filas.push(fila);
    return fila;
  }

  /** `where` puede ser un selector compuesto de Prisma ({ meetingId_session_seq: { … } }): se usa lo de adentro. */
  async upsert({ where, create, update }: { where: Fila; create: Fila; update: Fila }) {
    const valores = Object.values(where);
    const filtro = valores.length === 1 && valores[0] && typeof valores[0] === "object" ? (valores[0] as Fila) : where;
    const fila = this.filas.find((f) => coincide(f, filtro));
    if (fila) return Object.assign(fila, update);
    return this.create({ data: create });
  }

  async update({ where, data }: { where: Fila; data: Fila }) {
    const fila = this.filas.find((f) => coincide(f, where));
    if (!fila) throw new Error("P2025: registro no encontrado");
    Object.assign(fila, data);
    return fila;
  }

  async updateMany({ where, data }: { where?: Donde; data: Fila }) {
    const hallados = this.filas.filter((f) => coincide(f, where));
    for (const f of hallados) Object.assign(f, data);
    return { count: hallados.length };
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
    meetingMarker: new TablaFalsa("k"),
    generation: new TablaFalsa("g"),
    propertyPerson: new TablaFalsa("p"),
    property: new TablaFalsa("c"),
    // Las operaciones ya se lanzaron al armar la lista: basta con esperarlas todas.
    $transaction: async (operaciones: Promise<unknown>[]) => Promise.all(operaciones),
  };
}

export type DbFalsa = ReturnType<typeof crearDbFalsa>;
