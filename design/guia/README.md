# «Guía» y «Calma» — sistema visual del dashboard y de /empresa

Sustituye al rediseño «Índice» (`design/final/`, ya obsoleto). Nace de un problema concreto de usabilidad:
la interfaz era demasiado sobria y críptica (numeración 01–15, mayúsculas condensadas, letras griegas, casi
sin iconos ni color). «Guía» aplica tres ideas y nada más:

1. **Cada función tiene SU icono**, siempre el mismo (menú, cabecera de pantalla, dock móvil, accesos rápidos,
   estados vacíos, modales).
2. **Cada botón dice qué hace**: icono + verbo (crear = +, descargar = ↓, eliminar = 🗑, generar con IA = ✨…).
3. **Cada estado es icono + color + palabra** (nunca solo color).

Además: español llano en lugar de jerga («Menú» y no «Índice», «Esta semana» y no «S40») y las funciones
pausadas agrupadas bajo «Próximamente».

## Aspecto actual: «Calma»

La primera versión de «Guía» daba a cada función su propio color (14 tonos, fichas de icono rellenas, degradados,
radios de 24–32 px, tipografía de peso 800). Resultó **demasiado colorida e infantil**. «Calma» es una capa visual
sobre el mismo kit —mismos componentes, iconos, verbos y español llano— que cambia solo el carácter:

- **Un solo acento**: violeta `#6E56CF` para lo principal (botón primario, elemento activo del menú, «Hoy», barras).
- **Color solo cuando significa algo**: verde = listo, ámbar = atención, rojo = peligro o vencido. Las fichas de
  icono de cada función son neutras (gris): el icono dice qué es; el color queda para el estado.
- **Superficies neutras** (grises fríos), sin degradados ni brillos y con sombras mínimas.
- **Formas contenidas**: radios de 8–14 px (antes 16–32); estados y etiquetas como rectángulos de esquina suave en
  vez de píldoras; controles de 36–44 px (antes 44–58).
- **Tipografía Inter** (autoalojada, `@fontsource-variable/inter`) con pesos 500–700 (antes 700–800), títulos de
  18–32 px y cifras tabulares.
- **El título de la pantalla aparece una sola vez**: la barra superior ya no repite el `<h1>` de la página.

### Dónde vive y cómo se quita

El bloque «CALMA» está al final de `src/app/globals.css` y se activa con `data-paleta="calma"` en el `<html>`
(`src/app/layout.tsx`). **Quitar ese atributo devuelve la apariencia anterior («Guía»)** sin tocar nada más.
Todas sus reglas llevan el prefijo `:root[data-paleta="calma"]`: ganan al kit (que vive en `@layer components`) y
a los `<style>` de cada pantalla por especificidad.

El bloque está en cuatro partes, en este orden:

1. **Tokens** (colores, sombras, tipografía) para oscuro y claro.
2. **Color**: fichas neutras (con excepciones semánticas: avisos, urgencias, modales, estados), planos sin degradado.
3. **Forma**: una regla por cada regla del kit o de un `<style>` de pantalla que tuviera radio ≥ 12 px o peso ≥ 600.
   Es una lista plana y editable a mano; si una pantalla nueva o modificada trae radios o pesos grandes, hay que
   añadirle su regla aquí (no se regenera sola).
4. **Ajustes manuales**: cabeceras sin tarjeta, menú con iconos sueltos, cifras clave, tablas, pestañas, modales…

Landing, `/login`, portal de residentes y `/admin` **no** cambian: no usan clases `k-*` y los tokens solo existen
dentro de `[data-shell="app"]` (se comprobó con capturas de las páginas públicas con y sin el atributo: idénticas).

## Dónde vive el kit

| Qué | Dónde |
| --- | --- |
| Tokens, tonos, kit de clases `k-*` | `src/app/globals.css` (desde el banner «GUÍA»), acotados a `[data-shell="app"]` |
| Capa «Calma» | `src/app/globals.css` (banner «CALMA», al final) + `data-paleta="calma"` en `src/app/layout.tsx` |
| Fuentes | `src/components/kit/fuentes.ts` → **Inter Variable** («Calma») y Figtree Variable («Guía»), autoalojadas con Fontsource |
| Registro de funciones (icono + tono + frase) | `src/components/kit/modulos.ts` → `MODULOS` |
| Reconocer la acción por su verbo | `iconoDeAccion(texto)` en `modulos.ts` |
| Reconocer un encabezado | `iconoDeTitulo(texto)` en `modulos.ts` |
| Ficha de icono | `Loseta` (`src/components/kit/Loseta.tsx`) |
| Componentes | `src/components/kit/*` (se importan de `@/components/kit`) |

