# Plan de construcción — «Reuniones»

> Diseñado con Claude Opus 5.5 para ejecutarse con Claude Sonnet 5.5 (esfuerzo alto).
> **Quien ejecute: lee primero las secciones 1 (reglas) y 14 (hitos), y al cerrar cada hito
> actualiza la «Bitácora de avance» del final.** Este archivo es la fuente de verdad del proyecto:
> si una decisión cambia, se cambia aquí primero.

---

## 0. Qué construimos

**Problema.** La transcripción de las reuniones de consejo es el insumo principal de las actas e
informes. Hoy la app no puede con una reunión de 7–8 horas en ningún paso:

- El audio tiene un tope de 200 MB.
- Whisper corre dentro de una función de 5 minutos y alcanza para unas 3 horas.
- El resultado es texto plano, sin hablantes ni tiempos, y pegado a una generación.
- `Generar` recorta el insumo a 150.000 caracteres.
- Los agentes no ven transcripciones, y los cupos de transcripción no alcanzan.

**Fase 1 (este plan, completo).** Una sección **Reuniones** por copropiedad que:

1. **Captura** de dos formas:
   - grabando desde la app sin perder nada aunque se cierre el navegador o se vaya el internet;
   - subiendo archivos de audio o video de cualquier tamaño, con subida reanudable.
2. **Transcribe el 100 %** con quién habla y el minuto. Verifica la cobertura y la muestra.
3. **Analiza** la reunión completa en una **ficha**: temas, decisiones, compromisos, votaciones y
   sugerencia de nombres de hablantes.
4. **Redacta el acta** leyendo la reunión entera. Cada párrafo queda enlazado al minuto que lo respalda
   y se verifica que cada decisión y compromiso de la ficha aparece en el acta.
5. **Responde preguntas** sobre una reunión con la transcripción completa en contexto, citando el minuto.

Todo queda separado por copropiedad.

**Fuera de la Fase 1** (ver sección 17):

- Fase 2: chats, memoria e instrucciones por propiedad; búsqueda entre reuniones y documentos;
  compromisos en Bitácora e Inicio.
- Fase 3: transcripción en vivo, reconocimiento de voces, importar de Zoom/Meet/Teams, app nativa.

---

## 1. Reglas para quien ejecuta (obligatorias)

1. **Next.js 16 no es el que conoces** (ver `AGENTS.md`).
   - Antes de escribir rutas o usar APIs de Next, lee la guía en `node_modules/next/dist/docs/`.
     En especial `01-app/03-api-reference/04-functions/after.md` y la configuración de segmento
     `maxDuration`.
   - En los route handlers, `params` es una **Promise**: `{ params }: { params: Promise<{ id: string }> }`.
2. **Antes de escribir código que llame a Claude**, invoca la skill `claude-api` y sigue su guía de
   TypeScript: modelos, `output_config.effort`, streaming con `finalMessage()`, salida estructurada,
   caché de prompts y `fallbacks`. No escribas llamadas de memoria.
3. **Interfaz:** solo el kit `@/components/kit`, con el aspecto «Calma» (`design/guia/README.md`).
   - Sin color decorativo. Estados con `Estado`/`Etiqueta`. Español llano. Accesible por teclado.
   - Estilos propios en `<style href="k-reuniones-…" precedence="default">` con prefijo `.re-`.
   - No agregues Tailwind ad hoc salvo utilidades mínimas.
4. **Esquema: solo cambios aditivos** (tablas nuevas, columnas opcionales). Nunca renombres ni borres.
   - El `build` ejecuta `prisma db push --accept-data-loss` contra la base de cada entorno, y las vistas
     previas pueden compartir la base de producción.
   - Mantén `ensureMeetingsSchema()` (SQL idempotente) sincronizado con `schema.prisma`.
5. **Modo demo** (`DEMO_MODE=true`, que es el único entorno local) funciona **sin base de datos ni
   claves**. Cada ruta nueva tiene su rama demo **antes** de tocar `db`: hay un guardián que lanza error.
6. **No toques** las banderas `COMING_SOON` (siguen en `true`).
   - Reuniones se publica con la bandera `REUNIONES_PARA` (sección 13); empieza en `"admins"`.
   - Pasarla a `"todos"` exige aprobación del usuario.
7. **Commits por hito**, con los trailers que indique el recordatorio de atribución vigente.
   - Rama: `claude/project-analysis-migration-BXZQD`. Hoy es idéntica a `main`, así que los commits nuevos
     van sobre `main`.
   - **No abras PR ni fusiones sin preguntar.**
8. **Verificación en cada hito:**
   - `npx tsc --noEmit -p .`
   - `npx eslint <archivos tocados>`, con 0 errores nuevos.
   - `npx vitest run`.
   - En hitos con interfaz: capturas en demo (claro, oscuro y móvil 390 px), `node scripts/contraste.mjs dark`
     y `light` en 0, y barrido de desbordes de 360 a 1440 px.
   - `npx next build` antes de cada push grande.
9. **Servidor local en :3100** (el usuario pidió dejarlo abierto). Si un cambio de `globals.css` no se
   refleja: para el servidor, borra `.next/dev/cache/turbopack` y arráncalo de nuevo (script `reiniciar.sh`
   del scratchpad). Nunca mates procesos con un patrón que coincida con tu propia línea de comandos.
10. **Sin claves en el chat ni en commits.** Las variables nuevas, si hacen falta, las crea el usuario en Vercel.

---

## 2. Lo que ya existe y se reutiliza

| Pieza | Dónde | Uso en Reuniones |
|---|---|---|
| Vercel Blob privado | `@vercel/blob` 2.3.3. `get(url, { access: "private", headers })` admite `Range`. El cliente trae `createMultipartUpload` / `uploadPart` / `completeMultipartUpload` y `generateClientTokenFromReadWriteToken` | Subida reanudable, audio con saltos y descarga |
| Lectura privada | `node_modules/@vercel/blob/dist/chunk-*.js`: las lecturas privadas mandan `authorization: Bearer <token>` | `ffmpeg` lee el blob con `-headers` (confírmalo en la prueba de integración) |
| ffmpeg estático (2018) | `@ffmpeg-installer/ffmpeg`, ya en `serverExternalPackages`. Trae `libmp3lame`, `libopus`, `aac` y `https` | Normalizar (recortar no lo necesita: ver sección 7) |
| Cola con reclamo atómico y vigilante | `src/app/api/cron/process-batch/route.ts` | Mismo patrón en `MeetingTask` |
| Generación de actas | `src/lib/generation/run.ts`, `src/lib/documents/pdf-generator.ts` (`generatePdfHtml`), `src/lib/ai/acta-requirements.ts`, `src/lib/ai/grammateus.ts` | El acta se guarda como `Generation`: Historial y descargas sin cambios |
| Cliente Claude | `src/lib/ai-client.ts` (`@anthropic-ai/sdk` 0.88) | Nuevo `src/lib/meetings/ia.ts` con streaming y salida estructurada |
| OpenAI 6.34 | `openai.audio.transcriptions.create` con `model: "gpt-4o-transcribe-diarize"`, `response_format: "diarized_json"` y `chunking_strategy: "auto"` (obligatorio en audios de más de 30 s). Admite `known_speaker_names` y `known_speaker_references` (hasta 4 voces, muestras de 2–10 s como data URL) | Proveedor de transcripción por defecto. Ya hay `OPENAI_API_KEY` en producción |
| Kit y aspecto «Calma» | `src/components/kit/*`: `ZonaSubida`, `ListaArchivos`, `FilaArchivo`, `BarraProgreso`, `ProgresoGeneracion`, `Tabla`, `Segmentos`, `PestanasUnidas`, `Modal`, `MenuMas`, `Aviso`/`avisar`, `Vacio`, `Esqueleto`, `Redactor`, `MensajeUsuario`, `RespuestaAgente`… | Toda la interfaz |
| Demo | `src/lib/demo-store.ts` | Reuniones de ejemplo |
| Correo | `src/lib/email.ts` (Resend; patrón `sendPortalLinkEmails`) | Aviso de reunión lista |
| Planes | `src/lib/epayco.ts` (`PLANS`, `TRIAL_LIMITS`), `src/lib/usage.ts` (`checkUsageLimits`, `recordUsage`), `src/lib/plan.ts` (`OPEN_TESTING`) | Cupo de horas |
| Admin | `session.user.role`, `src/lib/admin-auth.ts` (`isEnvAdmin`) | Piloto solo para admins |
| `after()` | `next/server`; corre dentro del `maxDuration` de la ruta | Arrancar el trabajo sin esperar al cron |
| Cron | `vercel.json`; solo se ejecuta en **producción** | `process-meetings` cada minuto y `cleanup-meetings` diario |

---

## 3. Decisiones de diseño (y por qué)

1. **Todo el procesamiento ocurre fuera de la petición del usuario.**
   - Va en una cola durable en Postgres (`MeetingTask`). La drena un cron cada minuto en producción y la
     empujan llamadas con `after()`: al terminar la captura y al consultar el estado.
   - Ninguna tarea dura más de ~230 s (las rutas tienen `maxDuration = 300`). Se reintenta sola y es
     idempotente por `(meetingId, key)`.
   - Por qué: elimina el límite de «lo que quepa en 5 minutos» que hoy corta la transcripción.
2. **Una sola línea de tiempo por reunión, en MP3 CBR de 32 kbps, mono, 16 kHz.**
   - Cada fuente (archivo subido o sesión de la grabadora) se normaliza en tramos de 10 minutos con
     `-write_xing 0`, y se ensambla en un único `audio.mp3` concatenando bytes. Eso es válido en MP3 CBR
     sin cabecera Xing.
   - A 16 kHz y 32 kbps cada trama MP3 mide exactamente 144 bytes y dura 36 ms, sin relleno. Por eso el
     milisegundo `t` está en el byte `floor(t / 36) * 144`, y recortar un tramo es leer un rango de bytes,
     sin `ffmpeg`.
   - Por qué: cualquier navegador reproduce y salta con exactitud (Range); recortar para transcribir es
     una lectura por rango; pesa ~14 MB por hora (8 h ≈ 115 MB).
3. **Subida directa y reanudable a Blob privado.**
   - Multipart manual desde el navegador, con partes de 16 MB (el mínimo de Blob es 5 MB) y token del
     servidor. El estado (`uploadId`, `key`, partes con `etag`) se guarda en IndexedDB.
   - Si se corta, el usuario elige el mismo archivo y se reanuda en las partes que faltan.
   - Sin tope de la app (solo uno de seguridad de 20 GB).
   - Por qué: el cuerpo de una función de Vercel admite 4,5 MB; el archivo nunca pasa por el servidor.
4. **Grabadora propia para reuniones** (la del chat guarda todo en memoria y se pierde si se cierra la pestaña).
   - `MediaRecorder` con `timeslice` de 5 s. Cada trozo va primero a IndexedDB, y cada ~30 s se envía al
     servidor por `POST` directo (menos de 1 MB, sin token).
   - Al terminar, el servidor une las partes de cada sesión: WebM y MP4 fragmentado se pueden concatenar.
   - Si el navegador se cierra, al volver se ofrece «Continuar» y se abre una sesión nueva.
5. **Proveedor de transcripción intercambiable.**
   - Por defecto, OpenAI `gpt-4o-transcribe-diarize`: no requiere cuenta nueva.
     - Tramos de 10 min con 30 s de solapamiento a cada lado.
     - Las ≤4 voces principales se fijan con muestras de referencia para que conserven la etiqueta
       entre tramos; el resto se concilia por solapamiento.
   - AssemblyAI como adaptador opcional (hito 10), que diariza la reunión entera de una pasada.
   - La elección se hace con grabaciones reales del usuario.
6. **Garantía de completitud.**
   - El plan de tramos cubre `[0, D]` por construcción, y ninguna etapa avanza si falta un tramo.
   - `coverage` se calcula y se muestra («Cobertura 100 % · 8 h 12 min»).
   - Cada tarea tiene 3 intentos; después la reunión pasa a «error» y se ofrece «Reintentar» solo de lo fallido.
   - Los tramos sin voz se marcan como silencio: cuentan como cubiertos y se muestran al usuario.
7. **IA en dos pasos.**
   - (a) La **ficha** se arma por bloques de ~25 min, con salida estructurada validada, y luego se consolida.
   - (b) El **acta** se redacta por secciones en paralelo, con la transcripción **completa** en contexto y
     la caché precalentada.
     - Cada sección lleva marcadores de decisión `[[D3]]`, de compromiso `[[C2]]` y de minuto
       `[[t=01:23:45]]`.
     - Una verificación determinista confirma que están todas las decisiones y compromisos.
   - Modelo en la variable `MEETINGS_MODEL`; por defecto `claude-opus-5-5`, según la skill `claude-api`.
   - Esfuerzo en `MEETINGS_EFFORT`; por defecto `high`, y `medium` en Preguntar.
   - `fallbacks: "default"` activado.
8. **El acta se guarda como `Generation`** con `meetingId`. Así aparece en Historial y se descarga con las
   rutas actuales, sin tocarlas.
9. **Piloto oculto en producción.**
   - `REUNIONES_PARA = "admins"`: solo cuentas con rol admin ven Reuniones. En demo siempre se ve.
   - Por qué: solo producción tiene base de datos, Blob, claves y cron. El usuario prueba con grabaciones
     reales antes de abrirlo a todos.

---

## 4. Arquitectura

