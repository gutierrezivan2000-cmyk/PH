# Plan de lanzamiento de los módulos pausados

> Estado al 9 de octubre de 2026. Sale de auditar el código de los seis módulos en «Próximamente»
> (Cartera, Presupuesto, Certificados, Asambleas, Comunicados, PQRS) y de los cuatro agentes add-on
> pausados (Metra, Nomethes, Hermes, Logistes). Complementa `ROADMAP_PRODUCTO.md` (el «qué» a largo plazo):
> este documento es el «cómo» para llevar lo que ya existe a un lanzamiento público.

---

## 1. Diagnóstico

**Hay mucho más construido de lo que dice el roadmap.** Los seis módulos tienen pantallas, APIs y tablas que
funcionan contra la base real. Lo que les falta para el público es **integridad** (que no se dupliquen cobros, que
un pago siempre se acredite, que un paz y salvo no mienta), **cumplimiento** (términos legales, habeas data,
validez de votaciones) y **pruebas**.

| Módulo | Construido | Lo que impide lanzarlo |
|---|---|---|
| **Certificados** | Emisión, impresión con QR, verificación pública, revocar | El paz y salvo no consulta la cartera (puede afirmar algo falso); revocar es reversible y sin rastro; el QR toma el dominio de la petición |
| **Comunicados** | Redacción con IA, envío por correo (Resend), cupo por plan, historial, vista en el portal | Sin registro por destinatario, rebotes, desuscripción ni reintentos; todos los clientes envían desde el mismo dominio; doble clic envía dos veces |
| **PQRS** | Radicación desde el portal, bandeja, respuesta, estados, aviso por correo | Sin plazos de Ley 1755 ni festivos, sin radicado consecutivo, sin adjuntos ni asignación; la IA no redacta respuestas con el reglamento |
| **Cartera** | Unidades e importación, causación, abonos, intereses, cartas de cobro, estado de cuenta, portal con pago ePayco, conciliación por cron | Cobros duplicables, pagos que pueden quedar sin acreditar, saldo a favor que no se aplica, intereses mal calculados al reprocesar, borrados sin rastro, sin pantalla para pagos «en revisión» |
| **Presupuesto** | Rubros, movimientos, ejecución, fondo de imprevistos, exportación a Excel | No se alimenta del recaudo; fondo sin arrastre entre años; sin versión aprobada |
| **Asambleas** | Convocatoria con plazo de 15 días, impresión, estados, calendario | No hay asistencia, quórum por coeficiente, poderes ni votación (el corazón del módulo) |
| **Agentes add-on** | Chat con su prompt; activables a mano desde el panel | No leen los datos del módulo (Metra no ve la cartera); no se pueden comprar |

### Problemas que comparten todos

1. **El «Próximamente» solo esconde el menú.** Las APIs de casi todos los módulos responden hoy a cualquier
   cuenta con sesión (por ejemplo, `POST /api/announcements` envía correos a todos los residentes). Solo
   `portal/pay` y `portal/pqrs` revisan la bandera en el servidor. **Es lo primero que hay que cerrar.**
2. **Sin pruebas de rutas.** Hay pruebas de lógica pura (cartera, presupuesto, plazos), ninguna de APIs, pagos,
   cron ni aislamiento entre clientes.
3. **La unidad tiene un solo contacto.** No distingue propietario de arrendatario ni guarda consentimiento;
   Asambleas, Comunicados y Cartera lo necesitan.
4. **El esquema se aplica con `prisma db push --accept-data-loss`** en cada build, más una copia a mano en
   `ensure-admin-schema.ts`. Con tablas de dinero y votos, eso es un riesgo: hay que pasar a migraciones.
5. **El correo no está listo para envíos masivos por cliente** (dominio compartido, sin webhooks de rebote).
6. **Los enlaces del portal** no caducan, se pueden indexar y en dos rutas se arman con el encabezado `Host`.
7. **No hay compra de add-ons:** Metra, Hermes, Logistes y Nomethes solo se activan a mano.

---