## Tonos

14 tonos (`violet blue sky teal green lime amber orange red pink fuchsia indigo slate ai`). Cada uno define
`--c-<tono>-a/-b` (degradado de relleno), `-on` (texto sobre el relleno), `-ink` (texto/icono sobre fondo),
`-soft` (fondo tintado) y `-line` (borde). Un elemento con `data-h="<tono>"` los expone como `--h-*`, que leen
botones, estados, fichas, chips, pestañas y tarjetas. Los valores están calculados para que:

- texto sobre el relleno ≥ 4,5:1, tinta clara ≥ 5:1 y tinta oscura ≥ 6:1 sobre tarjeta, lienzo y tinte;
- ámbar usa texto oscuro sobre el relleno; el resto, blanco.

Con «Calma» el conjunto se reduce a lo que significa algo: `violet`, `blue`, `sky`, `teal`, `lime`, `pink`,
`fuchsia`, `indigo` y `ai` valen todos el acento violeta; `orange` vale ámbar; `amber`, `green`, `red` y `slate`
conservan su significado (atención, listo, peligro/vencido, neutro). Los componentes siguen pidiendo el tono de su
función (`tono="green"`…) y no hay que tocarlos: la capa decide cuándo se ve el color.

Asignación de «Guía» (se ve al quitar el atributo):
Inicio violeta · Generar azul · Bitácora naranja · Asistente IA violeta→fucsia · Cartera verde · Presupuesto lima ·
Residentes celeste · PQRS rosa · Comunicados ámbar · Asambleas fucsia · Certificados verde azulado ·
Propiedades azul · Historial gris · Suscripción verde azulado · Configuración índigo · Soporte celeste ·
Portafolio (Élite) ámbar. Rojo se reserva para lo destructivo y lo vencido.

## Cómo se escribe una pantalla

```tsx
<CabeceraPieza titulo="Residentes" subtitulo="Portal por unidad, sin usuarios ni contraseñas"
  acciones={<><Boton variante="secundario">Importar Excel con IA</Boton><Boton flecha="crea">Agregar unidades</Boton></>} />
```

- `CabeceraPieza` toma icono y tono de la ruta (`moduloDe(pathname)`); `icono`/`tono` los cambian. Con «Calma» la
  cabecera muestra solo título, frase y acciones (la ficha de icono queda oculta).
- `Boton`, `BotonFila`, `BotonLote`, `MenuMas` deducen icono y tono del verbo. Se fijan con `icono` y `tono`.
  Un verbo que no se reconoce cae en «→» al final: si sale mal, añade una regla en `iconoDeAccion`.
- `Seccion` y `Panel` pintan una ficha si reconocen el tema del título (o si pasas `icono`/`tono`).
- `Modal` toma icono y tono de su acción principal (destruye → rojo).
- `Estado`, `Cuadro`, `Insignia`, `Categoria`, `TipoArchivo`: siempre con icono, color y palabra.
- `Accesos`/`Acceso`: fichas de «qué quieres hacer».
- Para una función nueva: añádela a `MODULOS` (y, si va en el menú, a `NAV_GROUPS` en `Sidebar.tsx`).
- `Etiqueta`: icono + palabra en el tono que elijas, para estados propios de una función (radicado, vigente,
  «a favor») que no están entre los `TipoEstado`.
- **No añadas color decorativo.** Si algo es un estado, usa `Estado`/`Etiqueta` (el color lleva siempre su palabra);
  si solo es de una función, déjalo neutro.

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
- Con `next dev`, si un cambio de `globals.css` no se refleja, para el servidor, borra `.next/dev/cache/turbopack`
  y vuelve a arrancarlo: la caché persistente de Turbopack puede servir el CSS anterior.
