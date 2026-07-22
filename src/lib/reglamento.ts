// Resident reglamento assistant — pulls the property's reglamento/manual text
// so the AI can answer residents' questions from it. Text is extracted from
// the stored documents once and cached on PropertyDocument.extractedText.

const MAX_TOTAL_CHARS = 45000; // keep the prompt within budget

/** Fetch a (possibly private) blob into a Buffer. Tries a plain fetch, then
 *  a token-authenticated one. Returns null if unreachable. */
async function fetchBlob(url: string): Promise<Buffer | null> {
  const attempts: RequestInit[] = [{}];
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) attempts.push({ headers: { authorization: `Bearer ${token}` } });
  for (const init of attempts) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Returns the concatenated reglamento/manual text for a property, extracting
 * and caching it on first use. Returns "" when nothing is available.
 */
export async function getReglamentoText(propertyId: string): Promise<string> {
  const { db } = await import("@/lib/db");
  const docs = await db.propertyDocument.findMany({
    where: { propertyId, type: { in: ["reglamento_interno", "manual_convivencia", "otro"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, url: true, mimeType: true, extractedText: true },
  });
  if (docs.length === 0) return "";

  const parts: string[] = [];
  let total = 0;

  for (const doc of docs) {
    if (total >= MAX_TOTAL_CHARS) break;

    let text = doc.extractedText || "";
    if (!text) {
      const buf = await fetchBlob(doc.url);
      if (!buf) continue;
      try {
        const { parseFile } = await import("@/lib/parsers");
        const file = new File([new Uint8Array(buf)], doc.name, { type: doc.mimeType || "application/octet-stream" });
        const parsed = await parseFile(file);
        text = (parsed.text || "").trim();
      } catch {
        text = "";
      }
      // Cache whatever we got (even empty avoids re-fetching a bad file, but we
      // only cache non-trivial text so a transient failure can retry later).
      if (text.length > 20) {
        await db.propertyDocument.update({ where: { id: doc.id }, data: { extractedText: text.slice(0, 200000) } }).catch(() => {});
      }
    }

    if (text.length > 20) {
      const remaining = MAX_TOTAL_CHARS - total;
      const chunk = text.slice(0, remaining);
      parts.push(`--- ${doc.name} ---\n${chunk}`);
      total += chunk.length;
    }
  }

  return parts.join("\n\n");
}
