# SOPH.IA — Roadmap de producto: de generador de documentos a sistema operativo de la copropiedad

> Documento de planeación. Nada de esto está en construcción todavía; es el mapa de
> hacia dónde puede crecer la plataforma, organizado por audiencia, con su encaje
> en los paquetes (Pro / Business / Élite) y una secuencia sugerida.

---

## 1. Tesis estratégica

**Hoy** SOPH.IA es un *generador de documentos con IA* para el administrador de PH:
informes de gestión, actas y presentaciones por propiedad/mes, más 2 asesores de
chat (Themis legal, Chronos plazos) y un módulo Élite de portafolio con generación
en lote.

**El techo de ese producto** es el valor de los documentos. El administrador de PH
vive de mucho más: cobrar cuotas, rendir cuentas, convocar asambleas, responder
quejas, mantener el edificio, cumplir la ley. Y alrededor de él orbitan personas
que hoy no tocan la plataforma: residentes, consejo, revisor fiscal, portería,
proveedores.

**La oportunidad:** los software de PH tradicionales en Colombia (tipo
ComunidadFeliz, ControlPH, Sisco) son ERPs de cartera sin IA. SOPH.IA puede entrar
por el lado contrario — IA nativa sobre documentos, comunicación y cumplimiento —
e ir absorbiendo la operación completa, hasta convertirse en **el sistema
operativo de la copropiedad**: el lugar donde la PH *vive* (su historia, su
plata, su gente, sus obligaciones), no solo donde se redactan sus papeles.

Tres horizontes:

| Horizonte | De qué vive | Quién paga |
|---|---|---|
| **H1 (hoy)** | Documentos + asesores IA | Administrador (suscripción) |
| **H2** | Operación completa del admin: cartera, asambleas, PQRS, mantenimiento | Administrador (tiers más caros + add-ons con módulo) |
| **H3** | Plataforma multi-actor: residentes, recaudo, portería, proveedores | Admin + PH por unidad + comisión de recaudo |

Un principio transversal: **cada agente "Próximamente" se lanza junto con su
módulo funcional**. Hoy Metra/Nomethes/Hermes/Logistes serían solo chats de $5;
si Metra llega *con* el módulo de cartera, Hermes *con* el centro de comunicados,
Logistes *con* mantenimientos y Nomethes *con* el kit de decisiones de asamblea,
cada add-on pasa de "otro chat" a "una capacidad operativa" — y justifica precio.

---

## 2. Punto de partida (inventario actual)

- **Generación IA**: informe de gestión, acta, PPTX; por propiedad/mes; branding
  (logo/color); historial; staging de datos mensuales; lote Élite con cron.
- **Agentes**: Themis (legal, incluido), Chronos (plazos, incluido); Metra
  (financiera), Nomethes (decisiones), Hermes (comunicaciones), Logistes
  (operativo) — visibles pero "Próximamente", pensados como add-ons.
- **Datos**: User → Properties (nombre, ciudad, unidades, grupo) → Documents
  (reglamento, manual) / MonthlyData / Generations. Sin modelo de unidades
  privadas ni de personas distintas al admin.
- **Planes**: Pro $99.900 · Business $299.900 · Élite $749.900 (COP/mes), trial 7
  días, beta con acceso ilimitado.
- **Soporte**: chatbot + tickets + WhatsApp; consola admin completa (usuarios,
  suscripciones, tickets, auditoría, consumo, métricas, ban).

**La restricción arquitectónica clave**: hay *un login por cuenta* y todo cuelga
de `userId`. Residentes, consejo, revisor, portería y equipo del admin requieren
un **modelo de miembros y roles por propiedad** (sección 7). Es la inversión que
desbloquea H3.

---

## 3. Funciones para el **Administrador de la PH**

El cliente actual. Objetivo: que SOPH.IA cubra su semana completa, no solo su
cierre de mes.

