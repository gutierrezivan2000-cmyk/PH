/**
 * ¿Los primeros bytes son de un contenedor de audio/video conocido? Lista cerrada de firmas: un texto (p. ej. una lista
 * «#EXTM3U» de HLS, que ffmpeg seguiría descargando de la red del servidor) o cualquier otra cosa NO pasa.
 *
 * Es la misma comprobación de la ruta de fuentes (`sources/route.ts`, que conserva su copia), para quien más necesite validar
 * lo que se va a dar a ffmpeg.
 */
const ascii = (b: Uint8Array, pos: number, txt: string) => [...txt].every((c, i) => b[pos + i] === c.charCodeAt(0));

export function esFirmaDeMedios(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  if (ascii(b, 0, "ID3") || ascii(b, 0, "OggS") || ascii(b, 0, "fLaC") || ascii(b, 4, "ftyp")) return true;
  if (ascii(b, 0, "RIFF") && (ascii(b, 8, "WAVE") || ascii(b, 8, "AVI "))) return true;
  if (ascii(b, 0, "FORM") && (ascii(b, 8, "AIFF") || ascii(b, 8, "AIFC"))) return true;
  if (ascii(b, 0, "#!AMR")) return true;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return true; // EBML (webm / mkv)
  if (b[0] === 0x30 && b[1] === 0x26 && b[2] === 0xb2 && b[3] === 0x75) return true; // ASF (wma / wmv)
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && (b[3] === 0xba || b[3] === 0xb3)) return true; // MPEG-PS / video
  if (b[0] === 0x47 && b.length > 188 && b[188] === 0x47) return true; // MPEG-TS
  // Trama MPEG de audio o ADTS: sincronía de 11 bits y campos de cabecera válidos.
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ((b[1] >> 3) & 3) !== 1) {
    const adts = ((b[1] >> 1) & 3) === 0;
    if (adts) return true;
    return (b[2] >> 4) !== 0xf && ((b[2] >> 2) & 3) !== 3;
  }
  return false;
}

/**
 * La primera parte de una sesión de la grabadora (`seq` 0) lleva la cabecera del contenedor que produce `MediaRecorder`:
 * EBML (webm), `ftyp` (mp4 fragmentado de Safari) u `OggS` (ogg). Las demás partes son continuación sin cabecera, así que
 * solo ésta se puede (y se debe) comprobar. Más estricta que `esFirmaDeMedios`: no acepta lo que la grabadora nunca emite.
 */
export function esCabeceraDeGrabadora(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  const ebml = b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
  return ebml || ascii(b, 4, "ftyp") || ascii(b, 0, "OggS");
}
