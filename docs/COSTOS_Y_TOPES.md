# Costos por función y topes de los planes

Actualizado el 15 de octubre de 2026. **Es una estimación desde el código y los precios de `src/lib/consumo/precios.ts`, no una
medición**: no hay datos de uso real de producción. Se corrige con el panel de Consumo tras unas 2 semanas de piloto (sección 7).

- Tipo de cambio: **COP 4.100 por US$1**.
- Chat de los agentes, «Preguntar» y el asistente: **Haiku 5.5** (US$0,10 entrada / US$0,50 salida por millón). Sonnet 5.5 no se usa
  por defecto; con el mismo tamaño de mensaje cuesta 20 veces más.
- Transcripción: US$0,006 por minuto (estimado).

## 1. Lo importante

1. **El chat ya no es la función cara.** Con Haiku, un mensaje promedio cuesta ≈ US$0,0025 (COP 10). Un mensaje pesado (tabla o archivo),
   ≈ US$0,008. Con el presupuesto de cada plan caben miles de mensajes al mes.
2. **Lo caro son las horas de Reuniones.** Una hora cuesta ≈ US$0,40 (US$0,36 de transcripción y US$0,04 de IA). Los cupos de horas
   quedaron como estaban (Pro 10 h, Business 40 h, Élite 120 h), que cumple el mínimo de 8 horas por reunión.
3. **Con esos cupos, el costo de IA al 100 % no cabe en el 40 % del precio que se había fijado como meta.** Ver sección 4. Es una decisión
   del dueño: subir precio, bajar cupos de horas o aceptar el margen.
4. **El tope del porcentaje protege aunque la estimación falle.** Se calcula con el costo real en dólares de cada llamada
   (`UsageRecord.costUsd`), así que un error de estimación solo cambia cuántos mensajes caben.

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
| **Uso del chat (presupuesto en US$ de costo)** | 1 | 5 | 15 | 40 |
| Equivale a mensajes promedio al mes | ≈ 400 en la semana | ≈ 2.000 | ≈ 6.000 | ≈ 16.000 |
| Ventana de 5 horas (20 % del presupuesto) | 0,20 | 1 (≈ 400 msg) | 3 (≈ 1.200 msg) | 8 (≈ 3.200 msg) |
| Ventana de 7 días (40 % del presupuesto) | 0,40 | 2 (≈ 800 msg) | 6 (≈ 2.400 msg) | 16 (≈ 6.400 msg) |
| Horas de Reuniones al mes (sin cambio) | 2 h en total | 10 h | 40 h | 120 h |
| Generaciones al mes / por día (sin cambio) | 5 en total / 2 | 15 / 3 | 40 / 5 | 100 / 10 |
| Minutos de audio al mes, **compartidos** entre chat y documentos | 20 en total | 120 | 300 | 800 |
| Asistente del reglamento (residentes), **por administrador** | 100/día, 1.000/mes | 100/día, 1.000/mes | igual | igual |

Lo que cuenta en el porcentaje del chat: los mensajes (todas sus vueltas), el título, las imágenes que se leen, los audios transcritos en
el chat y las preguntas a reuniones. **No** cuentan: informes, actas, cartas, importaciones, reuniones (horas) ni el portal de residentes.

## 4. Techo de costo de IA con todo usado al 100 %

| Plan | Precio | Chat | Reuniones (horas) | Documentos + audio | Portal de residentes | Otros | **Total** | **% del precio** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pro | US$24 | 5,0 | 4,0 | 0,3 + 0,7 | 4,0 | 0,3 | **US$14,3** | **≈ 59 %** |
| Business | US$73 | 15,0 | 16,0 | 0,7 + 1,8 | 4,0 | 1,5 | **US$39,0** | **≈ 53 %** |
| Élite | US$183 | 40,0 | 48,0 | 1,8 + 4,8 | 4,0 | 3,0 | **US$101,6** | **≈ 56 %** |