### 3.1 Cartera y recaudo (el dolor #1 del oficio) — pareja de **Metra**
| Función | Qué hace | Encaje |
|---|---|---|
| Unidades y coeficientes | Registrar aptos/casas/locales con coeficiente, propietario y contacto (import Excel) | Business |
| Causación de cuotas | Generar el cobro mensual por unidad (ordinaria + extraordinaria), con intereses de mora auto-calculados (tope Art. 30 Ley 675) | Business |
| Estados de cuenta | Estado de cuenta por unidad, histórico, saldo; envío masivo por email/WhatsApp | Business |
| Cartera por edades | Reporte aging (30/60/90+), tendencia de morosidad, top morosos | Business |
| Cartas de cobro IA | Persuasivo → prejurídico, redactadas por Hermes con datos reales de la deuda y citando Ley 675 | Business |
| Expediente de cobro jurídico | Un clic: certificación de deuda + soportes + histórico para entregar al abogado (título ejecutivo) | Élite |
| Paz y salvo automático | Se genera solo si la unidad está al día; con QR de verificación | Pro |

*Valor:* la cartera es lo que hace que un software de PH sea in-reemplazable; es
el puente natural al portal de residentes y al recaudo en línea (sección 4).

### 3.2 Asambleas de principio a fin — pareja de **Nomethes**
| Función | Qué hace | Encaje |
|---|---|---|
| Convocatoria asistida | Genera convocatoria + orden del día validando plazos legales (15 días calendario para ordinaria) y la envía multicanal | Pro |
| Poderes digitales | Formato de poder pre-llenado por unidad; registro de quién representa a quién | Business |
| Registro de asistencia + quórum | Check-in por unidad; cálculo de quórum **por coeficientes** en vivo; alerta de segunda convocatoria (Art. 41) | Business |
| Votación por coeficiente | Votaciones en vivo (presencial/mixta), mayorías simples y calificadas según el tipo de decisión | Élite |
| Acta desde la asamblea | El acta IA se alimenta de asistencia, quórum y votos reales registrados — deja de ser "desde cero" | Business |
| Control de términos post-asamblea | Recordatorios: acta disponible en 20 días hábiles, ventana de impugnación (2 meses) | Pro |

### 3.3 Presupuesto y ejecución — pareja de **Metra**
- Plantilla de presupuesto anual por rubros (con referencia de PHs similares).
- Ejecutado vs presupuestado mes a mes; alertas de desviación; explicación IA de
  las desviaciones para el informe de gestión (se conecta con la generación actual).
- **Fondo de imprevistos**: tracker del 1% legal (Art. 35), saldo y aportes.
- Simulador de cuota: "si el seguro sube 18%, ¿cuánto debe subir la cuota?"
- Encaje: Business; simuladores avanzados Élite.

### 3.4 PQRS y convivencia — pareja de **Hermes**
- Registro de peticiones/quejas de residentes (primero manual, luego llegan solas
  desde el portal residente), con tipificación, responsable y semáforo de términos.
- Respuestas redactadas por IA con el contexto del reglamento *de esa propiedad*
  (los PropertyDocuments ya existen — RAG sobre reglamento).
- Proceso sancionatorio con debido proceso (llamado de atención → pliego →
  descargos → sanción), plantillas legales en cada paso.
- Encaje: registro Pro; flujo completo + sanciones Business.

### 3.5 Centro de comunicados — pareja de **Hermes**
- Redacción IA de circulares, envío por email (y WhatsApp después), acuse de
  lectura, repositorio público por propiedad. Programación de envíos.
- Encaje: Pro (email) / Business (WhatsApp + acuses).

### 3.6 Mantenimiento y activos — pareja de **Logistes**
- Hoja de vida por equipo (ascensor, motobomba, planta, piscina, gimnasio…):
  fichas, garantías, proveedores, historial de intervenciones y costos.
- Cronograma preventivo con recordatorios (Chronos) y normas asociadas:
  ascensores NTC 5926, piscinas Ley 1209, SG-SST Decreto 1072/Res. 0312.
- Órdenes de trabajo correctivas (desde reporte del residente en H3).
- Encaje: Business; multi-propiedad consolidado Élite.

### 3.7 Contratos, pólizas y proveedores
- Registro de contratos con vencimientos y alertas de renovación (vigilancia,
  aseo, ascensores…); revisión IA de cláusulas (Themis).