## 2. Cómo se lanza cada módulo (igual que Reuniones)

Cada módulo pasa por tres puertas, con una bandera por módulo en vez de un sí/no global:

`oculto` → `piloto` (admins + lista de cuentas invitadas) → `todos`

- La bandera se revisa **en el servidor** (página, API, cron, impresión), con una sola función, como
  `exigirVisible` de Reuniones.
- Cada función nueva de IA se agrega al catálogo de consumo (`src/lib/consumo/funciones.ts`) para medir su costo
  desde el primer día.
- Cada módulo sale con su texto legal actualizado y sus pruebas de ruta y de aislamiento.
- **Definición de «listo para el público»:** la bandera se aplica en el servidor; hay pruebas de rutas, de
  aislamiento entre clientes y de los casos de dinero o votos; hubo un piloto con 2 o 3 administradores reales
  durante 2 semanas sin incidentes; el texto legal está revisado y el consumo de IA, medido.

---

## 3. Fases

### Fase 0 — Cimientos (1 a 2 semanas, antes de todo)

1. **Bandera en el servidor** para los seis módulos (urgente: hoy las APIs están abiertas).
2. **Migraciones reales** (`prisma migrate`) en lugar de `db push --accept-data-loss`, empezando por un
   *baseline* del esquema actual.
3. **Contactos por unidad:** propietario / arrendatario / representante, varios correos y teléfonos,
   consentimiento con fecha y versión.
4. **Días hábiles con festivos de Colombia** (los usan PQRS, Asambleas y Cartera).
5. **Correo:** envío en cola con reintentos, registro por destinatario, webhook de Resend (entregado, rebotado,
   queja), lista de supresión, `List-Unsubscribe` y página para darse de baja.
6. **Portal:** `noindex`, `Referrer-Policy`, `NEXT_PUBLIC_APP_URL` obligatorio, rotación del enlace por unidad.
7. **Compra de add-ons** con ePayco (hoy solo existe la del plan) y cupos por add-on.
8. **Banco de pruebas de rutas** reutilizando la base falsa de Reuniones (`db-falsa.ts`).

### Fase 1 — Lo más cercano (2 a 3 semanas)

**Certificados**
- El paz y salvo consulta la cartera: si la unidad debe, no se emite (o se emite como «estado de cuenta»), y se
  guarda el saldo verificado al emitir.
- Revocar es definitivo, con motivo, quién y cuándo.
- QR con el dominio fijo; límite de consultas en `/verificar`; vigencia por defecto; documento de identidad
  minimizado.
- Mientras Cartera no esté abierta: el administrador declara el saldo al emitir y queda registrado.

**Comunicados + Hermes**
- Destinatarios por segmento (todos, torre, morosos), borradores, programación, adjuntos.
- Confirmación de lectura por enlace firmado del portal.
- Envío idempotente y cupo reservado de forma atómica.
- Hermes con herramientas: redactar un comunicado o respuesta y dejarlo como borrador para aprobar.
- WhatsApp: seguir con «copiar texto» hasta decidir la API de Meta (tiene costo por conversación).

### Fase 2 — PQRS (2 a 3 semanas)

- Radicado consecutivo por copropiedad; vencimiento en días hábiles según el tipo (Ley 1755 de 2015: 15 días
  general, 10 documentos, 30 consultas) con prórroga y semáforo en el calendario.
- Acuse al residente, alerta al administrador, réplicas del residente, adjuntos, asignación y bitácora de estados.
- Casilla de habeas data en el formulario del portal; correo del residente verificado.
- Respuesta sugerida por IA citando el reglamento de esa copropiedad (`getReglamentoText`).
- Después, como segunda entrega: proceso sancionatorio con debido proceso (llamado de atención → pliego →
  descargos → sanción).

### Fase 3 — Cartera + Metra (4 a 6 semanas) — el módulo más valioso y el más delicado