Con el uso típico (≈ 35 % del techo) el costo queda en ≈ 20 % del precio. El 40 % de la meta anterior **no se cumple con los cupos de
horas que pidió el dueño**: las horas de Reuniones son entre 28 % (Pro) y 47 % (Élite) del techo. El asistente del reglamento también pesa en el techo porque
una pregunta cuesta ≈ US$0,004 (el reglamento completo va en cada llamada); por eso su tope mensual de 1.000 por administrador vale
≈ US$4 al mes, lo mismo para Pro que para Élite. Si se quiere, ese tope puede depender del plan.

## 5. Qué ve la persona

- En el asistente y en cada chat: una barra «72 % de tu uso disponible» que baja con lo que se usa. Avisa al 20 % («Te queda poco uso»)
  y al 5 % («Te queda muy poco uso»). Al agotarse, el redactor se bloquea y dice cuándo vuelve el uso (hora de Bogotá, o la fecha de
  renovación del mes).
- Tras cada mensaje, la barra se actualiza sin recargar la página.
- «Preguntar» a una reunión descuenta del mismo porcentaje.

## 6. Palancas (si el porcentaje resulta demasiado generoso o demasiado estrecho)

| Palanca | Efecto |
| --- | --- |
| Bajar el presupuesto del chat de un plan (`chatBudgetUsd` en `src/lib/epayco.ts`) | Cambia cuántos mensajes caben. Con Haiku, el presupuesto de US$5 da ≈ 2.000 mensajes. |
| Esfuerzo `low` fijo (`IA_ESFUERZO_AGENTE_CHAT`) | Menos pensamiento en cada turno; menos calidad en análisis. |
| Sonnet 5.5 para el chat (`IA_MODELO_AGENTE_CHAT=claude-sonnet-5-5`) | Mejor calidad en consultas complejas, ≈ 20 veces más costo por mensaje. |
| Tope mensual del asistente del portal por plan | Reduce el techo de ≈ US$4 por administrador. |

## 7. Supuestos y lo que NO está verificado

- **Precio de Haiku 5.5:** de fuentes secundarias que citan la página de Anthropic (así lo dice `precios.ts`). Confirmar en platform.claude.com.
- **Tamaños de mensaje:** no medidos en producción. Prefijo del chat ≈ 7.000 tokens cacheables (prompt, herramientas y briefing); historial
  hasta 40.000 caracteres; mezcla de mensajes 60/30/10; la caché del prefijo está fría la mitad de las veces. Si el prefijo no llega al
  mínimo cacheable del modelo, el costo sube, aunque el orden de magnitud no cambia.
- **Reglamento del portal ≈ 30.000 tokens** (supuesto; no se midió un reglamento real).
- **Transcripción a US$0,006 por minuto** es una estimación, no la factura del proveedor.
- **Reunión de 8 h:** sus ≈ 130.000 tokens de transcripción superan el tramo de 100.000 de Haiku 5.5, que cuesta ×5 en acta y Preguntar.
  Sigue siendo barato (≈ US$0,25 el acta).
- **No incluye** Vercel, Neon, Blob, correo, comisiones de ePayco ni impuestos.
- **Tope de audio compartido:** se estima por tamaño (1 MB ≈ 1 minuto), igual que el chat. Un archivo puede gastar algo más o menos que
  su minuto real; el cupo se corrige con la duración real que devuelve la transcripción.

## 8. Cómo calibrar con datos reales

Tras 2 semanas con el piloto abierto, el panel de Consumo (por usuario y por función, con CSV) da el costo real por mensaje, por reunión y
por residente. Con eso se reajustan los presupuestos. Revisar también los precios del proveedor cada trimestre.

## 9. Lo que ya está hecho y lo que falta

- Hecho: el porcentaje del chat en tres ventanas (sesión, semana, mes); la barra en el asistente y en cada chat; el aviso al 20 % y al
  5 %; el tope de «Preguntar» dentro del porcentaje; Haiku 5.5 como modelo del chat, con esfuerzo por turno; el tope de audio mensual
  compartido entre chat y documentos; el tope del asistente del portal por administrador; la corrección del tope de transcripción de Business
  (recibía los de Pro).
- Pendiente: la caché del historial de conversación en el chat (ahorro ≈ 22 %, ya no urgente con Haiku); topes por plan para el
  asistente del portal; la decisión sobre el 40 % de la meta frente a los cupos de horas.