- Pólizas: la de zonas comunes obligatoria (Art. 15) con alerta de vencimiento;
  checklist de reclamación de siniestros.
- Directorio de proveedores por propiedad con calificación interna.
- Encaje: Business.

### 3.8 Calendario maestro de cumplimiento — Chronos deja de ser solo chat
- Calendario auto-generado por propiedad: asamblea ordinaria (primeros 3 meses),
  renovación de póliza, mantenimientos certificables, obligaciones tributarias de
  la PH, vencimientos de contratos, términos de PQRS abiertos.
- Vista consolidada de todas las propiedades ("¿qué se me vence esta semana?").
- Encaje: Pro (básico) / Business (completo) — **es el quick win #1**: barato de
  construir y hace la plataforma diaria en lugar de mensual.
- Ley 2318 de 2023 (profesionalización del administrador): posicionar este módulo
  como "tu evidencia de gestión idónea".

### 3.9 Equipo del administrador (multi-usuario) 
- Cuentas para auxiliares/asistentes con permisos (ver/crear/aprobar), auditoría
  de quién hizo qué. Requiere el modelo de roles (sección 7).
- Encaje: Business (2 usuarios) / Élite (ilimitado). Re-priorizado desde el plan
  Élite anterior (se aplazó conscientemente; sigue siendo la palanca de H3).

### 3.10 Empalme de administrador (arma de ventas)
- Paquete de entrega auto-generado al cambiar de administrador: acta de entrega,
  inventario, cartera certificada, contratos vigentes, documentos, pendientes.
- Doble filo comercial: facilita **entrar** a SOPH.IA (importar la PH) y hace
  costoso **salir** (la memoria vive aquí). Encaje: Business/Élite.

---

## 4. Funciones para el **Residente de la PH**

Audiencia nueva. No compra la plataforma — pero **la valoriza**: un admin cuyo
edificio "se siente moderno" no se cambia de software, y la PH puede pagar por
unidad. Entrada como **PWA** (web instalable, sin app stores al inicio).

| Función | Qué hace | Depende de |
|---|---|---|
| **Portal del residente** | Login por unidad: estado de cuenta, histórico de pagos, documentos públicos (reglamento, actas aprobadas, circulares) | Roles + unidades (3.1) |
| **Pago en línea** | Pagar la administración por PSE/tarjeta (ePayco ya está integrado para suscripciones); conciliación automática contra cartera | Cartera |
| **Reservas de zonas comunes** | Salón social, BBQ, canchas: calendario, reglas (cupos, depósito, sanciones), pago del alquiler en línea | Portal |
| **PQRS del residente** | Radicar petición/queja con foto, ver estado y respuesta; alimenta 3.4 | Portal |
| **Comunicados y encuestas** | Feed de circulares con confirmación de lectura; encuestas rápidas del admin | Portal |
| **Asamblea del residente** | Ver convocatoria, otorgar poder digital, votar desde el celular si la asamblea lo habilita | Kit asamblea |
| **Reporte de daños** | "Se dañó la puerta del sótano" + foto → se vuelve orden de trabajo en 3.6 | Mantenimiento |
| **Pre-autorización de visitantes** | Generar QR/código para visitas y domicilios; portería lo valida | Módulo portería |
| **Paquetería** | Notificación "llegó un paquete a portería" + confirmación de entrega | Módulo portería |
| **Directorio y registro** | Auto-registro de vehículos, mascotas, contactos de emergencia | Portal |
| **Asistente IA del residente** | "¿Puedo tener 2 perros?" — responde desde el reglamento *de su propiedad* (RAG sobre PropertyDocuments, infra ya existente) | Portal |

*Nota:* el asistente IA del residente es el diferenciador más barato de todos —
reusa el stack de agentes actual con un system prompt + el reglamento ya subido.

---

## 5. Funciones para **otras personas implicadas en la PH**

