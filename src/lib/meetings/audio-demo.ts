/**
 * El audio del demo: un MP3 de verdad (CBR, 32 kbps, 16 kHz, mono: igual que el `audio.mp3` real) hecho solo de tramas en
 * silencio. No se guarda en ningún lado: cada byte se calcula por su posición, así una reunión de 8 h «pesa» 115 MB y se
 * sirve por rangos sin gastar memoria. El reproductor, los saltos y la velocidad funcionan igual que con audio real; solo
 * que no suena nada.
 *
 * Una trama MPEG-2 capa III a 32 kbps y 16 kHz mide 144 bytes y dura 36 ms (576 muestras): cabecera `FF F3 48 C4` y el
 * resto en ceros (información lateral vacía = sin coeficientes = silencio).
 */
export const BYTES_POR_TRAMA = 144;
export const MS_POR_TRAMA = 36;

const CABECERA = [0xff, 0xf3, 0x48, 0xc4] as const;

/** Cuántos bytes tiene el audio del demo para una duración (siempre tramas completas). */
export const bytesDeAudioDemo = (duracionMs: number): number => Math.max(1, Math.ceil(Math.max(0, duracionMs) / MS_POR_TRAMA)) * BYTES_POR_TRAMA;

/** Los bytes `[desde, hasta]` (inclusive) del audio del demo. */
export function leerAudioDemo(duracionMs: number, desde: number, hasta: number): Uint8Array {
  const total = bytesDeAudioDemo(duracionMs);
  const d = Math.max(0, Math.floor(desde));
  const h = Math.min(total - 1, Math.floor(hasta));
  if (h < d) return new Uint8Array(0);
  const salida = new Uint8Array(h - d + 1);
  // Todo es ceros salvo los cuatro primeros bytes de cada trama.
  for (let pos = d - (d % BYTES_POR_TRAMA); pos <= h; pos += BYTES_POR_TRAMA) {
    for (let k = 0; k < CABECERA.length; k++) {
      const i = pos + k;
      if (i >= d && i <= h) salida[i - d] = CABECERA[k];
    }
  }
  return salida;
}

/** Lo mismo como flujo, en trozos (para `Response`). */
export function flujoDeAudioDemo(duracionMs: number, desde: number, hasta: number, trozo = 64 * 1024): ReadableStream<Uint8Array> {
  let siguiente = Math.max(0, Math.floor(desde));
  const fin = Math.min(bytesDeAudioDemo(duracionMs) - 1, Math.floor(hasta));
  return new ReadableStream<Uint8Array>({
    pull(control) {
      if (siguiente > fin) return control.close();
      const hasta2 = Math.min(fin, siguiente + trozo - 1);
      control.enqueue(leerAudioDemo(duracionMs, siguiente, hasta2));
      siguiente = hasta2 + 1;
    },
  });
}