```
CAPTURA
  Grabar en la app ── trozos de 5 s → IndexedDB ── cada ~30 s → POST /api/meetings/:id/live ─┐
  Subir archivo(s) ── multipart directo, reanudable → Vercel Blob privado ───────────────────┤
                                                                                              ▼
                                              MeetingSource (original por archivo o sesión)
COLA (MeetingTask)                                                                            ▼
  ensamblar_sesion → normalizar (MP3 10 min) → armar_audio (audio.mp3, duración, cupo, tramos)
      → transcribir_tramo:0 → elegir_voces → transcribir_tramo:1..N (paralelo, con referencias)
      → unir (hablantes, cobertura, intervenciones, transcripcion.txt)
      → analizar_bloque ×M (paralelo) → consolidar_ficha → reunión «lista» + correo
RESULTADO                                                                                     ▼
  Meeting.digest · MeetingUtterance · MeetingSpeaker · audio.mp3 · transcripcion.txt
  Página: Resumen · Transcripción (audio sincronizado) · Hablantes · Acta · Preguntar
  Acta: redactar_seccion ×K (paralelo, caché) → ensamblar_acta → Generation (Historial y descargas)
```

**Estados de `Meeting.status`:**

| Estado | Significado |
|---|---|
| `borrador` | Sin audio |
| `grabando` | Llegan partes en vivo |
| `subiendo` | Hay subidas en curso |
| `en_cola` | Captura cerrada |
| `procesando` | Con `stage` ∈ `preparando_audio`, `transcribiendo`, `uniendo`, `analizando`, y `progress` de 0 a 100 |
| `lista` | Terminada |
| `error` | Con `errorMessage` legible y reintento |
| `sin_cupo` | El audio se conserva; se procesa al tener horas disponibles |

Solo se agregan fuentes en `borrador`, `subiendo` o `error`. Reprocesar una reunión lista queda fuera
de la Fase 1.

**Rutas de almacenamiento (Blob privado, prefijo por reunión):**

- `meetings/{id}/fuentes/{n}-{nombre}`: originales subidos.
- `meetings/{id}/vivo/{sesion}/{seq}.{webm|mp4}`: partes de la grabadora.
- `meetings/{id}/fuentes/sesion-{s}.{webm|mp4}`: sesiones ensambladas.
- `meetings/{id}/norm/{sourceId}/{n}.mp3`: tramos normalizados.
- `meetings/{id}/audio.mp3` y `meetings/{id}/transcripcion.txt`.

Al borrar una reunión, se listan y se borran todos los blobs con el prefijo `meetings/{id}/`.

---

## 5. Modelo de datos (aditivo)

Agregar a `prisma/schema.prisma`, más las relaciones inversas:

- `User`: `meetings Meeting[]`
- `Property`: `meetings Meeting[]` y `people PropertyPerson[]`
- `Generation`: columna `meetingId String?` con `@@index([meetingId])`, sin relación.

```prisma
// ============================================
// Reuniones: grabación, transcripción, ficha y acta
// ============================================

model Meeting {
  id            String    @id @default(cuid())
  userId        String
  propertyId    String
  type          String    @default("consejo") // consejo | comite | asamblea_ordinaria | asamblea_extraordinaria | otra
  title         String
  date          DateTime                      // fecha y hora de la reunión
  status        String    @default("borrador") // ver sección 4
  stage         String?                       // preparando_audio | transcribiendo | uniendo | analizando
  progress      Int       @default(0)          // 0-100 del paso actual
  errorMessage  String?
  durationMs    Int?                          // duración total de audio.mp3
  coverage      Float?                        // 0..1
  audioUrl      String?                       // audio.mp3 (privado)
  transcriptUrl String?                       // transcripcion.txt (privado)
  digest        Json?                         // ficha (sección 9)
  speakerRefs   Json?                         // [{ nombre: "V1", desdeMs, hastaMs }] voces de referencia
  provider      String?                       // openai | assemblyai | demo
  consentAt     DateTime?                     // se informó a los asistentes que se grababa
  costUsd       Float     @default(0)
  readyAt       DateTime?

  user       User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  property   Property           @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  sources    MeetingSource[]
  liveParts  MeetingLivePart[]
  tasks      MeetingTask[]
  utterances MeetingUtterance[]
  speakers   MeetingSpeaker[]
  markers    MeetingMarker[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, date])
  @@index([propertyId, date])
  @@index([status, updatedAt])
}

model MeetingSource {
  id                String    @id @default(cuid())
  meetingId         String
  idx               Int                        // orden en la línea de tiempo
  kind              String                     // archivo | grabacion
  session           Int?                       // nº de sesión (kind = grabacion)
  name              String
  url               String?                    // original o sesión ensamblada
  pathname          String?
  mimeType          String?
  sizeBytes         Float     @default(0)      // Float: el Int de Prisma no llega a 2 GB
  status            String    @default("subiendo") // subiendo | recibida | normalizando | normalizada | error
  normalizedMs      Int       @default(0)      // hasta dónde llegó la normalización (reanudable)
  segments          Json      @default("[]")   // [{ n, url, durationMs, bytes }]
  durationMs        Int?
  offsetMs          Int?                       // inicio dentro de audio.mp3
  originalDeletedAt DateTime?                  // retención (sección 12)

  meeting Meeting @relation(fields: [meetingId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([meetingId])
}

model MeetingLivePart {
  id         String @id @default(cuid())
  meetingId  String
  session    Int
  seq        Int
  url        String
  bytes      Int
  durationMs Int
  mimeType   String

  meeting Meeting @relation(fields: [meetingId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([meetingId, session, seq])
  @@index([meetingId])
}

model MeetingTask {
  id        String    @id @default(cuid())
  meetingId String
  kind      String
  key       String                       // idempotencia: "normalizar:<sourceId>", "tramo:12", "bloque:3"…
  payload   Json      @default("{}")
  result    Json?
  status    String    @default("pendiente") // pendiente | en_curso | hecha | fallida
  attempts  Int       @default(0)
  runAfter  DateTime  @default(now())
  lockedAt  DateTime?
  error     String?

  meeting Meeting @relation(fields: [meetingId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([meetingId, key])
  @@index([status, runAfter])
  @@index([meetingId, kind])
}

model MeetingUtterance {
  id        String @id @default(cuid())
  meetingId String
  idx       Int
  startMs   Int
  endMs     Int
  speaker   String                // etiqueta global: V1..V4 (referencias) o H5, H6…
  text      String @db.Text

  meeting Meeting @relation(fields: [meetingId], references: [id], onDelete: Cascade)

  @@index([meetingId, startMs])
}

model MeetingSpeaker {
  id            String  @id @default(cuid())
  meetingId     String
  label         String
  name          String?
  role          String?
  personId      String?
  confirmed     Boolean @default(false)  // false = sugerencia de la IA
  suggestion    Json?                    // { nombre, rol, evidencia, t, igualA }
  talkMs        Int     @default(0)
  sampleStartMs Int?
  sampleEndMs   Int?

  meeting Meeting @relation(fields: [meetingId], references: [id], onDelete: Cascade)

  @@unique([meetingId, label])
}

model MeetingMarker {
  id        String  @id @default(cuid())
  meetingId String
  atMs      Int
  kind      String                     // tema | votacion | compromiso | nota
  note      String?

  meeting Meeting @relation(fields: [meetingId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@index([meetingId])
}

model PropertyPerson {
  id         String  @id @default(cuid())
  propertyId String
  name       String
  role       String?                  // presidente | consejero | administrador | revisor_fiscal | contador | otro
  active     Boolean @default(true)

  property Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([propertyId])
}
```

**`src/lib/ensure-meetings-schema.ts`** sigue el patrón de `ensure-agent-tables.ts`:

