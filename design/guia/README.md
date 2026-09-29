# «Guía» — sistema visual del dashboard y de /empresa

Sustituye al rediseño «Índice» (`design/final/`, ya obsoleto). Nace de un problema concreto de usabilidad:
la interfaz era demasiado sobria y críptica (numeración 01–15, mayúsculas condensadas, letras griegas, casi
sin iconos ni color). «Guía» aplica tres ideas y nada más:

1. **Cada función tiene SU icono y SU color, siempre los mismos** (menú, cabecera de pantalla, dock móvil,
   accesos rápidos, estados vacíos, modales).
2. **Cada botón dice qué hace**: icono + verbo, con el color de su intención (crear = verde, descargar = azul,
   eliminar = rojo, generar con IA = violeta→fucsia…).
3. **Cada estado es icono + color + palabra** (nunca solo color).

Además: español llano en lugar de jerga («Menú» y no «Índice», «Esta semana» y no «S40»), formas redondeadas
y amables, y las funciones pausadas agrupadas bajo «Próximamente».

## Dónde vive

| Qué | Dónde |
| --- | --- |
| Tokens, tonos, kit de clases `k-*` | `src/app/globals.css` (desde el banner «GUÍA»), acotados a `[data-shell="app"]` |
| Fuente | `src/components/kit/fuentes.ts` → **Figtree Variable** (autoalojada, `@fontsource-variable/figtree`) |
| Registro de funciones (icono + color + frase) | `src/components/kit/modulos.ts` → `MODULOS` |
| Reconocer la acción por su verbo | `iconoDeAccion(texto)` en `modulos.ts` |
| Reconocer un encabezado | `iconoDeTitulo(texto)` en `modulos.ts` |
| Ficha de icono | `Loseta` (`src/components/kit/Loseta.tsx`) |
| Componentes | `src/components/kit/*` (se importan de `@/components/kit`) |

Landing, `/login`, portal de residentes y `/admin` **no** cambian: los tokens solo existen dentro de
`[data-shell="app"]` (verificable con las «huellas» de variables CSS antes/después).

## Tonos

14 tonos (`violet blue sky teal green lime amber orange red pink fuchsia indigo slate ai`). Cada uno define
`--c-<tono>-a/-b` (degradado de relleno), `-on` (texto sobre el relleno), `-ink` (texto/icono sobre fondo),
`-soft` (fondo tintado) y `-line` (borde). Un elemento con `data-h="<tono>"` los expone como `--h-*`, que leen
botones, estados, fichas, chips, pestañas y tarjetas. Los valores están calculados para que:

- texto sobre el relleno ≥ 4,5:1, tinta clara ≥ 5:1 y tinta oscura ≥ 6:1 sobre tarjeta, lienzo y tinte;
- ámbar usa texto oscuro sobre el relleno; el resto, blanco.

Asignación (mismos colores en todas partes):

Inicio violeta · Generar azul · Bitácora naranja · Asistente IA violeta→fucsia · Cartera verde · Presupuesto lima ·
Residentes celeste · PQRS rosa · Comunicados ámbar · Asambleas fucsia · Certificados verde azulado ·
Propiedades azul · Historial gris · Suscripción verde azulado · Configuración índigo · Soporte celeste ·
Portafolio (Élite) ámbar. Rojo se reserva para lo destructivo y lo vencido.

## Cómo se escribe una pantalla

```tsx
<CabeceraPieza titulo="Residentes" subtitulo="Portal por unidad, sin usuarios ni contraseñas"
  acciones={<><Boton variante="secundario">Importar Excel con IA</Boton><Boton flecha="crea">Agregar unidades</Boton></>} />
```

- `CabeceraPieza` toma icono y color de la ruta (`moduloDe(pathname)`); `icono`/`tono` los cambian.
- `Boton`, `BotonFila`, `BotonLote`, `MenuMas` deducen icono y color del verbo. Se fijan con `icono` y `tono`.
  Un verbo que no se reconoce cae en «→» violeta al final: si sale mal, añade una regla en `iconoDeAccion`.
- `Seccion` y `Panel` pintan una ficha si reconocen el tema del título (o si pasas `icono`/`tono`).
- `Modal` toma icono y color de su acción principal (destruye → rojo).
- `Estado`, `Cuadro`, `Insignia`, `Categoria`, `TipoArchivo`: siempre con icono/color/palabra.
- `Accesos`/`Acceso`: fichas grandes de «qué quieres hacer».
- Para una función nueva: añádela a `MODULOS` (y, si va en el menú, a `NAV_GROUPS` en `Sidebar.tsx`).
- `Etiqueta`: icono + palabra en el color que elijas, para estados propios de una función (radicado, vigente,
  «a favor») que no están entre los `TipoEstado`.

## Pantallas pausadas

Cartera, Presupuesto, PQRS, Comunicados, Asambleas y Certificados también están escritas con el kit, pero
siguen detrás de `COMING_SOON` (`src/lib/feature-flags.ts`): en producción se ve «Próximamente». Para activar
una, pon su bandera en `false`; la lógica y las llamadas a la API no cambian.

Convenciones que siguen (para mantenerlas al tocarlas):

- Las confirmaciones (`window.confirm`) son un `<Modal>` con la consecuencia concreta y la acción con su verbo.
- Los éxitos salen como `avisar()` (aviso flotante, se va solo); los errores de un formulario, como `<Aviso enLinea>`
  dentro del panel que está abierto.
- Los estilos propios de una pantalla van en un `<style href="k-<pantalla>-local" precedence="default">` con
  prefijo propio (`.ca-*`, `.pr-*`, `.pq-*`…); van sin capa, así que ganan a las reglas `k-*` (que viven en
  `@layer components`) salvo las marcadas `!important`, que solo se pueden vencer con otro `!important` en una capa
  anterior (`@layer base`).
- `.k-bt + .k-bt` añade 6 px a la izquierda: en un contenedor con `gap` (filas de acciones que se parten en
  móvil) hay que anularlo con `margin-left: 0` o el primer botón de cada línea queda desalineado.
- Las cifras largas en COP no caben en las tarjetas de 2 columnas del móvil con `tamLetra={32}`: se reduce con
  `clamp()` en ≤ 860 px (ver `.ca-kpis` y `.pr-kpis`).

## Comprobaciones

- `node scripts/contraste.mjs dark|light [umbral]` audita el contraste de todo el texto de 19 pantallas
  (incluye fondos con degradado: se evalúa la peor parada). Debe dar 0.
- `npx tsc --noEmit -p .`, `npx eslint src`, `npx vitest run`, `npx next build`.
