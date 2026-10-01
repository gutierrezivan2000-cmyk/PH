/**
 * Fuente del rediseño «Guía», autoalojada con Fontsource.
 * Google Fonts no carga en este entorno y en producción bloquea el render.
 *
 * Lo importa UNA vez el armazón del dashboard y el de /empresa:
 *   import "@/components/kit/fuentes";
 * No toques el <link> de Google del layout raíz: lo usa la portada.
 *
 * - "Inter Variable": la tipografía de «Calma» (el aspecto actual): sobria y muy legible, eje wght 100–900,
 *   con cifras tabulares (`tnum`) para alinear importes en columnas.
 * - "Figtree Variable": la de «Guía» (redonda y amable). Solo se descarga si se quita
 *   `data-paleta="calma"` del <html> (ver design/guia/README.md); con «Calma» el navegador no la pide.
 */
import "@fontsource-variable/figtree";
import "@fontsource-variable/inter";