| Actor | Funciones | Encaje |
|---|---|---|
| **Consejo de administración** | Acceso de solo lectura a dashboards (cartera, ejecución, PQRS); aprobaciones digitales de gastos sobre tope; actas de consejo con seguimiento IA de compromisos ("¿qué quedó pendiente de la reunión pasada?") | Business |
| **Revisor fiscal** | Rol de solo lectura sobre finanzas y soportes; espacio para observaciones/dictámenes; trazabilidad de lo que consultó (obligatorio en PH mixta/comercial, Art. 56) | Élite |
| **Contador** | Exportes contables (Excel PUC / Siigo / World Office) de causación y recaudo; carga de estados financieros que alimentan el staging mensual ya existente (hoy lo hace el admin a mano) | Business |
| **Portería / vigilancia** | **Minuta digital** por turnos (novedades con foto/hora, buscable con IA: "¿qué pasó el 14 de junio?"); control de visitantes con QR del residente; recepción de paquetes; botón de incidente | Élite o add-on |
| **Proveedores** | Recibir órdenes de servicio, subir cotizaciones y facturas, mantener docs al día (RUT, ARL); histórico y calificación | Business |
| **Abogado de cobro** | Recibe el expediente de mora certificado (3.1) con acceso temporal de solo lectura | Élite |
| **Propietario no residente / inmobiliaria** | Distinción propietario vs arrendatario en la unidad: el propietario ve el estado de cuenta y autoriza, el arrendatario opera el día a día | Portal residente |

---

## 6. Funciones para **la PH en sí misma** (el edificio como entidad)

La idea fuerza: **la memoria institucional de la copropiedad sobrevive a los
administradores**. Hoy, cuando cambia el admin, la historia se va en cajas.

1. **Hoja de vida del edificio** — NIT, matrícula, licencias, coeficientes,
   planos, manuales, garantías del constructor (¡con vencimientos de la garantía
   decenal!), historial de administradores. *(Business)*
2. **Archivo histórico permanente** — actas de todos los años, reglamento y sus
   reformas, estados financieros, contratos; búsqueda semántica IA sobre todo el
   archivo ("¿cuándo se aprobó impermeabilizar la terraza y por cuánto?"). *(Business)*
3. **Score de salud de la PH** — índice compuesto: cartera sana, fondo de
   imprevistos al día, póliza vigente, mantenimientos certificados al día,
   asamblea en término. Con recomendaciones IA para subirlo. *(Business)*
4. **Benchmark anónimo** — "tu cartera morosa es 12%; PHs similares en tu ciudad:
   8%" — juego de datos agregados que solo SOPH.IA puede armar a escala. *(Élite)*
5. **Checklist normativo vivo** — obligaciones según el perfil del edificio
   (¿tiene piscina? → Ley 1209; ¿ascensor? → certificación anual; ¿empleados
   directos? → SG-SST), con estado y evidencias. *(Business)*
6. **Plan decenal de obras** — proyección de mantenimientos mayores (fachada,
   impermeabilización, ascensores) con simulación de cuota extraordinaria vs
   fondo. *(Élite)*
7. **Consumos y sostenibilidad** — registro de servicios comunes (agua, energía),
   tendencias y sugerencias IA de ahorro. *(Élite, tardío)*

---

## 7. La palanca arquitectónica: miembros y roles por propiedad

Todo H3 depende de un cambio de modelo (hoy: 1 login = 1 admin dueño de todo):

```
User ──< PropertyMembership >── Property
            role: admin | staff | consejo | revisor | portero | residente | propietario
            unitId?: → Unit (para residente/propietario)

Property ──< Unit (torre/apto, coeficiente, área)
Unit ──< Charge (causación) / Payment (recaudo) / …
```

- Los gates existentes (`requireAdmin`, `requireElite`) se generalizan a
  `requireMembership(propertyId, role)`.
- El patrón ya está probado dos veces en el código (admin console y empresa/Élite);
  es replicable sin reescritura.
- Riesgo a diseñar desde el día 1: **aislamiento multi-tenant** (un residente
  jamás ve otra unidad; un portero jamás ve cartera) y **habeas data** (Ley 1581:
  SOPH.IA pasa a tratar datos de miles de residentes; se necesita política de
  tratamiento, consentimiento en el registro y minimización).

---

## 8. Monetización: cómo esto engorda cada paquete

