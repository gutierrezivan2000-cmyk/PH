# Costos por función y topes de los planes

Actualizado el 15 de octubre de 2026. **Es una estimación desde el código y los precios de `src/lib/consumo/precios.ts`, no una
medición**: no hay datos de uso real de producción. Se corrige con el panel de Consumo tras unas 2 semanas de piloto (sección 7).

- Tipo de cambio: **COP 4.100 por US$1**.
- Chat de los agentes, «Preguntar» y el asistente: **Haiku 5.5** (US$0,10 entrada / US$0,50 salida por millón). Sonnet 5.5 no se usa
  por defecto; con el mismo tamaño de mensaje cuesta 20 veces más.
- Transcripción: US$0,006 por minuto (estimado).

## 1. Lo importante

1. **El chat casi no cuesta.** Un mensaje promedio cuesta ≈ US$0,0025 (COP 10). Con los presupuestos actuales caben cientos de mensajes
   al mes en cualquier plan.
2. **Lo caro son las horas de Reuniones.** Una hora cuesta ≈ US$0,40 (US$0,36 de transcripción y US$0,04 de IA). Los cupos quedaron en
   Pro 8 h, Business 24 h y Élite 60 h: lo mínimo que cumple «hasta 8 horas» es 8 h en Pro.
3. **El techo de costo de IA con todo al 100 % queda entre 24 % y 38 % del precio** (sección 4), dentro de la meta del 40 %.
4. **El asistente del reglamento para residentes es la línea más grande del techo en Pro** (≈ US$4 al mes por administrador con el tope
   de 1.000 preguntas). Es la palanca más barata si se quiere bajar el techo.

## 2. Costo por función (Haiku 5.5 salvo indicación)

| Función | Esfuerzo | US$ | COP |
| --- | --- | --- | --- |
| Chat: mensaje simple (saludo, consulta corta) | low / medium | ≈ 0,001 | 4 |
| Chat: consulta con datos (herramientas) | medium / high | ≈ 0,002 | 10 |
| Chat: mensaje pesado (tabla, archivo, varias vueltas) | high | ≈ 0,008 | 34 |
| **Chat: promedio (60 % / 30 % / 10 %, con caché del prefijo)** | | **≈ 0,0025** | **10** |
| Chat: título / lectura de una imagen adjunta | low | ≈ 0,0001 / 0,0006 | 0,4 / 2 |
| Transcripción de audio (chat y documentos) | | 0,006 por minuto | 25 por minuto |
| Informe de gestión / acta | high | ≈ 0,009 (máx. 0,015) | 37 (63) |
| Revisión de requisitos del acta / corrección | medium | ≈ 0,003 / 0,004 | 12 / 17 |
| Reunión de 1 h / 3 h / 8 h (transcripción, ficha y acta) | high | 0,40 / 1,14 / 3,2 | 1.640 / 4.670 / 13.100 |
| Pregunta a una reunión (Preguntar) | medium | 0,001 a 0,007 | 4 a 29 |
| Carta de cobro / borrador de comunicado | medium | ≈ 0,0014 / 0,0015 | 6 |
| Importar 200 unidades / bitácora | medium | ≈ 0,0065 / 0,0033 | 27 / 14 |
| Portal de residentes: pregunta al asistente del reglamento | medium | ≈ 0,004 | 16 |

## 3. Topes vigentes

| | Prueba (7 días) | Pro | Business | Élite |
| --- | --- | --- | --- | --- |
| Precio | gratis | US$24 | US$73 | US$183 |
| **Presupuesto del chat al mes (US$ de costo)** | 0,25 | 0,75 | 2,25 | 6 |
| Equivale a mensajes promedio al mes | ≈ 100 en la semana | ≈ 300 | ≈ 900 | ≈ 2.400 |
| Ventana de 5 horas (20 % del presupuesto) | 0,05 (≈ 20 msg) | 0,15 (≈ 60 msg) | 0,45 (≈ 180 msg) | 1,20 (≈ 480 msg) |
| Ventana de 7 días (40 % del presupuesto) | 0,10 (≈ 40 msg) | 0,30 (≈ 120 msg) | 0,90 (≈ 360 msg) | 2,40 (≈ 960 msg) |
| **Horas de Reuniones al mes** | 2 h en total | **8 h** | **24 h** | **60 h** |
| Generaciones al mes / por día (sin cambio) | 5 en total / 2 | 15 / 3 | 40 / 5 | 100 / 10 |
| Minutos de audio al mes, **compartidos** entre chat y documentos | 20 en total | 120 | 300 | 800 |
| Asistente del reglamento (residentes), **por administrador** | 100/día, 1.000/mes | 100/día, 1.000/mes | igual | igual |

