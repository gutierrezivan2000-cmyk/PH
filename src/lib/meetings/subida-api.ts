/**
 * Las llamadas reales de la subida: nuestro servidor (token y registro) y Vercel Blob (partes).
 *
 * Lo importante aquí es CLASIFICAR cada fallo para que el motor (subida-reanudable.ts) sepa qué hacer:
 * un permiso vencido se renueva, una subida que ya no existe se empieza de nuevo, un corte de red se
 * reintenta y un rechazo definitivo (tipo no admitido, reunión cerrada) se muestra sin insistir.
 * Los mensajes del SDK de Blob están en inglés y la clase del error se pierde al minificar, así que se
 * reconocen por su texto.
 */
import { completeMultipartUpload, createMultipartUpload, uploadPart } from "@vercel/blob/client";
import { ErrorSubida, esAborto, errorDeAborto, type ApiSubida, type PermisoSubida } from "./subida-reanudable";

/* ── Fallos de Blob ──────────────────────────────────────────────────── */

/** Convierte lo que lance el SDK en un ErrorSubida (o deja pasar un aborto nuestro). */
export function clasificarErrorBlob(e: unknown): Error {
  if (e instanceof ErrorSubida || esAborto(e)) return e as Error;
  const mensaje = e instanceof Error ? e.message : String(e);

  if (/client token has expired|token expired|access denied.*valid token/i.test(mensaje)) {
    return new ErrorSubida("El permiso de subida venció.", "token");
  }
  if (/content type mismatch/i.test(mensaje)) {
    return new ErrorSubida("Ese tipo de archivo no se puede subir. Usa audio o video (MP3, M4A, WAV, MP4…).", "fatal");
  }
  if (/file is too large|cannot be greater than/i.test(mensaje)) {
    return new ErrorSubida("El archivo es más grande de lo que admitimos por archivo. Pártelo en varios y súbelos todos.", "fatal");
  }
  if (/store (does not exist|has been suspended)|does not match the token payload/i.test(mensaje)) {
    return new ErrorSubida("El almacenamiento de grabaciones no está disponible ahora. Avisa a soporte.", "fatal");
  }
  // Un «bad request» del servicio (el SDK lo muestra como «Vercel Blob: <motivo>»): la subida o sus partes
  // ya no son válidas. Se empieza de nuevo en vez de reintentar lo mismo.
  if (/^vercel blob: /i.test(mensaje) || /no such upload|upload ?id|invalid part|upload.*(not found|expired|does not exist)/i.test(mensaje)) {
    return new ErrorSubida(mensaje, "caducada");
  }
  // Sin servicio, saturación, error desconocido, red caída («Failed to fetch», «Load failed»…): pasajero.
  return new ErrorSubida(mensaje, "transitorio");
}

/* ── Nuestro servidor ────────────────────────────────────────────────── */

async function llamar(url: string, cuerpo: unknown, senal: AbortSignal): Promise<{ status: number; json: Record<string, unknown> | null }> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo), signal: senal });
  } catch (e) {
    if (senal.aborted || esAborto(e)) throw errorDeAborto();
    throw new ErrorSubida("No hay conexión con el servidor.", "transitorio");
  }
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* sin cuerpo JSON */
  }
  return { status: res.status, json };
}

const mensajeDe = (json: Record<string, unknown> | null, porDefecto: string) =>
  typeof json?.error === "string" && json.error ? json.error : porDefecto;

/** Un 5xx o un 429 se reintenta; cualquier otro estado de error es un rechazo definitivo. */
const pasajero = (status: number) => status >= 500 || status === 429 || status === 408;

