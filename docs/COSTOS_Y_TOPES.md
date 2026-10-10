# Costos por función y topes de los planes

Actualizado el 15 de octubre de 2026. **Es una estimación desde el código y los precios de `src/lib/consumo/precios.ts`, no una
medición**: no hay datos de uso real de producción. Se corrige con el panel de Consumo tras unas 2 semanas de piloto (sección 8).

- Tipo de cambio: **COP 4.100 por US$1**.
- Todo usa **Haiku 5.5** (US$0,10 entrada / US$0,50 salida por millón). Sonnet 5.5 no se usa por defecto; costaría 20 veces más.
- Transcripción: US$0,006 por minuto (estimado).

> **Importante:** mientras `OPEN_TESTING` esté activo (lo está salvo que valga exactamente `"false"`), las cuentas están en «fase de
> pruebas» y **los topes por plan no se aplican a nadie** (porcentaje del chat, minutos de audio, horas de Reuniones). Solo valen
> los **topes de seguridad** de la sección 5, que se aplican a todas las cuentas. Antes de cobrar, poner `OPEN_TESTING=false`.

## 1. Lo importante

1. **El chat casi no cuesta.** Un mensaje promedio cuesta ≈ US$0,0025 (COP 10). Con los presupuestos actuales caben cientos de mensajes
   al mes en cualquier plan.
2. **Lo caro son las horas de Reuniones.** Una hora cuesta ≈ US$0,40 (US$0,36 de transcripción y US$0,04 de IA). Los cupos son
   Pro 8 h, Business 24 h y Élite 60 h: 8 h es lo mínimo para que quepa una reunión de 8 horas.
3. **El mayor hueco de costo era el acta de una reunión larga.** Un acta de 8 h cuesta ≈ US$0,37 y se podían pedir tantas como
   permitieran las generaciones del mes (15, 40 o 100). Ahora son 3 por reunión. Esto baja el techo de costo de IA entre 16 y 24
   puntos porcentuales del precio (sección 4).
4. **Borrar una reunión ya procesada devolvía sus horas**, así que se podía subir, procesar, borrar y repetir sin límite. Ya no.
5. **El porcentaje protege aunque la estimación falle**: se calcula con el costo real en dólares de cada llamada (`UsageRecord.costUsd`).

## 2. Costo por función (Haiku 5.5)

| Función | Esfuerzo | US$ | COP |
| --- | --- | --- | --- |
| Chat: mensaje simple (saludo, consulta corta) | low / medium | ≈ 0,001 | 4 |
| Chat: consulta con datos (herramientas) | medium | ≈ 0,002 | 10 |
| Chat: mensaje pesado (tabla, archivo, varias vueltas) | high | ≈ 0,008 | 34 |
| **Chat: promedio (60 % / 30 % / 10 %, con caché del prefijo)** | | **≈ 0,0025** | **10** |
| Chat: título / lectura de una imagen adjunta | low | ≈ 0,0001 / 0,0006 | 0,4 / 2 |
| Transcripción de audio (chat y documentos) | | 0,006 por minuto | 25 por minuto |
| Informe de gestión / acta de documentos | high | ≈ 0,009 (máx. 0,015) | 37 (63) |
| Revisión de requisitos del acta / corrección | medium | ≈ 0,003 / 0,004 | 12 / 17 |
| Reunión de 1 h / 3 h / 8 h (transcripción, ficha y acta) | high | 0,40 / 1,14 / 3,2 | 1.640 / 4.670 / 13.100 |
| **Acta de una reunión de 8 h (hasta 3 por reunión)** | high | ≈ 0,37 (máx. 1,2) | 1.500 |
| Pregunta a una reunión (Preguntar) | medium | 0,001 a 0,007 (0,15 en frío sobre 8 h) | 4 a 29 |
| Carta de cobro / borrador de comunicado | medium | ≈ 0,0014 / 0,0015 | 6 |
| Importar 200 unidades / bitácora | medium | ≈ 0,0065 / 0,0033 | 27 / 14 |
| Portal de residentes: pregunta al asistente del reglamento | medium | ≈ 0,002 | 8 |

El reglamento que se manda a la IA está acotado a 45.000 caracteres (≈ 13.000 tokens), por eso la pregunta del portal cuesta ≈ US$0,002.

## 3. Topes por plan