**Pro ($99.900)** — "el admin independiente que quiere verse impecable":
calendario de cumplimiento, certificados/paz y salvos con QR, comunicados por
email, convocatorias, PQRS básico. *Pro no crece en precio; crece en retención.*

**Business ($299.900)** — "la administración profesional completa": todo lo
anterior + cartera/estados de cuenta, kit de asamblea completo, presupuesto,
mantenimientos, contratos/pólizas, consejo, contador, hoja de vida del edificio,
2 usuarios de equipo. *Es el tier que más features nuevos recibe — el objetivo es
que Business sea la opción obvia y suba el ticket promedio.*

**Élite ($749.900)** — "la empresa administradora": todo Business + portafolio y
lote (ya existe) + multi-usuario ilimitado, votación digital, revisor fiscal,
expediente jurídico, benchmark, integraciones contables/API, marca blanca.

**Líneas nuevas de ingreso (H3):**
1. **Módulo Residentes por unidad** — ej. COP 500–1.500/unidad/mes (validar contra
   ComunidadFeliz y similares); incluido en Élite hasta N unidades. Cambia el techo
   de ingreso de "por administrador" a "por tamaño del edificio".
2. **Comisión de recaudo en línea** — % o fee fijo por transacción PSE/tarjeta.
   Con volumen, potencialmente la línea más grande de todas. (Diseño: el dinero
   fluye directo a la cuenta de la PH vía split/link de ePayco — SOPH.IA nunca
   custodia fondos, para no pisar regulación financiera.)
3. **Add-ons relanzados con módulo** — Metra/Hermes/Logistes/Nomethes dejan de
   ser chats de $5 y se relanzan como módulo+agente (precio nuevo o absorbidos en
   tiers como gancho de upgrade).
4. **Marketplace de proveedores** (tardío) — lead-gen/comisión a proveedores
   verificados que quieren venderle a las PHs de la red.

---

## 9. Secuencia sugerida

**F1 — Quick wins del admin (0–2 meses, sin cambios de modelo):**
Calendario maestro de cumplimiento · Centro de comunicados (email) · Certificados
y paz y salvos con QR · Convocatoria + control de términos de asamblea · PQRS v1
(registro manual). *Lanza Hermes como primer add-on con módulo.*

**F2 — La plata (2–4 meses, modelo Unit sin logins nuevos):**
Unidades + import Excel · causación y estados de cuenta · cartera por edades ·
cartas de cobro IA · presupuesto vs ejecución + fondo de imprevistos · exportes
contables. *Lanza Metra. Business queda "completo".*

**F3 — Abrir la plataforma (4–7 meses, memberships + portal):**
Modelo de roles (sección 7) · equipo del admin · portal residente (estado de
cuenta, comunicados, PQRS, documentos, asistente IA del reglamento) · **pago en
línea + conciliación** · reservas · quórum/votación de asamblea. *Arranca ingreso
por unidad y por transacción.*

**F4 — Ecosistema (7–12 meses):**
Portería (minuta, visitantes QR, paquetería) · consejo/revisor dashboards ·
proveedores y órdenes de servicio · hoja de vida + empalme de administrador ·
score de salud + benchmark · integraciones contables profundas. *Lanza Logistes y
Nomethes con sus módulos.*

Cada fase es vendible por sí sola y ninguna rompe a la anterior.

---

## 10. Riesgos y prerequisitos transversales

| Tema | Riesgo | Mitigación |
|---|---|---|
| Multi-tenant | Fuga de datos entre unidades/propiedades | Diseñar memberships + tests de autorización desde F3 día 1 |
| Habeas data (Ley 1581) | Datos de residentes a escala | Política de tratamiento, consentimiento en registro, minimización |
| Recaudo | Regulación financiera si se custodian fondos | Split/link directo a cuenta de la PH; SOPH.IA nunca toca el dinero |
| WhatsApp | API de Meta tiene costo por conversación | Empezar por email; WhatsApp como feature Business con costo modelado |
| Rate limits IA | Más módulos IA = más consumo Anthropic | Ya mitigado con cola/cron; subir tier Anthropic con el crecimiento |
| Enfoque | Construir ERP contable completo es una trampa | No competir en contabilidad NIIF: exportar al contador, integrar después |
```