**Integridad del dinero (bloqueante):**
- Índice único por cobro (unidad, tipo, mes, año) y causación en transacción.
- Una firma inválida en la confirmación de ePayco ya no saca el pedido de «pendiente» (hoy puede dejar un pago
  real sin acreditar).
- El cron de conciliación verifica comercio y factura.
- Pantalla para pagos «en revisión» con acreditación manual.
- Llave privada de ePayco cifrada; comparación de firma en tiempo constante.

**Contabilidad correcta:**
- El saldo a favor se aplica a los cobros nuevos.
- Intereses calculados al corte, con tope legal configurable (tasa de usura certificada por la Superfinanciera).
- Anulaciones en lugar de borrados, con bitácora.
- Recibos numerados en PDF y cierre de periodo.
- Causación automática mensual opcional; coeficientes que sumen 100 %.

**Metra con herramientas:** consultar la cartera por edades, quién debe, proyección de recaudo; sus sugerencias hoy
prometen datos que no ve.

**Piloto con dinero real:** 2 o 3 administradores con su propio comercio ePayco, primero en modo de pruebas.

### Fase 4 — Presupuesto (1 a 2 semanas, después de Cartera)

- Los ingresos se alimentan del recaudo real.
- El fondo de imprevistos arrastra su saldo entre años.
- Presupuesto aprobado en asamblea como versión bloqueada; vista mensual de ejecución vs presupuesto.

### Fase 5 — Asambleas + Nomethes (6 a 8 semanas, en dos entregas)

**Entrega A — Asamblea presencial asistida:**
- Asistencia por unidad con poderes (quién representa a quién, tope por apoderado).
- Quórum por coeficiente en vivo, con segunda convocatoria (Art. 41).
- Enlace con Reuniones: la grabación y el acta usan la asistencia y el quórum oficiales, no los que la IA deduce
  del audio.
- Constancia de envío de la convocatoria.

**Entrega B — Votación electrónica:**
- Mociones con su tipo de mayoría (simple, 70 % del Art. 46, unanimidad).
- Un voto por unidad o poder garantizado por la base de datos, credencial de voto por asamblea y unidad (no el
  enlace permanente del portal), votos inmutables con huella de auditoría y resultado congelado al cierre.
- Reuniones no presenciales y mixtas (Art. 42 y 43).
- Nomethes con herramientas: preparar el orden del día, explicar mayorías, redactar proposiciones.

### Paralelo — Bitácora + Logistes

- Editar fichas, historial de intervenciones con costos y adjuntos, y recordatorios de vencimiento de pólizas por
  correo (cron).
- Logistes con herramientas sobre la bitácora.

---

## 4. Calendario indicativo (un desarrollador con IA, sin contar pilotos)

| Semanas | Entrega |
|---|---|
| 1–2 | Fase 0 completa |
| 3–4 | Certificados (público) · Comunicados en piloto |
| 5–6 | Comunicados + Hermes (público) · PQRS en piloto |
| 7–8 | PQRS (público) · Cartera en piloto (sin pagos en línea) |
| 9–12 | Cartera con pagos en línea en piloto → público · Metra |
| 13–14 | Presupuesto (público) |
| 15–22 | Asambleas A (público) → Asambleas B en piloto → público · Nomethes |

---

## 5. Decisiones que necesita el dueño

1. **Empaquetado:** qué módulo va en qué plan (hoy PQRS y Cartera exigen Business). Con la medición de consumo
   ya activa se puede fijar el precio de cada uno.
2. **Correo por cliente:** ¿cada administración envía desde su propio dominio verificado, o desde un subdominio de
   SOPH.IA por cliente?
3. **WhatsApp Business API:** ¿se asume el costo por conversación y en qué plan?
4. **Pagos:** mantener que cada administrador use su propio comercio ePayco (SOPH.IA nunca toca el dinero) o
   explorar un recaudo con comisión (implica regulación financiera).
5. **Revisión legal:** validez de la votación electrónica, texto del paz y salvo, tope de intereses de mora,
   proceso sancionatorio.
6. **Pilotos:** 2 o 3 administradores reales por módulo, con su consentimiento.
