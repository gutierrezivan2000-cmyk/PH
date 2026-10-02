/**
 * Base de datos falsa en memoria, SOLO para pruebas de las rutas de Reuniones.
 *
 * Implementa lo mínimo de la API de Prisma que usan esas rutas (igualdad, `in`, `NOT`, orden, conteo,
 * agregado de máximo y transacciones de lista). No es Prisma: sirve para comprobar la lógica de la ruta
 * (estados, pertenencia, idempotencia), no las consultas SQL.
 */
type Fila = Record<string, unknown>;
type Donde = Record<string, unknown> | undefined;

function coincide(fila: Fila, donde: Donde): boolean {
  return Object.entries(donde ?? {}).every(([clave, valor]) => {
    if (clave === "NOT") return !coincide(fila, valor as Donde);
    if (valor && typeof valor === "object" && !(valor instanceof Date) && "in" in valor) {
      return (valor as { in: unknown[] }).in.includes(fila[clave]);
    }
    return fila[clave] === valor;
  });
}

export class TablaFalsa {
  filas: Fila[] = [];
  private secuencia = 0;
  constructor(private readonly prefijo: string) {}

  async findFirst({ where }: { where?: Donde } = {}) {
    return this.filas.find((f) => coincide(f, where)) ?? null;
  }

  async findMany({ where, orderBy }: { where?: Donde; orderBy?: Array<Record<string, "asc" | "desc">> | Record<string, "asc" | "desc"> } = {}) {
    const hallados = this.filas.filter((f) => coincide(f, where));
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
    const fila: Fila = { id: `${this.prefijo}${++this.secuencia}`, createdAt: new Date(), updatedAt: new Date(), ...data };
    this.filas.push(fila);
    return fila;
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

  async aggregate({ where, _max }: { where?: Donde; _max: Record<string, true> }) {
    const hallados = this.filas.filter((f) => coincide(f, where));
    const resultado: Record<string, number | null> = {};
    for (const clave of Object.keys(_max)) {
      resultado[clave] = hallados.length ? Math.max(...hallados.map((f) => f[clave] as number)) : null;
    }
    return { _max: resultado };
  }
}

export function crearDbFalsa() {
  return {
    meeting: new TablaFalsa("m"),
    meetingSource: new TablaFalsa("s"),
    generation: new TablaFalsa("g"),
    propertyPerson: new TablaFalsa("p"),
    property: new TablaFalsa("c"),
    // Las operaciones ya se lanzaron al armar la lista: basta con esperarlas todas.
    $transaction: async (operaciones: Promise<unknown>[]) => Promise.all(operaciones),
  };
}

export type DbFalsa = ReturnType<typeof crearDbFalsa>;