export function crearApiSubida(meetingId: string): ApiSubida {
  const base = `/api/meetings/${encodeURIComponent(meetingId)}`;
  return {
    async pedirToken(datos, senal) {
      const { status, json } = await llamar(`${base}/upload-token`, datos, senal);
      if (status === 200 && json && typeof json.token === "string" && typeof json.pathname === "string") {
        return json as unknown as PermisoSubida;
      }
      if (status === 401) throw new ErrorSubida("Tu sesión terminó. Vuelve a iniciar sesión y retoma la subida.", "fatal");
      throw new ErrorSubida(mensajeDe(json, "No pudimos preparar la subida."), pasajero(status) ? "transitorio" : "fatal");
    },

    async crearMultipart({ pathname, token, contentType }, senal) {
      try {
        return await createMultipartUpload(pathname, { access: "private", token, contentType, abortSignal: senal });
      } catch (e) {
        throw clasificarErrorBlob(e);
      }
    },

    async subirParte({ pathname, token, key, uploadId, numero, cuerpo, contentType, alProgreso }, senal) {
      try {
        const parte = await uploadPart(pathname, cuerpo, {
          access: "private", token, key, uploadId, partNumber: numero, contentType, abortSignal: senal,
          onUploadProgress: ({ loaded }) => alProgreso(loaded),
        });
        return { etag: parte.etag, partNumber: parte.partNumber };
      } catch (e) {
        throw clasificarErrorBlob(e);
      }
    },

    async completar({ pathname, token, key, uploadId, partes, contentType }, senal) {
      try {
        const r = await completeMultipartUpload(pathname, partes, { access: "private", token, key, uploadId, contentType, abortSignal: senal });
        return { url: r.url, pathname: r.pathname };
      } catch (e) {
        throw clasificarErrorBlob(e);
      }
    },

    async registrar(datos, senal) {
      const { status, json } = await llamar(`${base}/sources`, datos, senal);
      if (status === 200 || status === 201) return;
      const mensaje = mensajeDe(json, "No pudimos registrar el archivo.");
      // «No encontramos el archivo…» / «No llegó completo…»: lo subido no sirve → se vuelve a subir.
      if ((status === 400 || status === 409) && /vuelve a subirlo/i.test(mensaje)) throw new ErrorSubida(mensaje, "caducada");
      if (status === 401) throw new ErrorSubida("Tu sesión terminó. Vuelve a iniciar sesión y retoma la subida.", "fatal");
      throw new ErrorSubida(mensaje, pasajero(status) ? "transitorio" : "fatal");
    },
  };
}

/* ── Modo demo: el servidor es real (token y registro), Blob es de mentira ── */

/**
 * Cada parte «viaja» a 16 MB/s (tres a la vez: ~48 MB/s en total): una grabación de 1 GB «sube» en
 * unos 20 s, lo justo para ver el avance, pausar y reanudar.
 */
export function crearApiSimulada(meetingId: string, bytesPorSegundo = 16 * 1024 * 1024): ApiSubida {
  const real = crearApiSubida(meetingId);
  const dormir = (ms: number, senal: AbortSignal) =>
    new Promise<void>((resolver, rechazar) => {
      if (senal.aborted) return rechazar(errorDeAborto());
      const t = setTimeout(() => {
        senal.removeEventListener("abort", alAbortar);
        resolver();
      }, ms);
      const alAbortar = () => {
        clearTimeout(t);
        rechazar(errorDeAborto());
      };
      senal.addEventListener("abort", alAbortar, { once: true });
    });

  return {
    pedirToken: real.pedirToken,
    registrar: real.registrar,
    async crearMultipart() {
      return { key: `demo-${Date.now()}`, uploadId: `demo-up-${Math.random().toString(36).slice(2)}` };
    },
    async subirParte({ numero, cuerpo, alProgreso }, senal) {
      const pasos = 8;
      const porPaso = Math.max(20, (cuerpo.size / bytesPorSegundo / pasos) * 1000);
      for (let i = 1; i <= pasos; i++) {
        await dormir(porPaso, senal);
        alProgreso(Math.round((cuerpo.size * i) / pasos));
      }
      return { etag: `demo-etag-${numero}`, partNumber: numero };
    },
    async completar({ pathname }) {
      return { url: `https://demo.private.blob.vercel-storage.com/${pathname}`, pathname };
    },
  };
}
