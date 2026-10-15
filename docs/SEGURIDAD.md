# Seguridad — controles vigentes y decisiones

Resumen de lo que protege la aplicación, dónde vive cada control y qué decisiones se tomaron. Lo operativo (variables de entorno) está en `.env.example`.

## Los 20 puntos

| # | Punto | Estado | Dónde |
|---|---|---|---|
| 1 | Ocultar API keys | Cubierto | `/api/debug` solo informa SET/MISSING. La P_KEY de ePayco no se devuelve ni en fragmentos (`/api/pagos/config`). |
| 2 | Secretos fuera de Git | Verificado | Escaneo de los 300 commits y todas las ramas: ningún secreto real. El repositorio es **público**. `.env*` está en `.gitignore`. |
| 3 | Clave pública para la base de datos | No aplica | La base solo se usa desde el servidor (`DATABASE_URL`). |
| 4 | Row-Level Security | No implementado | El aislamiento por cuenta está en cada consulta (filtro por `userId`/`propertyId`). RLS exigiría rediseñar la conexión. |
| 5 | Cifrar datos sensibles | Cubierto | Contraseñas con bcrypt (coste 12). P_KEY de ePayco con AES-256-GCM (`src/lib/secret-box.ts`). |
| 6 | Forzar autenticación | Cubierto | `requireAdmin` (rol leído de la base, excluye baneados), `requireCartera`, `requireElite`, secretos de cron en tiempo constante. |
| 7 | Restringir acceso a registros | Cubierto | Consultas con dueño; portal por `portalToken`; archivos atados a su dueño (`src/lib/blob-owner*.ts`). |
| 8 | Bloquear manipulación de campos | Cubierto | Lista de campos permitidos en perfil y tickets; ePayco no activa planes sin orden ni con transacciones de prueba. |
| 9 | Cookies de sesión | Cubierto | `httpOnly`, `secure`, prefijo `__Secure-`; JWT de 7 días con renovación diaria. |
| 10 | Hashear contraseñas | Cubierto | bcrypt coste 12; mínimo 8 caracteres; la contraseña la fija quien verifica el código. |
| 11 | Rate limiting | Cubierto | `src/lib/rate-limit.ts` atómico; `failClosed` en login, registro, recuperación, verificación y pagos. |
| 12 | Protección contra bots | Opcional | Cloudflare Turnstile en registro y recuperación; apagado si no hay llaves. Login: solo límites. |
| 13 | Parametrizar consultas | Cubierto | Prisma y `$queryRaw` con plantilla etiquetada. El único SQL crudo fijo es el DDL de `ensure*Schema` y `/api/admin/migrate`. |
| 14 | Validar entradas | Cubierto | `src/lib/validar-entrada.ts`, topes de tamaño y de coste en chat, generación, importaciones. |
| 15 | Sanitizar contenido | Cubierto | Escape de HTML en informes/actas y correos; CSV con fórmulas neutralizadas. |
| 16 | Restringir archivos | Cubierto | Lista blanca de tipos en el portal; firma de medios en audio; ffmpeg sin acceso a red. |
| 17 | Devolver solo lo necesario | Cubierto | Respuestas de perfil, tickets y pagos acotadas; errores internos no se devuelven. |
| 18 | Cabeceras de seguridad | Cubierto | HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy; CSP mínima forzada y CSP estricta en solo-reporte (`/api/csp-report`). |
| 19 | Forzar HTTPS | Cubierto | HSTS; `urlBase()` no cae en localhost en producción. |
| 20 | Escanear dependencias | Parcial | `next` 16.4.0 y overrides de `@auth/core`, `axios`, `follow-redirects`, `qs`. `xlsx` sin versión corregida en npm. |

## Decisiones que conviene recordar

- **Esquema de la base**: el build ya no ejecuta `prisma db push` (fallaba en cada despliegue desde Prisma 7). Las tablas y columnas las crean las funciones `ensure*Schema` y `/api/admin/migrate`; `src/lib/schema-drift.test.ts` falla si el esquema declara algo que ninguna de ellas crea.
- **Modo demo**: `DEMO_MODE=true` no arranca en producción de Vercel salvo `DEMO_PERMITIDO_EN_PRODUCCION=true`.
- **P_KEY de ePayco**: se cifra al guardarla. Cifrar las que ya estaban en claro es opt-in (`MIGRAR_LLAVES_EPAYCO=true`), porque volver a una versión anterior del código haría fallar las firmas de los pagos. Definir `ENCRYPTION_KEY` evita que rotar `AUTH_SECRET` deje las llaves ilegibles.
- **Cuotas**: las comprobaciones de cupo de generaciones, actas, lotes y correos van con candado por usuario (`pg_advisory_xact_lock`) o reserva atómica, para que una ráfaga no pase el tope.
- **Fallo cerrado**: si el contador de límites no responde, los endpoints que envían correos, crean cuentas o cobran deniegan. Los de coste de IA para usuarios autenticados siguen fallando abiertos.

## Pendiente o por decidir

- **`xlsx` 0.18.5** (prototype pollution y ReDoS) no tiene versión corregida en npm. Opciones: instalar la 0.20.x desde el servidor de SheetJS o migrar a `exceljs`.
- **CSP estricta**: observar los informes `[csp-report]` en producción una o dos semanas antes de promoverla a forzada; quitar `'unsafe-inline'` exige nonces.
- **Restricción de índice único** en `Charge(unitId, type, month, year)` como segunda barrera contra cargos duplicados (cambio de esquema).
- **Audio**: los minutos se comprueban pero no se reservan antes de transcribir; una ráfaga puede pasarse del cupo mensual por una generación.
- **Sesiones anteriores**: tras el despliegue, quien tuviera una sesión de más de 7 días de inactividad deberá volver a entrar.
- **Secretos**: si alguna vez se publica un secreto, rotarlo; reescribir el historial no basta porque el repositorio es público.