- SQL idempotente: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE "Generation"
  ADD COLUMN IF NOT EXISTS "meetingId" TEXT` y las FK con `ON DELETE CASCADE` dentro de bloques `DO`.
- Equivalencias: `TEXT`, `INTEGER`, `DOUBLE PRECISION`, `BOOLEAN`, `TIMESTAMP(3)`, `JSONB`, y
  `DEFAULT CURRENT_TIMESTAMP` donde hay `@default(now())`.
- Se memoriza por proceso con una promesa de módulo. Lo llaman las rutas de reuniones y el cron.
  En demo no hace nada.

**Trampas:**

- `Int` de Prisma es de 32 bits: los milisegundos de 8 h (28,8 M) caben, pero los bytes no. Por eso
  `sizeBytes` es `Float`.
- No uses `BigInt`: rompe `JSON.stringify`.

---

## 6. Cola de tareas

**`src/lib/meetings/cola.ts`**

- `encolar(meetingId, kind, key, payload?, runAfter?)`: crea si no existe (idempotente por la clave única).
- `reclamar(limite, kinds?)`: lee tareas `pendiente` con `runAfter <= now()` por `createdAt`. Reclama cada
  una con `updateMany({ where: { id, status: "pendiente" }, data: { status: "en_curso", lockedAt: now,
  attempts: { increment: 1 } } })` y se queda solo con las que devuelven `count === 1`.
- `latido(id)`: actualiza `lockedAt` en tareas largas, cada ~30 s.
- `completar(id, result?)`.
- `fallar(id, error, { reintentable })`:
  - Si `attempts < 3` y es reintentable: vuelve a `pendiente` con `runAfter = now + [30 s, 2 min, 10 min][attempts-1]`.
  - Si no: queda `fallida`, y la reunión pasa a `error` con un mensaje legible según `kind`. Por ejemplo:
    «No pudimos transcribir el tramo 2:10–2:20 después de 3 intentos».
- `vigilante()`: las `en_curso` con `lockedAt` de hace más de 10 min vuelven a `pendiente`, o a `fallida`
  si ya llevan 3 intentos.
- `reintentarFallidas(meetingId)`: las `fallida` pasan a `pendiente` con `attempts = 0`, y la reunión a `procesando`.

**`src/lib/meetings/trabajador.ts`**

- `trabajar({ presupuestoMs, concurrencia = 4 })`: bucle mientras quede presupuesto.
  - Reclama hasta `concurrencia` tareas y las ejecuta en paralelo, cada una con su manejador.
  - Al terminar cada una llama a `avanzar(meetingId)`.
  - No reclama tareas nuevas si queda menos de lo que dura la tarea más larga (~120 s).
- Registro de manejadores por `kind` (sección 7, 8 y 9).

**`src/lib/meetings/orquestador.ts` → `avanzar(meetingId)`**

- Decide la etapa siguiente con claves idempotentes:
  - todas las `normalizar:*` hechas y ninguna fuente subiendo → `armar_audio`
  - `tramo:0` hecho → `voces`
  - todos los `tramo:*` hechos → `unir`
  - todos los `bloque:*` hechos → `ficha`
  - todas las secciones del acta hechas → `acta:<genId>:final`
- Actualiza `stage` y `progress` (tramos hechos / total, bloques hechos / total, etc.).

**Entradas al trabajador:**

- **Cron** `GET /api/cron/process-meetings` cada minuto (agregar a `vercel.json`). Usa
  `Authorization: Bearer ${CRON_SECRET}` y `maxDuration = 300`. Ejecuta `vigilante()` y luego
  `trabajar({ presupuestoMs: 230_000 })`.
- **Empujones con `after()`** (las rutas que lo usan declaran `maxDuration = 300`):
  - al cerrar la captura (`POST …/process`);
  - al pedir reintento;
  - al consultar el estado (`GET …/status`), solo si hay tareas pendientes **y** ninguna `en_curso`
    actualizada en los últimos 45 s. Así se evita lanzar trabajadores de más.
  - Las vistas previas no tienen cron: avanzan mientras la página consulta el estado. En producción el
    cron sigue aunque se cierre la página.
- **No** se usan llamadas HTTP a la propia app: las vistas previas tienen protección SSO y fallarían.

---

## 7. Audio

**`src/lib/meetings/almacen.ts`** define la interfaz `Almacen` con `subir(pathname, body, contentType)`,
`subirFlujo(pathname, stream, contentType)` (multipart en servidor), `leer(url, { range? })`,
`urlConCabeceras(url)` (para `ffmpeg`), `listar(prefijo)` y `borrar(urls|prefijo)`. Tiene dos
implementaciones:

- `AlmacenBlob`: Vercel Blob privado.
- `AlmacenLocal`: carpeta temporal y servidor HTTP local. Sirve para pruebas.

**`src/lib/meetings/audio.ts`** (servidor)

- `normalizarFuente({ url, desdeMs, presupuestoMs, alTerminarSegmento })`
  - Comando: `ffmpeg -hide_banner -nostdin -headers "Authorization: Bearer …\r\n" -ss {desde} -i {url}
    -vn -map_metadata -1 -ac 1 -ar 16000 -c:a libmp3lame -b:a 32k -f segment -segment_format mp3
    -segment_format_options id3v2_version=0:write_xing=0 -segment_time 600 -reset_timestamps 1
    {tmp}/seg_%04d.mp3`.
  - Las opciones del MP3 van dentro de `-segment_format_options`: sueltas (`-write_xing 0`) las recibe el
    muxer `segment`, no el de MP3. Sin cabecera Xing ni etiqueta ID3, cada segmento es solo tramas, y
    concatenarlos da un MP3 válido.
  - Cada segmento terminado (cuando aparece el siguiente o termina el proceso) se sube a
    `norm/{sourceId}/{n}.mp3` y se registra en `MeetingSource.segments`.
  - La duración sale de los bytes: `bytes * 8 / 32000 * 1000` ms.
  - Si se agota el presupuesto: se mata `ffmpeg`, se conservan los segmentos completos y se guarda
    `normalizedMs`. La tarea siguiente reanuda con `-ss`.
  - `-vn` permite videos (Zoom, MP4, MOV).
- `ensamblarSesion(partes)`: concatena los bytes de las partes en orden con `subirFlujo`. No requiere `ffmpeg`.
- `armarAudio(fuentes)`: concatena en orden los bytes de todos los segmentos normalizados en
  `audio.mp3`, y calcula `offsetMs` por fuente y la duración total.
- `rangoDeBytes(desdeMs, hastaMs)` (pura): `[floor(desdeMs / 36) * 144, ceil(hastaMs / 36) * 144)`.
- `recortar(audioUrl, desdeMs, hastaMs)`: lectura por rango (`Almacen.leer` con `Range`), sin `ffmpeg`.
  Devuelve un `Buffer` de unos 2,6 MB por tramo de 11 min. La primera trama del recorte puede perder
  36 ms por la reserva de bits del MP3; no afecta a la transcripción.
- `muestraDeVoz(audioUrl, desdeMs, hastaMs)`: igual, como `data:audio/mpeg;base64,…` (4–8 s).
  - Comprueba en la documentación de OpenAI que `known_speaker_references` acepta MP3.
  - Si no lo acepta, convierte la muestra a WAV con el `ffmpeg` local, con entrada por `pipe:0`.
- **Prueba de integración** (Vitest, se salta si no hay `ffmpeg`):
  - Genera 25 min sintéticos con `sine`, `anoisesrc` y huecos de silencio.
  - Los sirve con un servidor HTTP local que **exige** `Authorization` y responde `Range` con 206.
  - Comprueba:
    - que salen 3 segmentos;
    - que `audio.mp3` dura 25 min ± 1 s;
    - que su tamaño es múltiplo de 144 y cada múltiplo de 144 empieza con `FF F3` (cabecera de trama
      MPEG-2 capa III), lo que confirma que no quedan ID3 ni Xing entre segmentos;
    - que se reanuda con `normalizedMs`;
    - que `recortar` devuelve la duración pedida y `ffmpeg` lo decodifica sin errores.
  - Si el `ffmpeg` de 2018 no acepta `-headers` con HTTPS en Vercel, plan B: una ruta proxy interna con
    token HMAC que sirva el blob con `Range`. Ya existe `src/lib/agent-file-token.ts` como patrón de firma.

---

## 8. Transcripción

**`src/lib/meetings/transcripcion/`**

- `tipos.ts`:
  - `Segmento = { inicioMs, finMs, hablante, texto }`.
  - `Proveedor = { nombre, modo: "tramos" | "completo", tramoMs?, solapeMs?, transcribirTramo?(audio,
    { referencias }), iniciar?(audioUrl), consultar?(jobId), costoUsdPorMinuto }`.
- `elegir.ts`: `TRANSCRIPCION_PROVEEDOR` (`openai` por defecto). `assemblyai` solo si además existe
  `ASSEMBLYAI_API_KEY`. En `DEMO_MODE` usa `demo`.
- `openai.ts`:
  - Llamada: `transcriptions.create({ model: "gpt-4o-transcribe-diarize", file: await toFile(buffer,
    "tramo.mp3", { type: "audio/mpeg" }), response_format: "diarized_json", chunking_strategy: "auto",
    language: "es", known_speaker_names?, known_speaker_references? })`.
  - Lee `segments[]`: `start` y `end` en segundos, `speaker` y `text`. Verifica el tipo exacto en
    `node_modules/openai/resources/audio/transcriptions.d.ts`.
  - Timeout de 150 s por llamada; los reintentos los hace la cola.
- `assemblyai.ts`: hito 10. **Verifica la API en la documentación oficial antes de programarla**.
  - Esquema esperado: subir el audio, crear la transcripción con hablantes y `language_code: "es"`, y
    consultarla hasta que termine; usar `utterances[]`.
  - Si la reunión supera la duración máxima del proveedor, se parte en mitades con 2 min de solape.
- `demo.ts`: segmentos de ejemplo.
- `tramos.ts`:
  - `planificarTramos(D, T = 600_000, S = 30_000)`: el tramo `i` cubre el audio
    `[max(0, iT − S), min(D, (i+1)T + S)]`, y su **núcleo** es `[iT, (i+1)T)`.
  - `asignarANucleo(segmentos)`: cada segmento se queda con el tramo cuyo núcleo contiene su punto medio.
    Así, una frase que cruza el borde sale completa una sola vez.
- `hablantes.ts`:
  - `elegirVoces(segmentosTramo0)`: hasta 4 etiquetas con ≥ 60 s de habla y, para cada una, un fragmento
    limpio de 4–8 s (una sola voz, sin solaparse con otra). Se nombran `V1`..`V4` y se guardan en
    `Meeting.speakerRefs`.
  - `reconciliar(prev, actual, ventana)`: en la ventana `[iT − S, iT + S]` suma el tiempo de cruce entre
    etiquetas del tramo anterior (ya globales) y del actual. Las empareja de mayor a menor si comparten
    ≥ 1,5 s.
  - Las etiquetas `V1..V4` que devuelve OpenAI con referencias ya son globales. Las demás sin pareja
    reciben `H{n}` nuevo.
- `unir.ts`, con funciones puras y probadas:
  - `unirTramos(tramos) → { segmentos, etiquetas, cobertura, silencios }`.
  - `fusionarContiguos`: mismo hablante, hueco < 1 s y total < 60 s.
  - `formatearTranscripcion(segmentos, nombres)`: líneas `[01:23:45] V1 (Martha López): texto`.
  - `calcularCobertura(nucleosHechos, D)` debe dar 1,0 para pasar a `unir`.

**Manejadores:**

- `transcribir_tramo:i`: recorta, transcribe y guarda el `result` con tiempos relativos.
  - `tramo:0` va sin referencias.
  - Tras `tramo:0`, `voces` elige las referencias y encola `tramo:1..N-1` con ellas.
- `unir`: aplica `asignarANucleo` y `reconciliar` y calcula la cobertura.
  - Reemplaza las `MeetingUtterance` en lotes de 1.000 con `createMany`.
  - Crea `MeetingSpeaker`, con `talkMs` y un fragmento de muestra de 5–8 s.
  - Sube `transcripcion.txt`.
  - Encola `bloque:0..M-1`.
- Con AssemblyAI: `completo` sube el audio y crea el trabajo; `consulta:n` vuelve a consultar con
  `runAfter + 60 s` hasta que termina; después `unir`.

---

## 9. IA (Claude)

**`src/lib/meetings/ia.ts`**: cliente según la skill `claude-api`.

- Modelo `process.env.MEETINGS_MODEL ?? "claude-opus-5-5"`.
- `output_config.effort = process.env.MEETINGS_EFFORT ?? "high"` (`medium` en Preguntar). En Opus 5.5 el
  pensamiento no se desactiva y el esfuerzo por defecto es `medium`, así que se fija explícito.
- Streaming con `finalMessage()`.
- `fallbacks: "default"` con la cabecera beta que indique la skill; está vigente
  `server-side-fallback-2026-07-01`.
- Revisa `stop_reason` (`refusal`, `max_tokens`) antes de leer el contenido.
- Nada de `temperature` (los modelos 5 lo rechazan) ni de `tool_choice` forzado.
- Registra el uso (entrada, salida y caché) para calcular el costo.
- Salida estructurada con el helper que indique la skill. Si requiere `zod`, agrégalo como dependencia.

**Ficha (`src/lib/meetings/ficha.ts`)**

- `planificarBloques(segmentos, objetivo = 25 min)`: bloques alineados a intervenciones.
- `analizar_bloque:k`. Sistema: fidelidad absoluta (nada que no esté en el texto), contexto de propiedad
  horizontal en Colombia, salida en español. El usuario envía:
  - copropiedad, tipo y fecha de la reunión;
  - las personas de la copropiedad (`PropertyPerson`);
  - los marcadores del bloque;
  - la transcripción del bloque con tiempos y etiquetas.
- Salida validada de cada bloque:
  `{ temas[{ titulo, inicioS, finS, resumen }], decisiones[{ t, texto }], compromisos[{ t, texto,
  responsable?, fecha? }], votaciones[{ t, asunto, aFavor?, enContra?, abstenciones?, resultado }],
  cifras[{ t, texto }], pistasHablantes[{ etiqueta, nombre?, rol?, evidencia, t }] }`.
- `ficha` consolida todos los bloques en un JSON pequeño:
  `{ resumen, ordenDelDia[{ titulo, inicioS }], asistentes[{ nombre, rol? }], decisiones[{ id: "D1",
  texto, t }], compromisos[{ id: "C1", texto, responsable?, fecha?, t }], votaciones[…], pendientes[…],
  hablantes[{ etiqueta, nombreSugerido?, rol?, confianza, evidencia, igualA? }] }`.
  - Se guarda en `Meeting.digest`, y las sugerencias en `MeetingSpeaker.suggestion` con `confirmed = false`.
  - La reunión pasa a `lista`, con `readyAt`; se envía el correo y se registra el uso.

**Acta (`src/lib/meetings/acta.ts`)**

- `POST /api/meetings/[id]/acta`:
  - Verifica el cupo de generaciones (`checkUsageLimits`).
  - Crea una `Generation` con `type: "acta"`, `meetingId`, mes y año de la reunión,
    `inputText: "Desde la reunión «…»"` y `status: "processing"`.
  - Encola `acta:<gen>:s<k>` por cada tema del orden del día. Los temas mínimos se agrupan, con un máximo
    de 12 secciones.
- **Precalentar la caché** antes de las secciones en paralelo: sistema con las reglas de Grammateus
  adaptadas más la transcripción completa con nombres, con `cache_control`. Las secciones comparten ese
  prefijo. Detalles en `shared/prompt-caching.md` → Pre-warming, de la skill.
- Cada sección recibe el tema, su rango de tiempo y los IDs de decisión y compromiso que caen en él.
  Devuelve markdown con `[[D3]]`, `[[C2]]` y `[[t=01:23:45]]`.
- `acta:<gen>:final` arma el acta:
  - Encabezado: copropiedad, tipo, fecha, hora de inicio, y lugar como `[PENDIENTE DE COMPLETAR]`.
  - Asistentes y quórum tomados de la ficha, o marcados como pendientes.
  - Orden del día, secciones, proposiciones y varios.
  - Tabla de compromisos.
  - Cierre, con la hora final derivada de la duración.
- **Verifica** que cada `D*` y `C*` aparece. Los que falten van a «Pendientes de verificación».
- Exporta sin marcadores a `acta.md` y `acta.html` (`generatePdfHtml`), y guarda `acta-referencias.md` con
  los minutos enlazados para la vista en la app.
- Ejecuta `analyzeActaRequirements` y marca la `Generation` como `completed`.

**Preguntar (`POST /api/meetings/[id]/preguntar`, SSE, `maxDuration = 120`)**

- El contexto es la ficha más la transcripción completa con nombres, en un bloque con `cache_control`
  de TTL 1 h.
- El cliente envía el historial (máximo 10 turnos) y la pregunta.
- La respuesta debe citar `[hh:mm:ss]`; la interfaz convierte cada cita en un enlace que reproduce ese
  momento.
- Cuenta contra los mensajes de agente del plan. Reutiliza la verificación de
  `/api/agents/[agentId]/chat`; extrae un helper si hace falta.

---

## 10. API

Todas las rutas usan `runtime = "nodejs"` y `auth()`. Verifican que la reunión o la propiedad son del
usuario y que Reuniones es visible para él (si no, 404). Todas tienen rama demo.

| Método y ruta | Contrato |
|---|---|
| `GET /api/meetings?propertyId=` | `{ items: [{ id, propertyId, propertyName, type, title, date, status, stage, progress, durationMs }] }` |
| `POST /api/meetings` | `{ propertyId, type, title, date }` → `{ meeting }` |
| `GET /api/meetings/[id]` | `{ meeting, sources, speakers, markers, digest }` |
| `PATCH /api/meetings/[id]` | `{ title?, type?, date?, consentAt? }` |
| `DELETE /api/meetings/[id]` | Borra blobs y filas |
| `GET /api/meetings/[id]/status` | `{ status, stage, progress, errorMessage, durationMs, coverage, tareas: { hechas, total } }` más el empujón |
| `POST /api/meetings/[id]/upload-token` | `{ nombre, tamano, tipo }` → `{ token, pathname, partSize: 16777216, contentType }`. Valida el tipo (`TIPOS_REUNION` en `upload-limits.ts`: audio y video), el tope de 20 GB y `validUntil` de 24 h. Estado → `subiendo` |
| `POST /api/meetings/[id]/sources` | `{ url, pathname, nombre, tamano, tipo, orden }` → `{ source }`. Solo URLs de Blob (`isAllowedBlobUrl`) bajo el prefijo de la reunión |
| `POST /api/meetings/[id]/live` | Cuerpo binario de 2 MB como máximo (leído con tope). Cabeceras `Content-Type`, `X-Sesion`, `X-Secuencia` y `X-Duracion-Ms`. Idempotente por `(session, seq)`: siempre la misma ruta de blob, con `addRandomSuffix: false` y `allowOverwrite: true`. Estado → `grabando`. Exige `consentAt` |
| `POST /api/meetings/[id]/live/sesion` | → `{ session, offsetMs }`. Reserva el número de la próxima sesión de grabación (fila con `seq = -1`) y dice dónde empieza dentro de la reunión. Exige `consentAt` |
| `POST /api/meetings/[id]/markers` | `{ id?, atMs, kind, note? }` → `{ marker }`. Idempotente por `id` (lo pone el dispositivo) |
| `POST /api/meetings/[id]/process` | `{ sesiones?: [{ session, ultimaSecuencia, mimeType, duracionMs }] }` → `{ status: "en_cola" }`, o 409 con `{ faltan: [{ session, seq }] }`. Encola la primera etapa y empuja |
| `POST /api/meetings/[id]/retry` | Reintenta las tareas fallidas |
| `GET /api/meetings/[id]/utterances?desde=&hasta=&q=` | `{ items: [{ id, startMs, endMs, speaker, text }], nombres, siguienteMs? }`, en páginas de 30 min |
| `PUT /api/meetings/[id]/speakers` | `{ hablantes: [{ label, name, role?, personId? }] }`. Varias etiquetas con el mismo nombre equivalen a una fusión |
| `GET /api/meetings/[id]/audio` | `audio.mp3` con `Range`: 206, `Content-Range`, `Accept-Ranges` y `Content-Length` (Safari las exige) |
| `GET /api/meetings/[id]/transcript` | `.txt` con nombres |
| `POST /api/meetings/[id]/acta` | `{}` → `{ generationId }` |
| `POST /api/meetings/[id]/preguntar` | SSE: `delta`, luego `done` |
| `GET/POST /api/properties/[propertyId]/people` y `PATCH/DELETE …/people/[personId]` | Personas de la copropiedad |
| `GET /api/cron/process-meetings` | Cron cada minuto |
| `GET /api/cron/cleanup-meetings` | Cron diario (`17 4 * * *`) |

---

## 11. Interfaz (aspecto «Calma»)

**Menú y registro**

- `src/components/kit/modulos.ts` gana la entrada `reuniones`: `nombre: "Reuniones"`,
  `href: "/dashboard/reuniones"`, `icono: AudioLines`, `tono: "blue"`,
  `queHace: "Graba o sube tus reuniones y obtén la transcripción completa."`. Se agrega a `ClaveModulo`.
- `iconoDeAccion` gana la regla `/^grabar/` → `Mic`.
- `Sidebar.tsx`: «Día a día» queda `[inicio, reuniones, generar, bitacora, asistente]`. Reuniones solo
  aparece si es visible para el usuario; el layout pasa la bandera a partir de la sesión.

**`/dashboard/reuniones` — lista**

- Cabecera: `CabeceraPieza titulo="Reuniones"`, con el subtítulo
  `subtitulo="Graba o sube tus reuniones: las transcribimos completas, con quién habla y en qué minuto."`.
  - Acción primaria: «Grabar reunión» (`Mic`).
  - Acción secundaria: «Subir grabación» (`Upload`).
- Selector de copropiedad: `PestanasUnidas` con «Todas» y las copropiedades.
- `Tabla` con estas columnas:
  - Fecha (principal).
  - Reunión: título y tipo.
  - Copropiedad: solo cuando el filtro es «Todas».
  - Duración.
  - Estado:

    | Estado | Cómo se muestra |
    |---|---|
    | `borrador` | «Sin audio» |
    | `grabando` | «Grabando» |
    | `subiendo` | «Subiendo 45 %» |
    | `en_cola` | «En cola» |
    | `procesando` | «Transcribiendo 23 de 48», giratorio |
    | `lista` | «Lista» (ok) |
    | `error` | «Error» (vencido) |
    | `sin_cupo` | «Sin horas disponibles» (falta) |

  - Acción: `BotonFila` «Abrir», o «Continuar» si está en borrador.
- Vacío: `Vacio` con «Aún no hay reuniones en {copropiedad}» y el texto «Graba la próxima reunión desde
  aquí o sube la grabación que ya tienes, de cualquier duración.», más las dos acciones.
- Si en este dispositivo hay una grabación sin terminar (IndexedDB): `Aviso enLinea tipo="aviso"` con
  «Tienes una grabación sin terminar: {título} · {duración}» y la acción «Continuar».

**`/dashboard/reuniones/nueva?modo=grabar|subir&p=`**

- Panel «Datos de la reunión»:
  - Copropiedad.
  - Tipo: Consejo de administración, Comité, Asamblea ordinaria, Asamblea extraordinaria u Otra reunión.
  - Título, sugerido como «Reunión de consejo — 12 de octubre».
  - Fecha y hora.
- **Subir:**
  - `ZonaSubida` con:
    - título «Suelta aquí la grabación»;
    - texto «o haz clic para elegirla. Audio o video de cualquier duración y tamaño. Si está partida en
      varios archivos, súbelos todos: se unen en orden.»;
    - formatos «MP3, M4A, WAV, MP4, MOV, WEBM, OGG, AMR…».
  - `ListaArchivos` con una `FilaArchivo` por archivo: nombre, tamaño, % y MB/s con tiempo restante,
    botones Pausar, Reanudar y Quitar, y flechas para ordenar.
  - Al completar todas, se procesa automáticamente.
  - Nota: «Puedes cerrar esta pestaña cuando todo llegue al 100 %. Si se corta la conexión, vuelve a
    elegir el mismo archivo y seguirá donde iba.»
- **Grabar:** «Empezar a grabar» crea la reunión y lleva a `/grabar`.

**`/dashboard/reuniones/[id]/grabar` — grabadora**

- **Antes de empezar:**
  - Selector de micrófono con medidor «Habla para probar».
  - Consejos: conectar el cargador; mantener la pantalla encendida. En iPhone el navegador pausa la
    grabación si se bloquea.
  - **Aviso legal** para leer en voz alta: «Esta reunión será grabada con el único fin de elaborar el
    acta. La grabación se guardará de forma privada y se tratará conforme a la política de protección de
    datos de la copropiedad.»
  - `Casilla` obligatoria «Ya lo informé a los asistentes», que guarda `consentAt`.
  - Botón «Empezar a grabar».
- **Grabando:**
  - Reloj grande `hh:mm:ss` con `role="timer"` y una región `aria-live` para los cambios de estado.
  - `Etiqueta` «Grabando» o «En pausa», y medidor de nivel.
  - Línea de estado: «Guardado en este dispositivo · Subido hasta 01:23:10».
  - Acciones:
    - Pausar / Reanudar.
    - Marcar ▾ (`MenuMas`): Nuevo tema, Votación, Compromiso, Nota….
    - **Terminar**, con `Modal` «¿Terminar la grabación?» y el texto «Llevas 3 h 12 min. Al terminar la
      enviamos a transcribir y te avisamos por correo cuando esté lista.», con los botones
      [Seguir grabando] [Terminar y procesar].
- **Avisos en línea:**
  - Silencio por más de 2 min: «No estamos captando sonido desde hace 2 minutos. Revisa el micrófono.».
  - Sin conexión: «Sin internet: seguimos grabando en este dispositivo y subimos al volver.».
  - Sin bloqueo de pantalla disponible: «Mantén la pantalla encendida.».
  - Espacio del dispositivo bajo.
- **Detalles técnicos:**
  - Re-adquirir `navigator.wakeLock` en `visibilitychange`.
  - `beforeunload` mientras graba.
  - Tipo MIME: `audio/webm;codecs=opus` (Chrome, Edge, Android), `audio/mp4` (Safari) o `audio/ogg;codecs=opus`.
  - `audioBitsPerSecond: 32000`.
  - `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`.

**`/dashboard/reuniones/[id]` — la reunión**

- `CabeceraPieza` con el título y el subtítulo «{copropiedad} · {tipo} · {fecha} · {duración}».
  - Acción primaria «Redactar acta», cuando la reunión está lista.
  - `MenuMas`: Descargar transcripción, Cambiar datos y Eliminar reunión… (este último con `Modal`).
- **Mientras procesa:** panel con los pasos y su `Estado`: Preparando el audio, Transcribiendo
  (23 de 48 tramos), Uniendo y verificando cobertura, Analizando con IA. Incluye `BarraProgreso` y
  «Puedes cerrar esta página: te avisamos por correo cuando esté lista.». En error: `Aviso` más «Reintentar».
- **`Segmentos`** (modo pestañas): Resumen · Transcripción · Hablantes · Acta · Preguntar.
  - **Resumen:**
    - `Kpis`: Duración, Participantes, Decisiones, Compromisos.
    - Estado ok «Cobertura 100 % · 8 h 12 min».
    - Panel «Resumen».
    - «Decisiones», con el minuto enlazado a la transcripción.
    - «Compromisos» (`Tabla`: compromiso, responsable, fecha, minuto).
    - «Votaciones» y «Temas tratados».
  - **Transcripción:**
    - Reproductor fijo: reproducir/pausar, −15 s / +15 s, velocidad 1× / 1,25× / 1,5× / 2×, posición y duración.
    - `Buscador` «Buscar en la transcripción».
    - Intervenciones (hora, nombre, texto) agrupadas por hora; clic en la hora para reproducir; resalta la
      intervención en curso.
    - Carga por bloques de 30 min, con marcadores y silencios intercalados («Sin voz entre 2:10:00 y 2:24:30»).
  - **Hablantes:** por cada etiqueta:
    - nombre: `Selector` con sugerencias de la ficha, personas de la copropiedad y «Otra persona…», que
      crea la persona;
    - rol, % de tiempo de palabra y botón «Escuchar», que reproduce la muestra de 6 s;
    - la sugerencia de la IA con su evidencia, por ejemplo «Le dicen “señora presidenta” a las 0:03:12».
    - Asignar el mismo nombre a dos etiquetas las fusiona. Termina con «Guardar nombres».
  - **Acta:**
    - Explicación más «Redactar acta».
    - Mientras se redacta: `ProgresoGeneracion` por secciones.
    - Al terminar: el acta con los minutos enlazados, «Descargar» (rutas actuales), «Abrir en Historial» y
      la lista «Pendientes de verificación», si la hay.
  - **Preguntar:**
    - `Redactor` con `MensajeUsuario` y `RespuestaAgente`; las horas citadas son enlaces.
    - Sugerencias (`BotonSugerencia`): «¿Qué se decidió sobre…?», «¿Qué compromisos quedaron y con qué
      fecha?» y «Resume la intervención del revisor fiscal».

**Otros**

- Suscripción y `UsageCard`: «Horas de reuniones este mes: 3,5 de 10».
- Inicio: acceso «Grabar una reunión» en «¿Qué quieres hacer?», solo si es visible.
- Generar, paso 4: «¿Tienes la grabación de la reunión? Súbela en Reuniones: la transcribimos completa
  y el acta sale de ahí.»

---

## 12. Cupos, costos, retención y privacidad

**Cupos.**

- En `PLANS.limits`: `meetingHoursPerMonth` de 10 (Pro), 40 (Business) y 120 (Élite).
- En `TRIAL_LIMITS`: `meetingHoursTotal: 2`.
- Las cuentas beta (`OPEN_TESTING`) no tienen tope, igual que en las generaciones.
- Se comprueba en `armar_audio`, cuando ya se conoce la duración. Si no alcanza, la reunión pasa a
  `sin_cupo` (el audio se conserva) con el mensaje «Esta reunión dura 8 h y te quedan 2 h este mes» y la
  acción «Ver planes».
- Se registra `UsageRecord` con `type: "reunion_audio"`, `tokens` = segundos y su costo; y con
  `type: "reunion_ia"`, `tokens` y costo.

**Costo estimado de una reunión de 8 h.** Precios a verificar.

| Concepto | Con Opus 5.5 | Con Sonnet 5.5 |
|---|---|---|
| Transcripción con hablantes: ~US$0,006/min × 480 min | ≈ US$2,9 | ≈ US$2,9 |
| Ficha: ~130 K tokens de entrada más la salida con pensamiento | ≈ US$1,3–1,6 | la mitad |
| Acta: caché precalentada más ~10 secciones | ≈ US$1,5 | ≈ US$0,8 |
| **Total** | **≈ US$6** | **≈ US$4,5** |
| Preguntar: primera pregunta | ≈ US$0,6 | ≈ US$0,3 |
| Preguntar: siguientes | unos centavos | unos centavos |

El modelo se cambia con `MEETINGS_MODEL` en Vercel, sin desplegar.

**Retención.**

- El cron diario borra a los **90 días** el original subido y la sesión ensamblada
  (`RETENCION_ORIGINAL_DIAS`); `audio.mp3` y la transcripción se conservan.
- Las partes en vivo se borran al ensamblar.
- Las partes huérfanas de más de 2 días se limpian.

**Privacidad.**

- Aviso de grabación con `consentAt`.
- Blob siempre privado; solo el dueño accede.
- Borrar la reunión borra todo.
- Nada de huellas de voz persistentes: las muestras de referencia se cortan del mismo audio y solo
  viven en la reunión.
- Los registros no incluyen texto de la transcripción.

---

## 13. Visibilidad y lanzamiento

- En `src/lib/feature-flags.ts`:
  - `export const REUNIONES_PARA: "admins" | "todos" = "admins";`
  - `puedeVerReuniones(user)`: devuelve verdadero en `DEMO_MODE`; si no, cuando `REUNIONES_PARA === "todos"`,
    o cuando `role === "admin"` o `isEnvAdmin(email)`.
- Lo usan el menú, las páginas (404 si no es visible) y la API.
- **Piloto:**
  1. Fusionar a `main` con `"admins"`, previa aprobación del usuario.
  2. El usuario prueba en producción, en este orden:
     - 10 min grabando en el celular;
     - 2 h subidas;
     - 8 h reales;
     - un WAV de más de 1 GB;
     - una grabación con recarga a mitad;
     - una grabación en modo avión 5 min.
  3. Seguir los registros con las herramientas de Vercel (`get_runtime_logs`).
  4. Corregir.
  5. Pasar a `"todos"` con aprobación.

---

## 14. Hitos

Cada hito termina con su verificación (regla 8), un commit y la actualización de la bitácora.

### M0 — Fundaciones
- `prisma/schema.prisma`: modelos de la sección 5, relaciones inversas y `Generation.meetingId`.
- `src/lib/ensure-meetings-schema.ts`.
- `src/lib/feature-flags.ts`: `REUNIONES_PARA` y `puedeVerReuniones`.
- `src/lib/meetings/tipos.ts`: tipos de reunión con sus etiquetas, estados con sus textos y sus
  `Estado`/`Etiqueta`, y constantes (`TRAMO_MS`, `SOLAPE_MS`, `BLOQUE_MS`, MP3 32 kbps…).
- `src/components/kit/modulos.ts`: módulo `reuniones` y regla «Grabar».
- `Sidebar.tsx` y el layout: entrada visible según la bandera.
- `src/lib/epayco.ts`: cupos.
- `src/lib/upload-limits.ts`: `TIPOS_REUNION`.
- `src/lib/demo-store.ts`: tres reuniones demo en `prop-demo-001`.
  - «Reunión de consejo — septiembre»: `lista`, 2 h 14 min, ~60 intervenciones, 4 hablantes con nombre,
    ficha con 4 temas, 3 decisiones, 4 compromisos y 1 votación.
  - «Reunión de consejo — octubre»: `procesando`, transcribiendo 12 de 24.
  - «Comité de convivencia»: `borrador`.
- **Acepta si:** `tsc`, `vitest` y `build` pasan, y en demo aparece «Reuniones» en el menú.

### M1 — Lista, creación y datos de la reunión
- API: `GET/POST /api/meetings`, `GET/PATCH/DELETE /api/meetings/[id]` y `people`.
- `src/lib/meetings/acceso.ts`: `reunionDelUsuario(id)` y `exigirVisible()`.
- Páginas: lista, `nueva` y el esqueleto de `[id]` con las pestañas y los datos demo.
- **Acepta si:** capturas en demo (claro, oscuro y 390 px), contraste en 0 y barrido limpio, con las
  rutas nuevas agregadas a `scripts/contraste.mjs` y al barrido.

### M2 — Subida reanudable de archivos grandes
- `upload-token` y `sources`.
- `src/lib/meetings/subida-reanudable.ts` (cliente):
  - `planificarPartes(tamano, 16 MB)` y `huella(file)` (nombre, tamaño, `lastModified` y SHA-256 del
    primer y el último MB);
  - estado en IndexedDB, concurrencia 3, reintentos con espera creciente, pausa y reanudación, y
    progreso con MB/s y tiempo restante;
  - si la subida expiró, reinicia con el mensaje «La subida anterior caducó; empezamos de nuevo».
- `src/components/reuniones/SubidaReunion.tsx` y su integración en `nueva`.
- Demo: progreso simulado.
- Pruebas de `planificarPartes` y de la huella.
- **Acepta si:** pruebas en verde y capturas en demo del flujo.

### M3 — Grabadora a prueba de cortes
- `src/lib/meetings/grabadora.ts` (MediaRecorder, IndexedDB, envío de partes, wake lock, nivel,
  silencio, pausa y marcadores) y `src/lib/meetings/almacen-navegador.ts` (IndexedDB).
- `live`, `markers` y `process`.
- Página `grabar` y sus componentes en `src/components/reuniones/`.
- Pruebas de `ordenarPartes` y `detectarHuecos(session, seqs)`.
- **Prueba automática en demo:** Chromium con `--use-fake-ui-for-media-stream
  --use-fake-device-for-media-stream`. Graba 20 s, recarga a mitad (aparece «Continuar» y se abre la
  sesión 2), termina y verifica que se enviaron las partes en orden.
- **Acepta si:** la prueba pasa y hay capturas de antes de empezar, grabando, en pausa, sin conexión y
  el modal de terminar.

### M4 — Cola, trabajador y audio
- `cola.ts`, `trabajador.ts`, `orquestador.ts`, `almacen.ts` y `audio.ts`.
- Tareas `ensamblar_sesion`, `normalizar` y `armar_audio`.
- `GET /api/cron/process-meetings` y `vercel.json`.
- Pruebas unitarias de la cola: reclamo atómico simulado, espera creciente y vigilante.
- Prueba de integración de audio (sección 7).
- **Acepta si:** la integración con 25 min sintéticos da 3 segmentos, un `audio.mp3` de 25 min ± 1 s y
  se reanuda.

### M5 — Transcripción completa con hablantes
- `transcripcion/*`: OpenAI, demo, tramos, hablantes y unir.
- Tareas `transcribir_tramo`, `voces` y `unir`.
- Rutas `utterances` y `transcript`.
- Pruebas con tramos sintéticos solapados:
  - frases que cruzan el borde salen una vez y completas;
  - reconciliación A↔V1 y aparición de H5;
  - cobertura de 1,0;
  - silencios detectados;
  - formato `[hh:mm:ss]`.
- **Acepta si:** todas las pruebas pasan y el visor de transcripción funciona en demo.

### M6 — Ficha, hablantes, correo, cupos y costos
- `ia.ts`, con la skill `claude-api` invocada antes. `ficha.ts`.
- Tareas `analizar_bloque` y `ficha`.
- Ruta `speakers`.
- `sendMeetingReadyEmail` en `email.ts`.
- `src/lib/meetings/cupos.ts`. Registro de uso y costo.
- Pruebas:
  - `planificarBloques`;
  - validación de la salida;
  - consolidación con un modelo simulado;
  - cálculo de cupos;
  - la reunión pasa a `lista` con un proveedor simulado.
- **Acepta si:** pruebas en verde y capturas de Hablantes en demo.

### M7 — Página de la reunión completa
- Rutas `audio` (Range) y `status`.
- Pestañas Resumen, Transcripción (reproductor, búsqueda y saltos) y Hablantes, y la vista de procesamiento.
- **Acepta si:** capturas, uso por teclado (tabulación y espacio para reproducir), contraste en 0 y
  barrido limpio.

### M8 — Acta y Preguntar
- `acta.ts` y su ruta.
- Tareas `acta:<gen>:s<k>` y `acta:<gen>:final`.
- Guardado en `Generation`: reutiliza el renderizado de `run.ts`. Si extraes un helper, sin cambiar el
  comportamiento actual, y con sus pruebas.
- Ruta `preguntar` (SSE) y su interfaz.
- Pruebas: marcadores, quitar marcadores, verificar `D*` y `C*`, y ensamblado.
- **Acepta si:** el acta demo se ve con los minutos enlazados y aparece en Historial (demo).

### M9 — Cupos visibles, retención, auditorías y piloto
- Horas en Suscripción y `UsageCard`. Accesos en Inicio y Generar.
- `GET /api/cron/cleanup-meetings` y `vercel.json`.
- Contraste y barrido con todas las páginas nuevas. `next build`.
- Push. Luego **preguntar al usuario** antes de abrir el PR y fusionar con `"admins"`.
- Pruebas del piloto (sección 13) y correcciones.
- Pasar a `"todos"` con aprobación.

### M10 — (opcional) AssemblyAI y comparación
- `assemblyai.ts`, tras verificar su documentación oficial.
- Ruta solo para admins: «Volver a transcribir con…», que guarda el resultado aparte para comparar
  precisión y hablantes en las mismas grabaciones.
- Decidir el proveedor por defecto con el usuario.

---

## 15. Pruebas (resumen)

- **Unitarias (`src/lib/**/*.test.ts`):**
  - Subida: `planificarPartes`, `huella`.
  - Grabadora: `ordenarPartes`, `detectarHuecos`.
  - Audio y tramos: `duracionMp3Cbr`, `rangoDeBytes`, `planificarTramos`, `asignarANucleo`.
  - Hablantes y unión: `reconciliar`, `unirTramos`, `fusionarContiguos`, `calcularCobertura`,
    `formatearTranscripcion`.
  - IA: `planificarBloques`, validación de la ficha.
  - Acta: `verificarMarcadoresActa`, `quitarMarcadores`.
  - Cupos y cola: cálculo de cupos, cola (reclamo y espera).
- **Integración local:** audio con `ffmpeg` y un servidor HTTP con `Range` y `Authorization`; grabadora
  con Chromium y un micrófono simulado.
- **Interfaz:** capturas en demo, `scripts/contraste.mjs` (oscuro y claro en 0) y barrido de desbordes
  de 360 a 1440 px.
- **Piloto en producción** (sección 13).

---

## 16. Riesgos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| Límites de las funciones de Vercel (tiempo, memoria, `/tmp`) | Tareas de menos de 230 s; normalización reanudable; flujos sin descargar archivos enteros |
| La subida por partes caduca a mitad | Detección y reinicio con mensaje; tamaño de parte de 16 MB |
| iPhone pausa la grabación con la pantalla bloqueada | Bloqueo de pantalla (wake lock), aviso claro y reanudación; app nativa en la Fase 3 |
| Etiquetas de hablante que se multiplican con tramos | Voces de referencia (≤4), conciliación por solape, sugerencias de la IA y fusión en la interfaz; AssemblyAI en el hito 10 |
| `db push` compartido entre la vista previa y producción | Solo cambios aditivos más `ensureMeetingsSchema` |
| `ffmpeg` de 2018 con HTTPS y cabeceras | Prueba de integración; plan B: ruta proxy con token HMAC |
| Costo | Cupos en horas, costo por reunión registrado, modelo cambiable por variable |
| Caché en llamadas paralelas | Precalentar antes de las secciones; verificar `cache_read_input_tokens` |
| Privacidad | Aviso, Blob privado, retención, borrado total y registros sin contenido |

---

## 17. Fases 2 y 3 (se planifican al cerrar la Fase 1)

**Fase 2 — el «Project» de cada copropiedad**

- Chats por propiedad: `AgentChat.propertyId` (aditivo).
- Memoria viva por propiedad (`PropertyMemory`) e instrucciones.
- Búsqueda híbrida en Postgres (Neon): `tsvector` en español más `pgvector` sobre las intervenciones y
  el texto de `PropertyDocument`.
- Herramientas de los agentes: `buscar_en_reuniones`, `leer_fragmento`, `ficha_reunion` y
  `buscar_documentos`, con citas.
- Los agentes usan un modelo de 1M de contexto cuando trabajan con reuniones.
- Compromisos como tabla, con Bitácora e Inicio.
- «Desde una reunión» en Generar.

**Fase 3**

- Transcripción en vivo.
- Reconocimiento de voces con consentimiento expreso.
- Importar de Zoom, Meet y Teams.
- App nativa para grabar con el iPhone bloqueado.
- Acceso del consejo a actas y reuniones.

---

## 18. Qué necesitamos del usuario

- **Para empezar: nada.** La clave de OpenAI y la de Anthropic ya están en producción.
- **Para el piloto:**
  - que su cuenta tenga rol admin;
  - grabaciones reales (idealmente una de 6–8 h, con permiso de los asistentes);
  - confirmar el modelo de las actas: Opus 5.5 por defecto, o Sonnet 5.5 a la mitad del costo de IA.
- **Opcional (hito 10):** una cuenta de AssemblyAI con la clave en Vercel.

---

## Bitácora de avance

**Verificado al diseñar (1 de octubre de 2026)** con el `ffmpeg` del proyecto (N-47683, 2018):

- 25 min sintéticos con el comando de la sección 7 dan 3 segmentos (2.400.048 + 2.400.048 + 1.200.240 bytes).
- Concatenados suman 6.000.336 bytes = 41.669 tramas de 144 bytes. Todas empiezan con `FF F3` y duran 1500,08 s.
- Un recorte por bytes de 9:30 a 20:30 se decodifica sin errores y dura 11:00,02.
- Pendiente de verificar en M4: la lectura con `-headers` desde Blob privado por HTTPS.

**Notas de M0 (desviaciones y decisiones al construir):**

- **Nombres.** Los tipos de reunión son `TIPOS_DE_REUNION` (`src/lib/meetings/tipos.ts`). La lista de tipos
  MIME aceptados para subir es `TIPOS_ARCHIVO_REUNION` (`upload-limits.ts`); donde este plan dice
  `TIPOS_REUNION` para la subida (§10, §14), léase `TIPOS_ARCHIVO_REUNION`.
- **Visibilidad.** `puedeVerReuniones` es pura (`feature-flags.ts`) y se apoya en `reunionesVisibles(modo, usuario)`.
  El menú (cliente) solo ve el rol de la sesión; los admins de `ADMIN_EMAILS` entran con rol admin porque el
  login los promueve. En servidor (`acceso.ts`, M1) se suma `adminDeEntorno: isEnvAdmin(email)`. El layout no
  pasa ninguna bandera: `Sidebar.tsx` la calcula con `useSession()`.
- **`iconoDeAccion`** ya tenía `/^(grabar)/ → Mic`; no hizo falta tocarlo. «Empezar a grabar» cae en la regla
  `empezar → Play`, así que el botón de la grabadora (M3) debe fijar `icono={Mic}` a mano.
- **Demo.** En vez de 3 reuniones son 5 (`src/lib/meetings/demo.ts`): lista, procesando 12 de 24, borrador,
  error en un tramo y sin horas. La de septiembre tiene 5 temas en el orden del día, 3 decisiones, **6**
  compromisos, 1 votación, 5 voces (4 confirmadas y H5 como sugerencia) y un receso de 10 min.
  El almacén vive en `globalThis` (las rutas dev se compilan en paquetes separados).
- **Tipos compartidos** en `src/lib/meetings/dto.ts` (`ReunionResumen`, `ReunionDetalle`, `Ficha`, …).
- **`formatoTamano`** ahora pasa a GB desde 1000 MB (un WAV de 8 h pesa ~5,5 GB).
- **Prueba de sincronía** `ensure-meetings-schema.test.ts`: lee `schema.prisma` y exige que el SQL de
  `ensureMeetingsSchema` tenga las mismas columnas, tipos, defaults, índices y claves foráneas. Si cambias
  un modelo de Reuniones, esa prueba te dice qué falta en el SQL.
- **Trampa del entorno:** si `tsc` falla con errores en `.next/dev/types/validator.ts`, el archivo quedó
  corrupto por un reinicio del servidor a mitad de escritura. Se borra y se reinicia el servidor (se regenera).
  Un `ClientFetchError` de next-auth en los scripts de Playwright suele ser una navegación que aborta el
  `fetch` de sesión en curso, no un error de la app.

**Notas de M1 (desviaciones y decisiones al construir):**

- **La subida vive en la reunión, no en «nueva».** `nueva` solo crea el borrador (copropiedad, tipo, título, fecha) y
  lleva a `/dashboard/reuniones/[id]?modo=grabar|subir`. Ahí, para un borrador, M2 monta la zona de subida y M3 el
  acceso a la grabadora. Así hay un solo lugar donde se agregan archivos (también para «Continuar» desde la lista y
  para reintentar tras un error). Donde §11 pone la `ZonaSubida` en `nueva`, léase en la página de la reunión.
- **Columna nueva `Meeting.silences`** (Json, aditiva): los tramos «Sin voz entre …» se calculan en `unir` (M5) y se
  guardan; no se derivan al leer (8 h son miles de intervenciones). `ensureMeetingsSchema` y su prueba de
  sincronía ya la incluyen.
- **Puerta de acceso única** (`src/lib/meetings/acceso.ts`): toda ruta empieza por `exigirVisible()` (401 sin sesión,
  404 —no 403— si la bandera no deja ver Reuniones). Las páginas usan `sesionVeReuniones()` + `notFound()`.
  `rutas.test.ts` recorre TODAS las rutas y exige 401/404 sin tocar la base de datos: **cada ruta nueva se agrega a
  la tabla `TODAS` de ese archivo**.
- **El demo permite crear, editar y borrar** (en memoria, con tope de 30 reuniones y 60 personas) en vez de ser solo
  lectura, para poder recorrer el flujo en local.
- **Las URLs de Blob nunca salen al navegador** (`mapeo.ts`): el detalle solo dice `hasAudio`. Hay una prueba que lo
  garantiza; mantenerla al agregar campos.
- **Borrar una reunión** borra primero los archivos (prefijo `meetings/<id>/`, con salvaguarda contra prefijos
  vacíos o ajenos) y después las filas; si los archivos no se pueden borrar responde 502 y conserva la reunión.
  Las actas ya redactadas pierden el vínculo (`Generation.meetingId = null`) pero no se borran.
- **CSS global:** `.k-pieza-h` recortaba (`overflow: hidden`) cualquier menú desplegable dentro de la cabecera de
  pantalla; ahora no recorta en «Calma» ni en «Guía» cuando contiene un `.k-menu`.
- **Copropiedad en la lista:** va como segunda línea de «Reunión» (en vez de una columna aparte) y solo si hay más
  de una copropiedad y el filtro es «Todas».
- **Auditoría de interfaz** (`scripts/contraste.mjs`) ya incluye las siete pantallas de Reuniones del demo.

**Notas de M2 (desviaciones y decisiones al construir):**

- **Flujo de la persona.** Los archivos elegidos esperan en una lista («Por subir») que se puede ordenar con flechas
  y a la que se le quitan archivos; «Subir y transcribir» los sube **de uno en uno, en el orden de la lista** (el
  orden de la reunión es el de subida) y al terminar los envía solos a procesar. Archivos sueltos de una misma
  selección se ordenan por nombre de forma natural («parte 2» antes que «parte 10»). Ya no hay endpoint de
  reordenar: una vez subido, un archivo se puede quitar (con confirmación) pero no mover.
- **El envío automático se frena** si queda algo sin resolver: un archivo con error, archivos «por subir» o una
  subida **interrumpida** de una visita anterior (transcribir sin una parte de la grabación es peor que esperar).
  En esos casos hay un aviso y, cuando todo está resuelto, un botón «Transcribir la reunión».
- **Rutas del servidor.** `upload-token` emite un token para UNA ruta, con el tipo declarado y 24 h de vigencia
  (`allowOverwrite: true` para poder completar de nuevo tras un corte); `sources` comprueba con `head()` que el
  archivo existe y toma su tamaño **del almacenamiento**, es idempotente por ruta y nunca devuelve la URL privada;
  `sources/[sourceId]` borra el original y renumera; `process` es idempotente. El cliente solo puede mandar una
  ruta al reanudar, y solo con la forma exacta `meetings/<id>/fuentes/<8>-<nombre>` (`esRutaDeFuente`).
  `proceso.ts` (`iniciarProcesamiento`) hoy solo deja la reunión «en cola»; **M4 lo completa** (encolar tareas).
- **Motor** (`subida-reanudable.ts`, sin navegador ni red: todo entra por parámetros). Partes de 16 MB (más
  grandes si no cupieran en 10.000), 3 a la vez; estado guardado tras cada parte en IndexedDB (con respaldo en
  memoria) bajo `meetingId:huella` (nombre, tamaño, fecha y SHA-256 del primer y último MB). Errores clasificados
  por el **texto** del SDK (en inglés; los nombres de clase se pierden al minificar): permiso vencido → se
  renueva sin gastar intentos; subida caducada o archivo que no llegó completo → se empieza de cero (máx. 2
  veces) avisando; fallo pasajero → 1-2-4-8-16-30 s (6 intentos); rechazo definitivo → se muestra tal cual.
  Pausar corta lo que va en vuelo y no gasta intentos; sin conexión espera sin gastarlos.
- **Defectos reales que destapó la batería de pruebas** (los tres arreglados): con varios trabajadores en pausa,
  `reanudar()` solo despertaba a uno; pausar y reanudar al instante trataba el aborto propio como un fallo; una
  subida nueva pedía el token dos veces.
- **Gestor** (`gestor-subidas.ts`) y registro por reunión (`useSubidas.ts`): la subida **no se interrumpe** si la
  persona navega a otra pantalla de la app y vuelve. Mientras sube se pide el bloqueo de pantalla (Wake Lock).
- **Demo.** Token y registro van al servidor real (en memoria); solo Blob es simulado (16 MB/s por parte).
  Perilla solo-demo: `localStorage["soph-demo-subida-mbps"]` cambia esa velocidad (la usa el E2E).
- **Estado «Subiendo».** El servidor lo pone al entregar el primer token; si la persona abandona a medias queda
  «Subiendo» (verdad: hay una subida sin terminar). **M9 debe** devolver a `borrador` las reuniones `subiendo`
  sin archivos y sin actividad desde hace 48 h, y limpiar los blobs de `meetings/<id>/fuentes/` que no estén en
  ninguna fila de `MeetingSource` (subidas completas que nunca se registraron).
- **Accesibilidad.** La línea de avance NO es una región viva (se anunciaría 4 veces por segundo): hay una región
  oculta que solo anuncia los cambios gordos («Subiendo archivos», «Subida en pausa», «Enviando a transcribir»).
- **Pruebas:** motor (47), API de Blob y clasificación de errores (21), gestor (38), rutas con base de datos falsa
  (`db-falsa.ts`, 25) y el recorrido completo en el navegador contra el demo (`subida-e2e.mjs`, fuera del repo:
  elegir, rechazo, orden, subida, pausa, **recarga a mitad y reanudación**, envío automático y quitar archivo).

**Notas de M3 (desviaciones y decisiones al construir):**

- **Flujo.** «Grabar reunión» crea el borrador y lleva directo a `/dashboard/reuniones/[id]/grabar` (la antigua
  `?modo=grabar` de la reunión redirige ahí; el aviso provisional «La grabadora llega…» desapareció y `modo` ya no se
  pasa a `DetalleReunion` ni a `SubidaReunion`). Un borrador ofrece «Grabar la reunión» en su cabecera. Una reunión
  `grabando` muestra «Hay una grabación sin terminar» con lo que ya llegó al servidor, «Continuar en la grabadora» y
  «Terminar y procesar lo recibido» (para cuando el dispositivo se perdió).
- **El motor** (`grabadora.ts`, lógica pura: micrófono, almacén local, API, reloj y red entran por parámetros)
  guarda cada trozo de 5 s en el dispositivo **antes** de pensar en el servidor; sube **partes de 30 s** (6 trozos,
  numeradas por posición: parte k = trozos 6k…6k+5, así se reconstruyen idénticas tras un cierre brusco), en orden,
  con reintentos sin límite (1-2-4-8-16-30 s) y sin gastar intentos mientras no hay red. Una **sesión** es una pasada
  del grabador (concatenar sus trozos da un archivo válido); «Continuar» abre otra. Un cierre brusco se rescata en la
  siguiente visita: lo guardado se sube solo y la sesión nueva sigue la numeración y la línea de tiempo (las marcas
  suman lo ya grabado). Terminar sube lo pendiente, declara la última parte de cada sesión y, si el servidor dice que
  faltan (409), las vuelve a subir desde el dispositivo (máx. 3 vueltas; los fallos de red no cuentan).
- **Defectos reales que destapó la batería de pruebas** (arreglados y cubiertos): el bucle de envío que termina sin
  esperar nada (hay un rechazo pendiente) quedaba registrado como «en marcha» para siempre; `atMs` y duraciones
  llevaban decimales (`performance.now()`) y el servidor, que exige enteros, **descartaba las marcas** — lo vio el
  recorrido en el navegador, no las pruebas unitarias, por eso hay una prueba con reloj fraccionario (y se comprobó
  que falla sin el redondeo).
- **Suposición central, verificada con Chromium + ffmpeg:** las partes de una sesión, **unidas en orden**, forman un
  archivo que `ffmpeg` decodifica sin errores (70 s grabados → 70,4 s; 3 partes de 116, 124 y 41 KB, ≈ 4 KB/s); una
  parte suelta que no es la primera **no** se abre sola. **M4 debe ensamblar por sesión, en orden de `seq`**, antes de
  normalizar. No pudimos probar Safari/iOS aquí (graba MP4 fragmentado; mismo principio, sin verificar).
- **Servidor.** `POST …/live/sesion` reserva el número de sesión con una fila de `MeetingLivePart` con **`seq = -1`**
  (la clave única evita que dos dispositivos que empiezan a la vez obtengan el mismo número) y devuelve también dónde
  empieza la sesión dentro de la reunión. **Toda consulta de audio filtra `seq >= 0`** (M4 incluido). `POST …/live`
  recibe la parte (cuerpo binario ≤ 2 MB leído con tope, aunque falte `Content-Length`), es idempotente por
  (sesión, parte) —ruta fija `meetings/<id>/vivo/<sesión>/<seq>.<ext>`, `allowOverwrite`— y pone la reunión en
  «grabando». `POST …/markers` es idempotente por el identificador que pone el dispositivo (se ata a la reunión).
  `POST …/process` acepta `{ sesiones }`: comprueba que no falte ninguna parte (409 `{ faltan }`), crea una fuente
  `kind = grabacion` por sesión y deja la reunión «en cola»; las sesiones con audio que nadie declaró (dispositivo
  perdido) se cierran con lo recibido. Es idempotente (repetirlo tras perder la respuesta no duplica fuentes).
- **La constancia del aviso se exige en el servidor** (`consentAt`; 409 «Antes de grabar, confirma que avisaste a
  los asistentes») al reservar sesión y al recibir cada parte, no solo en la casilla. Si la constancia no pudo
  guardarse al empezar (sin conexión), la pantalla la guarda cuando el servidor la pide y reintenta los envíos.
- **`puedeAgregarFuentes` ahora incluye «grabando»**: se puede subir un archivo y grabar el resto, y cerrar todo junto.
- **Almacén local** (`almacen-navegador.ts`, IndexedDB v2): `grab-sesiones`, `grab-trozos` (clave compuesta
  reunión-sesión-posición: leer un rango es leer en orden) y `grab-marcas`; escritura con durabilidad «strict»; se
  reabre la conexión si el navegador la cierra (Safari lo hace al pasar a segundo plano); sin IndexedDB cae a memoria y
  la pantalla lo avisa («si cierras la pestaña perderás lo que no haya subido»).
- **Una sola pestaña por reunión** (Web Locks): una segunda pestaña ve «Esta reunión ya está abierta en otra pestaña»
  en vez de pisar lo guardado. **La grabación no se corta si la persona navega a otra pantalla de la app**: el motor
  vive en un registro de la pestaña y al volver la pantalla se reconecta; la lista lo dice («Estás grabando esta
  reunión»). *Pendiente (M9):* un indicador global de «grabando» fuera de estas pantallas.
- **Navegador.** Condiciones de audio y tipo MIME como en §11; reloj de medir con `performance.now()` (no salta ni
  cuenta el equipo dormido); medidor con caída suave (el micrófono falso de Chromium solo «pita» 20 ms por segundo);
  un nivel que no se puede medir (el analizador no arrancó) **no** cuenta como silencio. El micrófono se abre antes de
  esperar al servidor (el permiso exige el toque reciente de la persona). Wake Lock con reintento al volver a la
  pestaña, `beforeunload` mientras se graba, espacio bajo (< 300 MB) y `storage.persist()`.
- **Texto pendiente de M6:** el modal de terminar dice «Puedes cerrar esta página: el trabajo sigue en nuestros
  servidores». La frase del plan «te avisamos por correo cuando esté lista» se agrega cuando exista el correo (M6).
- **Pruebas:** motor 48, cliente de la API 15, micrófono/candado/espacio 34, cierre 15, cuerpo acotado 6, rutas con
  base falsa 27, validadores y demo en `rutas.test.ts`/`validar.test.ts`. Recorridos en el navegador contra el demo
  (fuera del repo, micrófono falso de Chromium): grabar, probar el micrófono, marcas, pausa, **sin internet**,
  **recargar a mitad → «Continuar» abre la sesión 2**, terminar y verificar en el servidor (dos fuentes, marcas,
  partes contiguas y en orden); una grabación de 80 s con **60 s sin internet** (las partes 0 y 1 suben juntas, en
  orden, al volver); dos pestañas; navegación dentro de la app; y la comprobación con ffmpeg. Auditoría de contraste y
  desbordes limpia en oscuro/claro × 1440/390 (`reunion-grabar` ya está en `scripts/contraste.mjs`).

**Notas de M4 (desviaciones y decisiones al construir):**

- **ffmpeg lee de un servidor HTTP local, no de Blob (el «plan B» del §7 pasa a ser el plan).** `servirFuente`
  (`ffmpeg.ts`) levanta un servidor en `127.0.0.1` (puerto libre y ruta al azar) que responde `Range` leyendo del
  almacén, y ffmpeg lo trata como cualquier URL: salta con `-ss`, relee con rangos y, si se corta, `-reconnect` vuelve
  a pedir desde donde iba (`-rw_timeout` 30 s). Motivos: el ffmpeg estático (2018) usa gnutls y su raíz de
  certificados puede no existir en Vercel; un `-headers` con el token se vería en la lista de procesos; y así TODO se
  prueba aquí (con una carpeta como almacén) en vez de confiar a ciegas en producción. Un `moov` al final (m4a de
  iPhone) se lee por rangos: la prueba lo comprueba.
- **`Almacen`** (`almacen.ts`): `subir`, `subirFlujo` (multipart en el servidor, sin pasar el archivo a memoria),
  `leer(url, { rango })` → `{ flujo, desde, hasta, total }`, `tamano`, `listar`, `borrar`. `AlmacenBlob` lee **sin caché**
  (`useCache: false`: lo que se lee acaba de escribirse o se sobrescribe en los reintentos), toma el rango real del
  `content-range` y, si el servicio lo ignorara, recorta del lado nuestro y avisa. Clasifica los errores del SDK (en
  inglés) en no_encontrado / transitorio / fatal. `AlmacenLocal` es una carpeta (pruebas).
- **Normalizar**, en segmentos de 10 min con la lista por stdout (`-segment_list pipe:1 -segment_list_type csv`, que el
  binario de 2018 sí soporta): cada segmento se sube y se anota **apenas termina**. Si se acaba el tiempo se manda
  SIGINT: ffmpeg cierra el segmento en curso (queda más corto pero completo y válido) y la tarea responde «continuar»;
  la pasada siguiente sigue con `-ss normalizedMs` y `-segment_start_number`. Cada reanudación reinicia el codificador
  (≈1 trama de ajuste): en 25 min con una reanudación la suma queda a < 1,5 s del original. Una pasada que no avanza
  nada cuenta como fallo (no se «continúa» en vano). La duración total se estima con la del contenedor o, si no la
  trae (WebM de MediaRecorder), con la fracción del archivo leída.
- **Cola** (`cola.ts`): reclamo atómico con `updateMany` condicionado; espera 30 s / 2 min / 10 min; al agotar
  intentos la reunión pasa a «error» con un mensaje que nombra el paso («No pudimos preparar el audio de «x.m4a»
  después de 3 intentos…») y **sus tareas pendientes se congelan** (`runAfter` lejano) hasta «Reintentar», que las
  descongela. «Continuar» no gasta intento; el vigilante rescata las que llevan 10 min sin latido. El trabajador **solo
  reclama los tipos que conoce** (una versión nueva atenderá los suyos), no empieza tareas con < 120 s de margen y
  pasa «en cola» → «procesando» al empezar la primera tarea.
- **Orquestador** (`orquestador.ts`): `planificarSiguientes` es pura; encola con claves fijas
  (`ensamblar_sesion:<id>`, `normalizar:<id>`, `armar_audio`), de modo que llamar `avanzar` de más o desde varias
  tareas a la vez no duplica nada. El avance de «Preparando el audio» es 92 % las fuentes y 8 % `audio.mp3`, nunca
  retrocede, y se actualiza **a cada segmento**. Con el audio armado la etapa pasa a «transcribiendo» (M5 continúa).
- **`armar_audio`** une los segmentos, fija `offsetMs` de cada fuente y la duración, y verifica **cada unión** (lee 2
  bytes y exige `FF F3`: un ID3 o Xing en medio se detecta aquí, no al reproducir). *Pendiente M6:* aquí va la
  comprobación de cupo (`sin_cupo`).
- **Rutas:** `GET /api/cron/process-meetings` (Bearer `CRON_SECRET`, 401 sin él; en `vercel.json`);
  `GET …/status` (liviano; **empuja** el trabajo con `after()` si hay tareas listas y nadie las atiende, o quien las
  atendía lleva > 45 s sin avisar); `POST …/retry`; y `POST …/process` ahora encola y empuja. Todas con
  `maxDuration = 300`. La página consulta `status` cada 4 s mientras procesa (y recarga la reunión al terminar).
- **Verificado en el build:** el rastreo de archivos de Vercel incluye `@ffmpeg-installer/linux-x64/ffmpeg` en las
  cuatro rutas que ejecutan trabajo. **No se puede probar aquí** (hacerlo en la primera vista previa con una
  grabación real): que Vercel permita el servidor en loopback y lance ffmpeg con la memoria/CPU de la función, y cuánto
  audio normaliza por pasada (el diseño tolera que sean pocas: continúa por cron).
- **Demo:** simula el procesamiento con el tiempo (2 s en cola, 8 s «Preparando el audio» con barra que avanza) y luego
  espera en «Transcribiendo»; M5 extiende la simulación hasta «lista». «Reintentar» también funciona.
- **Pruebas:** cola 28, orquestador 18, trabajador 14, manejadores 23, audio y ffmpeg (puras) ~30, almacenes 24, rutas
  de proceso 17, empujón 4, y dos integraciones con el **ffmpeg real** (se saltan si no está): audio (25 min sintéticos
  en m4a → 3 segmentos de tramas completas, `audio.mp3` de 25 min ± 1 s con **cada** trama `FF F3`, recorte por rango
  sin ffmpeg, reanudación, varias fuentes, archivo dañado/mudo, cancelación; ~45 s) y proceso (archivo + sesión de la
  grabadora con partes WebM cortadas en bytes arbitrarios, de punta a punta, reanudación y errores; ~20 s).
- **El `db-falsa.ts` ahora se parece más a Prisma** (devuelve copias, respeta `select`, valores por omisión, fechas por
  valor, `increment`, `take`): destapó dos pruebas mal escritas, ningún defecto del código.

**Notas de M5 (desviaciones y decisiones al construir):**

- **Los tramos se cosen en un punto de corte, no en el punto medio del borde (cambia el §8).** La regla del plan («cada
  frase es del tramo cuyo núcleo contiene su punto medio») pierde o repite palabras cuando los dos tramos *parten
  distinto* la misma frase del borde: uno se queda con una mitad y el otro con la otra mitad de lo que el primero partió.
  Lo medimos con el proveedor sintético: ~10 palabras perdidas cada 50 min. Ahora `puntoDeCorte` (`tramos.ts`) busca,
  dentro del solape y sin los últimos 5 s del audio de cada tramo, el instante más cercano al borde donde **ninguna
  intervención de ninguno de los dos tramos lo atraviesa** (tolerancia 150 ms): lo anterior es del primer tramo y lo
  posterior del segundo, y ninguna frase queda a caballo. Si alguien habla sin parar los 50 s (no hay instante limpio) se
  usa el borde y `eliminarRepetidosDeBorde` quita lo que quede repetido (tiempo en común y ≥ 80 % de las palabras dentro
  de la otra intervención; dos personas hablando a la vez no se tocan). Probado con 8 reuniones sintéticas, con y sin
  frases partidas distinto en cada tramo: **el texto, los minutos y las etiquetas salen exactamente iguales al guion**
  (y las pruebas fallan si se cambia la regla: se comprobó). `asignarANucleo` sigue siendo la regla de reparto, pero
  entre cortes elegidos.
- **Voces de referencia.** `elegirVoces` mira el tramo 0: hasta 4 etiquetas con ≥ 60 s de habla, de la que más habla a la
  que menos (V1…V4), cada una con un trozo limpio de 4–8 s (una sola voz, sin otra a menos de 300 ms; si no hay, uno de
  ≥ 2,5 s). Se guardan en `Meeting.speakerRefs` como `{ nombre, etiquetaLocal, desdeMs, hastaMs }` (un poco más que lo
  del plan: hace falta saber qué etiqueta local fue cada una). Las muestras se cortan del `audio.mp3` y se mandan como
  MP3 en data URL (el servicio acepta «cualquiera de los formatos del archivo»: no hizo falta convertir a WAV). **Si el
  servicio rechaza las muestras** (400/413/415/422) el tramo se transcribe otra vez *sin ellas* en vez de dejar la
  reunión en error: la unión empareja por el solape y, en el peor caso, una voz recibe otra etiqueta.
- **Reconciliación** (`hablantes.ts`): lo que el proveedor llama V1…V4 ya es global y **no se ofrece a ninguna otra
  etiqueta** del mismo tramo; el resto se empareja con el tramo anterior por el tiempo en que hablaron a la vez en el
  solape (≥ 1,5 s, de mayor a menor, uno a uno); lo que no empareja recibe `H5`, `H6`… (V1…V4 quedan reservadas). **Límite
  conocido:** quien no habla en el solape de dos tramos recibe una etiqueta nueva (se fragmenta, no se mezcla): el
  usuario lo arregla fusionando en «Hablantes» (M6). Probado: una etiqueta nunca mezcla a dos personas.
- **Tiempos exactos.** El audio se corta por tramas de 36 ms, así que lo que se transcribe empieza en la trama que contiene
  el inicio pedido (hasta 35 ms antes). El resultado del tramo guarda **ese** inicio, y los tiempos del proveedor (relativos
  a él) quedan exactos al milisegundo. La prueba con el ffmpeg real comprueba que los tramos y las muestras que se mandan
  son MP3 decodificables de la duración pedida.
- **Tareas y orden.** `tramo:0` → `voces` → `tramo:1…N-1` (se encolan solo cuando `voces` termina, porque llevan sus
  muestras) → `unir`. El payload de cada tramo trae su plan (audio y núcleo) y el total; su `result` es autocontenido
  (tramo, segmentos, costo, proveedor), así `unir` no depende de cómo se planifique después. `transcribir_tramo`: tiempo
  de la llamada = mín(150 s, presupuesto − 30 s), **sin reintentos del SDK** (los hace la cola: 30 s / 2 min / 10 min),
  un recorte de menos de 1 s se omite. Fallos que reintentar no arregla (clave, cuenta sin saldo, modelo, audio rechazado)
  dejan la reunión en «error» al primer intento, con el motivo en español; los del momento (red, saturación, 5xx) se
  reintentan. `unir` exige cobertura 1,0; es idempotente (reemplaza las intervenciones en lotes de 1.000, conserva los
  nombres que ya tengan los hablantes, sube `transcripcion.txt`, anota cobertura, silencios, proveedor y costo).
  El mensaje de error nombra el tramo: «No pudimos transcribir el tramo 2:10:00–2:20:00 después de 3 intentos…».
- **Hasta M6, `unir` deja la reunión «lista»** (`PlanDeProceso.lista`): M6 inserta «Analizando con IA» entre medias.
  `Meeting.speakerRefs`, `coverage`, `silences`, `transcriptUrl`, `provider` y `costUsd` ya se llenan. El avance de
  «Transcribiendo» son los tramos hechos de **todos** los tramos (no solo los ya encolados): «23 de 48».
- **Silencios:** huecos de ≥ 2 min sin voz, con el del principio y el final de la grabación; un tramo en silencio cuenta
  como cubierto y se ve como «Sin voz entre 2:10:00 y 2:24:30».
- **Rutas** (con rama demo y en la tabla de la bandera): `GET …/utterances?desde=&hasta=&q=` entrega las intervenciones que
  **empiezan** en el rango (páginas de 30 min; `siguienteMs` salta los bloques vacíos), o con `q` las coincidencias de toda
  la reunión (sin tildes ni mayúsculas, todas las palabras, hasta 200; recorre la base por lotes de 2.000); `GET
  …/transcript` arma el `.txt` desde la base (con los nombres *actuales*, no desde el archivo guardado) con un
  encabezado y los silencios intercalados; 409 mientras no está lista. Ninguna devuelve URLs de Blob.
- **Visor** (`VisorTranscripcion`): por hora, con `00:00:05`, el nombre o «Voz N» (V1…V4 y H5… nunca repiten número), marcas
  y silencios intercalados solo dentro de lo ya cargado, «Cargar los siguientes 30 min» y descarga (botón y menú «Más»).
  Con la reunión lista y sin resumen todavía, abre en «Transcripción». *Falta (M7):* reproductor, buscador y saltos al minuto.
- **Demo:** 8 s preparando el audio → 18 s «Transcribiendo n de 14» → 4 s «Uniendo» → lista, con la transcripción de
  septiembre y las voces **sin nombre** («Voz 1…5»: así se ve el estado real antes de M6).
- **Simuladores de prueba** (`transcripcion/sintetico.ts`): una reunión inventada de ~50 min con la verdad conocida (cinco
  personas, una que casi no habla, un receso y una frase que cruza **cada** borde) y un simulador de OpenAI que solo ve lo
  que recibiría el servicio: los bytes del audio (cada milisegundo dice quién habla) y las muestras en data URL. Con eso las
  pruebas de punta a punta (trabajador real + base falsa + almacén en carpeta) comprueban que el recorte, las muestras y
  las etiquetas caen donde deben, no solo que el código «corre».
- **`contratos.ts`:** `ErrorTarea`, `aErrorTarea` y los tipos del manejador salen de `manejadores.ts` (que los reexporta)
  para que los manejadores de otros módulos no dependan de ese archivo.
- **Para verificar en la primera vista previa** (no se puede aquí): (a) cuánto tarda `gpt-4o-transcribe-diarize` con un
  tramo de 10,5 min frente al límite de 150 s (si es lento, bajar `TRAMO_MS`); (b) que acepta las muestras MP3 y devuelve
  los nombres V1…V4 (hay respaldo); (c) cómo etiqueta a las voces desconocidas cuando hay voces conocidas; (d) el costo real
  por minuto (`COSTO_USD_POR_MINUTO = 0,006` es una estimación); (e) los límites de uso con 4 tramos a la vez; (f) la calidad
  del corte automático (VAD) en salas con eco.
- **Pruebas** (de 972 a 1190 en total): `transcripcion/` 171 (tramos 22, hablantes 31, unir 37 —incluida la reunión sintética
  con 8 semillas—, proveedores 30, manejadores de punta a punta 15, páginas 19, presentación 10, guardado 7), rutas de
  transcripción 13 + demo 7, orquestador 34 (+16), y una integración más con el **ffmpeg real** (de la grabación al texto).
  Se verificaron por mutación las reglas del borde, las voces conocidas, la reconciliación, el recorte de las muestras, la
  alineación de tiempos y la idempotencia de `unir`.

**Notas de M6 (desviaciones y decisiones al construir):**

- **La IA nunca tumba una reunión.** La transcripción completa es lo principal y ya está pagada. Un fallo *del momento*
  de la IA (red, 408/409/429/5xx/529, respuesta cortada, vacía o ilegible) se reintenta con la cola (30 s / 2 min / 10 min,
  3 intentos); uno *sin arreglo* (credenciales, saldo, modelo que no existe, petición rechazada, `refusal`) o los
  reintentos agotados **omiten el paso y lo anotan**: un bloque omitido queda como «pendiente» en la ficha; si falla la
  llamada de la ficha, esta se arma con lo que ya salió de los bloques (`fichaSinIA`, sin resumen) y la reunión queda
  «lista» con `errorMessage` = «El resumen con IA no se pudo generar: la transcripción está completa y puedes revisarla.»
  (la pantalla muestra «Falta el resumen de la reunión.»). Solo un fallo de la base de datos o del código puede dejar la
  reunión en «error». Con menos de 40 palabras (una prueba de micrófono) no se llama a la IA.
- **Etapa «Analizando con IA»** (`analizando`, entre «Uniendo» y «lista»): al terminar `unir` se encolan una tarea
  `bloque:<k>` por bloque y, cuando todas terminaron (hechas u omitidas), la tarea `ficha`; la reunión pasa a «lista» al
  terminar `ficha` (o directo desde `unir` si no hay nada que analizar). El avance es «n de N» bloques. Reintentar una
  reunión rehace solo lo que falta.
- **La ficha** (`ficha.ts`, todo funciones puras y probadas sin red): `planificarBloques` (~25 min, cortados entre
  intervenciones, ≤ 9.000 palabras; un último bloque de < 4 min se une al anterior solo si no pasa el tope) → `analizar_bloque`
  (temas, decisiones, compromisos, votaciones, cifras y pistas de quién es quién; **se valida lo que vuelve**: nada fuera
  del bloque, nada de etiquetas que no existen, textos acotados) → `consolidar` **con reglas** (quita los repetidos de las
  costuras —ventana de 15 min, igualdad o contención ≥ 0,85—, numera D1…, C1…, V1… por tiempo) → **una** llamada `ficha`
  (resumen, orden del día, asistentes, pendientes y nombres sugeridos) → `armarFicha`. **Las decisiones, compromisos y
  votaciones nunca pasan por la última llamada para reescribirse:** el modelo no puede perderlas ni inventarlas en la
  consolidación. Se guarda en `Meeting.digest`; la sugerencia de cada voz (nombre, rol, evidencia con el minuto, confianza,
  «igual a» otra voz) en `MeetingSpeaker.suggestion`. `Ficha.hablantes[].t` es el minuto de la evidencia.
- **Cliente de Claude** (`ia.ts`, interfaz `ClienteIA.generarJson`): `claude-opus-5-5` (`MEETINGS_MODEL`), esfuerzo
  `MEETINGS_EFFORT` (por omisión `high`; **los reintentos bajan a `medium`**: una respuesta que se corta o tarda suele
  arreglarse pensando menos), sin `thinking` ni `temperature` (en Opus 5.5 siempre piensa y los modelos 5 rechazan
  `temperature`), **salida estructurada** (`output_config.format` con JSON Schema), *streaming* + `finalMessage()` para no
  chocar con timeouts, `max_tokens` 32.000, `maxRetries: 0` (reintenta la cola) y timeout de la llamada = mín(200 s,
  presupuesto − 25 s, y no menos de 30 s). Se mira `stop_reason` **antes** del contenido (`refusal` → no se reintenta;
  `max_tokens` → sí). **Respaldo del servicio** (`fallbacks: "default"` + beta `server-side-fallback-2026-07-01`): si la
  organización no tiene la beta (400 que nombra `anthropic-beta`) se repite la llamada sin ella y se deja de pedirla en ese
  proceso; `MEETINGS_FALLBACKS=off` la apaga. **Se dejó el SDK en 0.88.0** (no se subió de versión): `betas` y `fallbacks`
  viajan en un tipo mínimo (`ClienteDeAnthropic`) sin tipar, y las pruebas fijan los parámetros exactos que se envían.
- **Costos y registro de uso** (`terminado.ts`, **una sola vez** al pasar a «lista»): `calcularUso` suma `usage.iterations`
  cuando hubo respaldo (cada intento cuesta) con la tabla `PRECIOS_USD_POR_MTOK` (**estimación a verificar con los precios
  de Anthropic**; un modelo que no está en la tabla se cobra como Opus 5: mejor pasarse que quedarse corto).
  `Meeting.costUsd` = transcripción + IA; dos `UsageRecord`: `reunion_audio` (segundos de audio y el costo de transcribir)
  y `reunion_ia` (tokens y costo de la IA). Estimación para 8 h: ≈ US$ 2,9 de transcripción + US$ 2,8–4,8 de IA;
  `MEETINGS_EFFORT=medium` es la palanca para bajar lo segundo. El registro, el correo y el costo son pasos
  independientes: ninguno puede tumbar a los otros ni a la reunión.
- **Correo «tu reunión está lista»** (`sendMeetingReadyEmail` en `email.ts`, devuelve `{ sent }`): una vez, a quien la
  grabó, con título, copropiedad, duración y el enlace a la reunión. No sale si la reunión no llega a «lista».
- **Cupos** (`cupos.ts`): Pro 10 h/mes, Business 40, Élite 120 (de `PLANS.*.limits.meetingHoursPerMonth`); la prueba
  gratis 2 h **en total**; las cuentas beta y la fase `OPEN_TESTING` sin tope. **Lo consumido se deriva de
  `Meeting.durationMs`** de las reuniones del mes (mes de Bogotá, UTC−5), no de un contador aparte: reintentar o reprocesar
  nunca cuenta dos veces (la reunión que se evalúa no se cuenta a sí misma). Se comprueba en `armar_audio`, cuando ya se
  sabe cuánto dura: si no alcanza la reunión pasa a **`sin_cupo`** (el audio se conserva) con un mensaje claro («Esta
  reunión dura 8 h y te quedan 2 h este mes.» / «Ya usaste las 10 h de reuniones de este mes.») y el botón «Ver planes».
  Una falla al consultar el cupo **no bloquea** (se deja pasar y se registra), como el resto de los topes de la plataforma.
- **Nombres de las voces** — `PUT /api/meetings/[id]/speakers` con `{ hablantes: [{ label, name, role?, personId? }] }`
  (hasta 60; un nombre vacío = «sin nombre»; las personas deben ser de **esa** copropiedad). **Dos voces con el mismo
  nombre (sin mayúsculas ni tildes) son la misma persona que el reconocimiento partió: se fusionan** en la que más habla,
  sus intervenciones pasan a ella (`planificarGuardado` decide todo sin tocar la base; la ruta y el demo hacen lo mismo),
  y todo va en una `$transaction`. Responde `{ speakers }` ordenado por habla. Una voz con nombre queda `confirmed` (en
  pantalla, «Con nombre») y la sugerencia de la IA deja de ofrecerse cuando el nombre elegido ya es el sugerido.
- **Pestaña «Hablantes»** (`TabHablantes.tsx`; la lógica sin React está en `nombres-pantalla.ts`): una fila por voz con el
  tiempo que habla, selector de persona de la copropiedad (o «Otra persona…» con el nombre escrito: se crea la persona al
  guardar), rol, y —si la IA sugirió algo— la sugerencia con su evidencia y el minuto, «Usar este nombre» y, si cree que es
  la misma voz que otra, «Unir con …»; un aviso dice qué voces se van a unir antes de guardar.
- **Pestaña por omisión: «Transcripción»** cuando la reunión está lista (M7 la pasa a «Resumen» cuando exista).
- **Demo:** la simulación ahora dura 38 s: 2 s en cola, 8 s preparando el audio, 18 s «Transcribiendo n de 14», 4 s
  «Uniendo» y 6 s «Analizando con IA n de 6»; termina «lista» con la transcripción de septiembre, `FICHA_SEPTIEMBRE` y las
  voces **sin nombre pero con sugerencias de la IA**; guardar nombres y fusionar funciona igual que en producción
  (`demoGuardarHablantes`).
- **Simulador de la IA para pruebas** (`ia-simulada.ts`): contesta como lo haría Claude con las instrucciones de `ficha.ts`
  pero con reglas fijas sobre el texto que recibe (lee del prompt las mismas líneas `[hh:mm:ss] V1: texto`); con la reunión
  sintética de M5 las pruebas de punta a punta comprueban el recorrido entero (bloques → ficha → hablantes → costos →
  correo → «lista») sabiendo cuál debe ser el resultado.
- **Para verificar en la primera vista previa** (no se puede aquí): (a) latencia y calidad reales de Opus 5.5 con
  `high` frente al timeout de 200 s por llamada (si un bloque no cabe, bajar `MEETINGS_EFFORT` o `BLOQUE_MS`); (b) que la
  organización de Anthropic tenga la beta del respaldo (si no, se ve el aviso en el registro y sigue sin ella); (c) el
  costo real por reunión frente a la estimación; (d) que la IA reconoce bien a quién es quién en reuniones reales (la
  sugerencia siempre pasa por la persona); (e) lo de M4/M5 que sigue pendiente (ffmpeg y *loopback* en Vercel, latencia de
  `gpt-4o-transcribe-diarize`, muestras MP3 de las voces).
- **Límites conocidos (planeados):** si la IA no está disponible la reunión queda «lista» sin resumen y **todavía no hay
  «Generar el resumen otra vez»** (M7); una reunión en `sin_cupo` **no tiene «Procesar de nuevo»** al renovar el cupo
  (M9); el botón «Escuchar» de las voces necesita la ruta de audio de M7.
- **Pruebas** (de 1190 a 1353 en total): `ia` 24, `ficha` 37, `analisis` 25 (con el simulador y con fallos de la IA en cada
  paso), `terminado` 9, `cupos` 13 + 2 (en `armar_audio`), correo 6, `nombres` 12 y `nombres-pantalla` 14, ruta de hablantes 7
  + 86 de rutas (la tabla de la bandera y el demo), orquestador 42 (+8: la etapa de análisis) e integración de punta a punta.
  Se verificaron por mutación la consolidación, la validación de lo que devuelve la IA, el esfuerzo de los reintentos, el
  cupo y la fusión de voces. Siguen en verde `tsc`, `eslint`, `next build` y el barrido de pantallas (oscuro/claro,
  escritorio/móvil).

| Hito | Estado | Commit | Notas |
|---|---|---|---|
| M0 Fundaciones | hecho | (ver `git log`) | Ver «Notas de M0» arriba. |
| M1 Lista y creación | hecho | (ver `git log`) | Ver «Notas de M1» arriba. |
| M2 Subida reanudable | hecho | (ver `git log`) | Ver «Notas de M2» arriba. |
| M3 Grabadora | hecho | (ver `git log`) | Ver «Notas de M3» arriba. |
| M4 Cola y audio | hecho | (ver `git log`) | Ver «Notas de M4» arriba. |
| M5 Transcripción | hecho | (ver `git log`) | Ver «Notas de M5» arriba. |
| M6 Ficha, hablantes, cupos | hecho | (ver `git log`) | Ver «Notas de M6» arriba. |
| M7 Página de la reunión | pendiente | | |
| M8 Acta y Preguntar | pendiente | | |
| M9 Cupos visibles, retención, piloto | pendiente | | |
| M10 AssemblyAI (opcional) | pendiente | | |
