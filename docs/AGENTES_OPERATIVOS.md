# Agentes como empleados del administrador

Los seis agentes (Themis, Chronos, Metra, Nomethes, Hermes, Logistes) comparten una **memoria operativa por copropiedad** y pueden
**consultar y operar** la plataforma. Este documento explica cómo está armado y cómo extenderlo.

## Qué saben sin que nadie se lo cuente (el briefing)

En cada mensaje, `src/lib/agentes/briefing-datos.ts` arma desde la base de datos el estado real de la copropiedad en foco y se lo inyecta
al agente como un bloque de sistema propio (con su punto de caché): cartera (mora, edades, mayores morosos, recaudo del mes), presupuesto y
fondo de imprevistos, PQRS abiertas y vencidas, asambleas, certificados, comunicados, vencimientos (calendario + bitácora), reuniones
(resumen, compromisos), documentos cargados, personas clave, **memoria** y **lo que ha pasado últimamente**. Más una línea por cada
copropiedad de la cuenta. Tope ≈ 2.500 tokens. La parte pura (formato, tope) está en `briefing.ts` con pruebas.

- **Copropiedad en foco:** la que elige la persona en el chat (selector «Copropiedad en foco»), la guardada en la conversación
  (`AgentChatFocus`) o la única que tenga la cuenta.
- **Módulos en piloto:** una sección de un módulo que la cuenta no puede usar (ver `lib/feature-flags.ts`) no aparece ni se consulta.
- **Tolerante a fallos:** cada sección se carga por separado; si una falla, se omite y el chat sigue.

## La bitácora de eventos

`registrarEvento()` (`src/lib/agentes/eventos.ts`) anota una línea por cada hecho relevante (pago registrado, cuotas causadas, PQRS
radicada o respondida, comunicado enviado, asamblea, certificado, bitácora, documento generado o cargado, reunión lista…), con su
actor (`usuario`, `residente`, `sistema` o `agente:<id>`). Nunca lanza y no guarda datos personales que el hecho no necesite.
Para que un módulo nuevo sea visible a los agentes: llama a `registrarEvento` tras el éxito de cada escritura.

## Herramientas de los agentes (`src/lib/agentes/herramientas.ts`)

| Herramienta | Qué hace | ¿Pide aprobación? |
|---|---|---|
| `consultar_operacion` | Detalle de cartera, morosos, estado de una unidad, presupuesto, PQRS, calendario, reuniones, reglamento (fragmentos relevantes), actividad, memoria, comunicados, asambleas, certificados, bitácora | No (solo lee) |
| `guardar_en_memoria` | Nota/decisión/preferencia que todos los agentes verán | No (queda visible y atribuida al agente) |
| `proponer_accion` | Propone una acción en la plataforma | **Sí**: la persona ve una tarjeta y la aprueba o rechaza |

Acciones disponibles (`acciones.ts`): `registrar_pago`, `registrar_movimiento_presupuesto`, `responder_pqrs`, `agregar_a_bitacora`.
Proponer no hace nada; aprobar ejecuta (una sola vez, aunque se pulse dos veces) con las mismas reglas que el módulo, revalida el
módulo y los datos al ejecutar, y deja un evento con el agente como actor. Tope de 20 acciones sin decidir por cuenta.

**Para sumar una acción nueva:** 1) agrégala a `TIPOS_DE_ACCION`, `MODULO_DE_ACCION` y `ETIQUETA_DE_ACCION`, y escribe su validador puro
en `acciones.ts`; 2) escribe su ejecución en `acciones-ejecutar.ts`; 3) descríbela en `herramientas.ts` (`datos` de `proponer_accion`).
La tarjeta, la aprobación y la auditoría ya funcionan para cualquier tipo.

## Modelos y esfuerzo (`src/lib/ia/modelos.ts`)

- Chat de los agentes: **Claude Sonnet 5.5**. Todo lo demás: **Claude Haiku 5.5**. Opus no se usa.
- Esfuerzo por función (alto: informe, acta, análisis y acta de reuniones; medio: chat, extracción, cartas, comunicados; bajo: lectura
  de imágenes y títulos).
- Variables de Vercel (sin desplegar): `IA_MODELO_CHAT`, `IA_MODELO_GENERAL`, `IA_MODELO_<FUNCION>`, `IA_ESFUERZO_<FUNCION>`.
  `ANTHROPIC_MODEL` ya no se lee.
- Los modelos 5 rechazan `temperature`/`top_k`/prefill y piensan por defecto (el pensamiento cuenta como salida): por eso `max_tokens`
  es mayor y el esfuerzo se fija explícitamente.

## Agentes complementarios en el piloto

Metra, Nomethes, Hermes y Logistes siguen «Próximamente» para el público; en el piloto los usan quienes tienen abierto el módulo de
cada uno (Metra→Cartera, Nomethes→Asambleas, Hermes→Comunicados, Logistes→PQRS), sin necesidad del complemento (`lib/agentes/acceso.ts`).

## Pendiente (siguientes entregas)

- Acciones adicionales: enviar comunicado, causar cuotas del mes, generar el informe del mes, convocar asamblea, emitir certificado.
- Resumen de la conversación como memoria automática (hoy la memoria la escriben los agentes y la persona).
- Compra de los complementos con ePayco y cupos por agente.
