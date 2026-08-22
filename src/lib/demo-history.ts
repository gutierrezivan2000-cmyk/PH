/**
 * Saneamiento del hilo de conversación que el navegador envía en modo demo.
 *
 * En demo no hay base de datos donde guardar el chat (el `db` es un Proxy que
 * lanza), así que el historial viaja en el cuerpo de la petición. Al venir del
 * cliente es entrada NO CONFIABLE: podría traer roles inventados para colarse
 * en el contexto del modelo, o mensajes enormes para inflar el costo.
 */

export interface DemoMessage {
  role: string;
  content: string;
  attachments: unknown;
}

export function sanitizeDemoHistory(
  history: unknown,
  currentMessage: string,
  opts: { maxMessages?: number; perMessageCap?: number; currentAttachments?: unknown } = {}
): DemoMessage[] {
  const maxMessages = opts.maxMessages ?? 20;
  const cap = opts.perMessageCap ?? 4000;

  const previos = Array.isArray(history) ? history.slice(-maxMessages) : [];
  const out: DemoMessage[] = previos
    .filter(
      (m): m is { role: string; content: string } =>
        !!m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, cap), attachments: null }));

  // La API de Anthropic exige que el primer mensaje sea del usuario.
  while (out.length > 0 && out[0].role !== "user") out.shift();

  out.push({ role: "user", content: currentMessage, attachments: opts.currentAttachments ?? null });
  return out;
}