| | Prueba (7 días) | Pro | Business | Élite |
| --- | --- | --- | --- | --- |
| Precio | gratis | US$24 | US$73 | US$183 |
| **Presupuesto del chat al mes (US$ de costo)** | 0,25 | 0,75 | 2,25 | 6 |
| Equivale a mensajes promedio al mes | ≈ 100 en la semana | ≈ 300 | ≈ 900 | ≈ 2.400 |
| Ventana de 5 horas (20 % del presupuesto) | 0,05 (≈ 20 msg) | 0,15 (≈ 60 msg) | 0,45 (≈ 180 msg) | 1,20 (≈ 480 msg) |
| Ventana de 7 días (40 % del presupuesto) | 0,10 (≈ 40 msg) | 0,30 (≈ 120 msg) | 0,90 (≈ 360 msg) | 2,40 (≈ 960 msg) |
| **Horas de Reuniones al mes** | 2 h en total | **8 h** | **24 h** | **60 h** |
| Actas de una misma reunión | 3 | 3 | 3 | 3 |
| Generaciones al mes / por día | 5 en total / 2 | 15 / 3 | 40 / 5 | 100 / 10 |
| Minutos de audio al mes, **compartidos** entre chat y documentos | 20 en total | 120 | 300 | 800 |
| Asistente del reglamento (residentes), por administrador: día / mes | 120 / 1.200 | **40 / 300** | **80 / 600** | **120 / 1.000** |

Lo que cuenta en el porcentaje del chat: los mensajes (todas sus vueltas), el título, las imágenes que se leen, los audios transcritos en
el chat y las preguntas a reuniones. **No** cuentan: informes, actas, cartas, importaciones, reuniones (horas) ni el portal de residentes.

## 4. Techo de costo de IA con todo usado al 100 %

| Plan | Precio | Chat | Reuniones (horas) | Actas de reuniones (3 por reunión) | Documentos + audio | Portal | Otros | **Total** | **% del precio** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pro | US$24 | 0,75 | 3,2 | 1,1 | 0,3 + 0,7 | 0,6 | 0,3 | **US$6,9** | **≈ 28 %** |
| Business | US$73 | 2,25 | 9,6 | 3,3 | 0,7 + 1,8 | 1,2 | 1,5 | **US$20,4** | **≈ 28 %** |
| Élite | US$183 | 6,0 | 24,0 | 8,3 | 1,8 + 4,8 | 2,0 | 3,0 | **US$49,9** | **≈ 27 %** |

**Antes de estos topes** (sin límite de actas por reunión y con el portal en 1.000 preguntas para todos), el mismo cálculo daba
**≈ 52 % en Pro, ≈ 45 % en Business y ≈ 43 % en Élite**. La diferencia está sobre todo en las actas de reuniones largas.

Con el uso típico (≈ 35 % del techo) el costo queda en ≈ 10 % del precio. Esto no incluye Vercel, Neon, Blob, correo, comisiones de
ePayco ni impuestos.

## 5. Topes de seguridad (valen para todas las cuentas, también beta y fase de pruebas)

Están muy por encima de lo que hace una persona de verdad; solo frenan abusos, ráfagas y repeticiones sin fin.

| Dónde | Tope | Por qué |
| --- | --- | --- |
| Chat de los agentes | 12 mensajes por minuto; 5 adjuntos (sin repetidos); 12.000 caracteres por mensaje | Una persona no pasa de ~6 por minuto; el servidor no limitaba los adjuntos que la interfaz sí |
| Chat: herramientas | 4 vueltas, 4 herramientas por vuelta, 2 archivos por mensaje, 25 archivos al día | Cada vuelta repite el historial en la entrada |
| Chat: esfuerzo | `high` solo para análisis, redacción y adjuntos | Preguntar «¿cuánto debe…?» se contesta con los datos; pensar más solo lo encarece |
| Chat de soporte | 1.500 caracteres, 6 turnos de historial, 12 por hora y 40 al día | Sin tope, un mensaje enorme costaba 230 veces lo normal |
| Reuniones: duración | 12 h por reunión (8 h es el caso de diseño) | Una grabación de 48 h costaba ≈ US$20 |
| Reuniones: horas | lo ya transcrito cuenta aunque se borre la reunión | Borrar devolvía las horas |
| Reuniones: actas | 3 por reunión | Cada una de 8 h cuesta ≈ US$0,37 |
| Reuniones: archivos | no se acepta el mismo nombre y tamaño dos veces en una reunión | Duplicaba el audio |
| Preguntar (sin plan) | 60 preguntas al día | En frío sobre 8 h cuesta ≈ US$0,15; «Detener» y «Reintentar» ahora también cuentan |
| Documentos con audio | 5 h de audio por generación; el cupo mensual se comprueba con el tamaño real del archivo | El tamaño declarado por el cliente se podía falsear; el lote de Élite no pasaba por el cupo |
| Corrección de documentos | instrucción de 4.000 caracteres, 12 por hora, 10 por documento | Una instrucción gigante pasaba el tramo de 100.000 tokens (×5) |
| Borrador de comunicado | 10 por hora y 30 al día; nombre de copropiedad de 120 caracteres | Entrada sin tope |
| Carta de cobro | 60 conceptos por carta (se dice cuántos faltan) | Entrada sin tope |
| Importaciones (unidades y bitácora) | 10 por hora y 30 al día; no se aceptan audios | Un audio se transcribía para nada |
| Asistente del reglamento | hasta 8 documentos y 3 lecturas nuevas por llamada; sin audios ni archivos de más de 15 MB | La lectura de fotos la paga el administrador desde una pregunta pública |
| Respuestas de funciones cortas | `maxTokens` 4.000 en carta, borrador y portal | Una respuesta desbocada podía costar 10 veces lo normal |

