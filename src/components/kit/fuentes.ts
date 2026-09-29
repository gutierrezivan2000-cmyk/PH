/**
 * Fuentes del rediseño «Índice» (SPEC §b), autoalojadas con Fontsource.
 * Google Fonts no carga en este entorno y en producción bloquea el render.
 *
 * Lo importa UNA vez el armazón del dashboard y el de /empresa:
 *   import "@/components/kit/fuentes";
 * No toques el <link> de Google del layout raíz: lo usa la portada.
 *
 * - "Archivo Variable": ejes wght 100–900 y wdth 62–125 % (toda la interfaz).
 * - "IBM Plex Mono" 400/500/600: códigos, correos, NIT, unidad, cabeceras de columna.
 */
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
