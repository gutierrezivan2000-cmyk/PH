// WhatsApp click-to-chat helpers. No Business API, no cost: we build wa.me
// links that open WhatsApp with the number and/or a prefilled message. Works
// from the resident portal (resident → admin, prefilled with their unit) and
// from the admin app (admin → resident, prefilled with a reminder/link).

/**
 * Normalize a Colombian phone number to WhatsApp's digits-only international
 * format. Returns null when there aren't enough digits to be a real number.
 * - strips spaces, dashes, parentheses, leading +
 * - 10-digit mobiles starting with 3 → prefixed with country code 57
 * - already-prefixed 57XXXXXXXXXX kept as-is
 * - other lengths returned as digits (best effort for non-CO numbers)
 */
export function normalizePhoneCO(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d]/g, "");
  if (d.length === 0) return null;
  // Drop a leading international "00".
  if (d.startsWith("00")) d = d.slice(2);
  // Colombian mobile: 10 digits starting with 3 → add country code.
  if (d.length === 10 && d.startsWith("3")) return `57${d}`;
  // Already 57 + 10 digits.
  if (d.length === 12 && d.startsWith("57")) return d;
  // Landline with indicative or other formats: require at least 7 digits.
  if (d.length >= 7) return d;
  return null;
}

/** Build a wa.me link to message a specific number with prefilled text. */
export function waLink(phone: string | null | undefined, text: string): string | null {
  const num = normalizePhoneCO(phone);
  if (!num) return null;
  const q = text ? `?text=${encodeURIComponent(text.slice(0, 1500))}` : "";
  return `https://wa.me/${num}${q}`;
}

/** Build a wa.me share link with NO number — opens WhatsApp so the sender
 *  picks a contact/broadcast. Handy when we don't have the recipient's phone. */
export function waShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text.slice(0, 1500))}`;
}

/** Message a resident sends to the admin FROM the portal — arrives already
 *  identified by unit, so the admin knows who is writing. */
export function residentToAdminMessage(propertyName: string, unitLabel: string): string {
  return `Hola, soy de la unidad ${unitLabel} de ${propertyName}. `;
}

/** Payment reminder the admin sends to a resident. */
export function paymentReminderMessage(opts: {
  propertyName: string;
  unitLabel: string;
  balanceText: string;
  portalUrl?: string;
}): string {
  const base = `Hola, le saludamos de la administración de ${opts.propertyName}. Le recordamos amablemente que su unidad ${opts.unitLabel} presenta un saldo pendiente de ${opts.balanceText}.`;
  return opts.portalUrl
    ? `${base} Puede consultar su estado de cuenta aquí: ${opts.portalUrl}`
    : `${base} Cualquier inquietud, quedamos atentos.`;
}

/** Message that shares a resident their private portal link. */
export function portalLinkMessage(opts: {
  propertyName: string;
  unitLabel: string;
  portalUrl: string;
}): string {
  return `Hola, este es el enlace a su portal de ${opts.propertyName} (unidad ${opts.unitLabel}), donde puede ver su estado de cuenta, comunicados y documentos. No necesita usuario ni contraseña: ${opts.portalUrl}`;
}