## 6. Palancas

| Palanca | Efecto |
| --- | --- |
| Presupuesto del chat de un plan (`chatBudgetUsd` en `src/lib/epayco.ts`) | Cambia cuántos mensajes caben. |
| Horas de Reuniones (`meetingHoursPerMonth`) | Es el costo más grande: 1 h cuesta ≈ US$0,40. No bajar de 8 h en Pro. |
| Actas por reunión (`MAX_ACTAS_POR_REUNION`) | Cada acta de 8 h cuesta ≈ US$0,37. |
| Topes del portal por plan (`LIMITES_DEL_ASISTENTE_DEL_PORTAL`) | Cada pregunta cuesta ≈ US$0,002. |
| Esfuerzo fijo del chat (`IA_ESFUERZO_AGENTE_CHAT`) | Menos pensamiento; menos calidad en análisis. |
| Sonnet 5.5 para el chat (`IA_MODELO_AGENTE_CHAT=claude-sonnet-5-5`) | Mejor calidad, ≈ 20 veces más costo por mensaje. |

## 7. Supuestos y lo que NO está verificado

- **Precio de Haiku 5.5:** de fuentes secundarias que citan la página de Anthropic (así lo dice `precios.ts`). Confirmar en platform.claude.com.
- **Tamaños de mensaje:** no medidos en producción. Prefijo del chat ≈ 7.000 tokens cacheables; historial hasta 40.000 caracteres; mezcla
  de mensajes 60/30/10; la caché del prefijo está fría la mitad de las veces.
- **Transcripción a US$0,006 por minuto** es una estimación, no la factura del proveedor.
- **Reunión de 8 h:** sus ≈ 130.000 tokens de transcripción superan el tramo de 100.000 de Haiku 5.5, que cuesta ×5 en acta y Preguntar.
- **Tope de audio compartido:** se estima por tamaño (1 MB ≈ 1 minuto). Un audio de poco peso (Opus, AMR) dura más de un minuto por MB,
  así que el cupo puede subestimar; se corrige con la duración real que devuelve la transcripción.
- **Varias peticiones a la vez:** los topes se leen del consumo ya registrado, que se guarda al terminar cada llamada; una ráfaga puede
  pasarse un poco antes de que el registro la alcance (por eso el chat tiene 12 mensajes por minuto).
- **No incluye** Vercel, Neon, Blob, correo, comisiones de ePayco ni impuestos.

## 8. Cómo calibrar con datos reales

Tras 2 semanas con el piloto abierto, el panel de Consumo (por usuario y por función, con CSV) da el costo real por mensaje, por reunión
y por residente. Con eso se reajustan los presupuestos. Revisar también los precios del proveedor cada trimestre.

## 9. Lo que ya está hecho y lo que falta

- Hecho: el porcentaje del chat (sesión, semana, mes) con la barra en el asistente y en cada chat; «Preguntar» dentro del porcentaje;
  Haiku 5.5 con esfuerzo por turno; el cupo de audio compartido comprobado con el tamaño real; los topes de seguridad de la sección 5;
  los 24 hallazgos confirmados por la revisión adversarial (ventanas móviles que cruzan el mes, hora de renovación, día de Bogotá, consumo
  de vueltas fallidas, lectura fallida del reglamento, etc.).
- Pendiente: poner `OPEN_TESTING=false` al abrir el cobro; la caché del historial del chat (ahorro ≈ 45 % por mensaje); tope de
  reintentos manuales de tareas de Reuniones (hoy «Reintentar» no cuenta cuántas veces se pulsa).