Lo que cuenta en el porcentaje del chat: los mensajes (todas sus vueltas), el título, las imágenes que se leen, los audios transcritos en
el chat y las preguntas a reuniones. **No** cuentan: informes, actas, cartas, importaciones, reuniones (horas) ni el portal de residentes.

## 4. Techo de costo de IA con todo usado al 100 %

| Plan | Precio | Chat | Reuniones (horas) | Documentos + audio | Portal de residentes | Otros | **Total** | **% del precio** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pro | US$24 | 0,75 | 3,2 | 0,3 + 0,7 | 4,0 | 0,3 | **US$9,2** | **≈ 38 %** |
| Business | US$73 | 2,25 | 9,6 | 0,7 + 1,8 | 4,0 | 1,5 | **US$19,9** | **≈ 27 %** |
| Élite | US$183 | 6,0 | 24,0 | 1,8 + 4,8 | 4,0 | 3,0 | **US$43,6** | **≈ 24 %** |

Con el uso típico (≈ 35 % del techo) el costo queda entre 8 % y 13 % del precio. Las horas de Reuniones son entre 35 % (Pro) y 55 %
(Élite) del techo. El tope de 1.000 preguntas del asistente del reglamento vale ≈ US$4 al mes por administrador en cualquier plan.

## 5. Qué ve la persona

- En el asistente y en cada chat: una barra «72 % de tu uso disponible» que baja con lo que se usa. Avisa al 20 % («Te queda poco uso»)
  y al 5 % («Te queda muy poco uso»). Al agotarse, el redactor se bloquea y dice cuándo vuelve el uso (hora de Bogotá, o la fecha de
  renovación del mes).
- Tras cada mensaje, la barra se actualiza sin recargar la página.
- «Preguntar» a una reunión descuenta del mismo porcentaje.

## 6. Palancas

| Palanca | Efecto |
| --- | --- |
| Presupuesto del chat de un plan (`chatBudgetUsd` en `src/lib/epayco.ts`) | Cambia cuántos mensajes caben. |
| Horas de Reuniones (`meetingHoursPerMonth`) | Es el costo más grande del techo: 1 h cuesta ≈ US$0,40. No bajar de 8 h en Pro. |
| Tope mensual del asistente del reglamento | De 1.000 a 300 por administrador baja el techo de Pro en ≈ US$2,8. |
| Esfuerzo fijo del chat (`IA_ESFUERZO_AGENTE_CHAT`) | Menos pensamiento en cada turno; menos calidad en análisis. |
| Sonnet 5.5 para el chat (`IA_MODELO_AGENTE_CHAT=claude-sonnet-5-5`) | Mejor calidad en consultas complejas, ≈ 20 veces más costo por mensaje. |

## 7. Supuestos y lo que NO está verificado

- **Precio de Haiku 5.5:** de fuentes secundarias que citan la página de Anthropic (así lo dice `precios.ts`). Confirmar en platform.claude.com.
- **Tamaños de mensaje:** no medidos en producción. Prefijo del chat ≈ 7.000 tokens cacheables; historial hasta 40.000 caracteres; mezcla
  de mensajes 60/30/10; la caché del prefijo está fría la mitad de las veces.
- **Reglamento del portal ≈ 30.000 tokens** (supuesto; no se midió un reglamento real).
- **Transcripción a US$0,006 por minuto** es una estimación, no la factura del proveedor.
- **Reunión de 8 h:** sus ≈ 130.000 tokens de transcripción superan el tramo de 100.000 de Haiku 5.5, que cuesta ×5 en acta y Preguntar.
  Sigue siendo barato (≈ US$0,25 el acta).
- **No incluye** Vercel, Neon, Blob, correo, comisiones de ePayco ni impuestos.
- **Tope de audio compartido:** se estima por tamaño (1 MB ≈ 1 minuto), igual que el chat. Un archivo puede gastar algo más o menos que
  su minuto real.

## 8. Cómo calibrar con datos reales

Tras 2 semanas con el piloto abierto, el panel de Consumo (por usuario y por función, con CSV) da el costo real por mensaje, por reunión
y por residente. Con eso se reajustan los presupuestos. Revisar también los precios del proveedor cada trimestre.

## 9. Lo que ya está hecho y lo que falta

- Hecho: el porcentaje del chat en tres ventanas (sesión, semana, mes) con los presupuestos de la sección 3; la barra en el asistente y
  en cada chat; el aviso al 20 % y al 5 %; «Preguntar» dentro del porcentaje; Haiku 5.5 como modelo del chat, con esfuerzo por turno; el
  tope de audio mensual compartido; el tope del asistente del portal por administrador; los cupos de horas de la sección 3; la corrección
  del tope de transcripción de Business (recibía los de Pro).
- Pendiente: la caché del historial de conversación en el chat (ahorro ≈ 22 %, ya no urgente con Haiku); topes del asistente del portal
  por plan, si se quiere bajar el techo de Pro.
