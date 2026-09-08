/**
 * Única definición de «URL de blob admisible».
 *
 * Existe como módulo propio porque la comprobación estaba duplicada en unos
 * sitios y AUSENTE en otros, y esa ausencia costaba caro: `fetchBlob` de
 * reglamento.ts reintentaba con la cabecera `Authorization: Bearer
 * <BLOB_READ_WRITE_TOKEN>` contra la URL que hubiera guardada, y esa URL la
 * podía escribir cualquier usuario a través de sus documentos de propiedad. Un
 * `http://servidor-del-atacante/x.pdf` bastaba para que la credencial de
 * escritura del almacenamiento saliera del servidor.
 */
export function isAllowedBlobUrl(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length === 0) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}
