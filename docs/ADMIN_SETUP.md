# Configurar administradores y el panel admin

Hay dos caminos. El **rápido** no toca DNS; el **aislado** pone el admin en su
propio subdominio.

---

## ⚡ Opción rápida (sin DNS) — recomendada para empezar

El panel queda en **`management.sophiagrouph.com/admin`**, protegido igual por
`requireAdmin` (verifica el rol contra la base de datos en cada página y API).

En Vercel → **Settings → Environment Variables** (entorno **Production**),
agrega DOS variables y luego **Redeploy**:

```
ADMIN_EMAILS = gutierrezivan2000@gmail.com
ALLOW_ADMIN_ON_MAIN_HOST = true
```

Después: cierra sesión, entra a `https://management.sophiagrouph.com/admin` e
inicia sesión con ese correo. Listo.

> `ADMIN_EMAILS` es runtime (aplica al próximo login). `ALLOW_ADMIN_ON_MAIN_HOST`
> lo lee el middleware en el borde, así que conviene **hacer Redeploy** tras
> agregarla para que tome efecto de inmediato.

---

## 🔒 Opción aislada (subdominio propio)

El panel de administración vive en un **host separado** del app principal
(`management.sophiagrouph.com` es el app; el admin NO puede vivir ahí).

## 1. Elegir el host del admin

La forma más simple es un subdominio que empiece por **`admin.`** — el proxy
lo detecta solo, **sin necesidad de variable de entorno** (`src/proxy.ts`,
`isAdminHost`).

Recomendado: **`admin.sophiagrouph.com`**

### En Vercel
1. Proyecto **ph** → **Settings → Domains → Add** → `admin.sophiagrouph.com`.
2. Vercel te mostrará el registro DNS a crear.

### En tu proveedor de DNS (donde administras `sophiagrouph.com`)
Agrega el registro que indique Vercel, típicamente:

```
Tipo: CNAME   Nombre: admin   Valor: cname.vercel-dns.com
```

Espera a que Vercel marque el dominio como **Valid Configuration**.

> Alternativa: si quieres un host que NO empiece por `admin.`, define
> `NEXT_PUBLIC_ADMIN_HOSTNAME` con ese host. **Ojo:** esa variable es
> *build-time* (`NEXT_PUBLIC_`), así que **cambiarla exige un redeploy**.
> Con el subdominio `admin.` no necesitas esta variable.

## 2. Nombrar al primer administrador (bootstrap)

En Vercel → **Settings → Environment Variables** (entorno **Production**):

```
ADMIN_EMAILS = tu-correo-de-login@dominio.com
```

- Usa **el mismo correo con el que inicias sesión en SOPH.IA** (Google o
  email/contraseña). La comparación ignora mayúsculas.
- Puedes poner varios separados por coma: `a@x.com,b@y.com`.
- Es *runtime*: **toma efecto en el próximo inicio de sesión, sin redeploy.**
- Estos admins son **permanentes**: no se pueden degradar desde la interfaz
  (hay que sacarlos de `ADMIN_EMAILS` primero).

## 3. Entrar y verificar

1. Ve a **https://admin.sophiagrouph.com** → te lleva a `/admin/login`.
2. Inicia sesión con el correo de `ADMIN_EMAILS`.
   (Si ya tenías sesión abierta antes de agregar la variable, **cierra sesión
   y vuelve a entrar** para que el rol se aplique.)
3. Deberías ver el panel (Resumen, Usuarios, Suscripciones, …).

## 4. Asignar más administradores (desde la interfaz)

Con al menos un admin ya activo:

**Panel admin → Usuarios → abre el usuario → botón "Promover a admin"**
(internamente `PATCH /api/admin/users/[id]`).

A estos sí los puedes **degradar** con "Quitar admin" — a diferencia de los de
`ADMIN_EMAILS`.

## 5. (Opcional) Sesión compartida entre subdominios

Si quieres que un mismo login sirva para el app y el admin, define:

```
COOKIE_DOMAIN = .sophiagrouph.com   (debe empezar por punto)
```

Es *build-time* → requiere redeploy. Si no lo defines, el admin usa su propio
login en su subdominio (perfectamente válido y algo más seguro).

## Resumen rápido

| Variable | Para qué | ¿Redeploy? |
|---|---|---|
| `ADMIN_EMAILS` | Nombra admins permanentes (bootstrap) | No (próximo login) |
| `NEXT_PUBLIC_ADMIN_HOSTNAME` | Host admin si NO usas subdominio `admin.` | **Sí** |
| `COOKIE_DOMAIN` | Compartir sesión entre subdominios (opcional) | **Sí** |
| Dominio `admin.sophiagrouph.com` en Vercel + DNS | Servir el panel | — |
