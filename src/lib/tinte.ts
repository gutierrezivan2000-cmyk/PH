/**
 * Tinte de un color de acento: el mismo color con transparencia.
 *
 * Existe porque hasta ahora los tintes se armaban concatenando el sufijo alfa
 * del hexadecimal (`${color}20`). Eso funcionaba cuando los colores eran
 * literales tipo `#7856f5`, pero al pasar la paleta a variables de tema —para
 * que el modo claro y el oscuro compartan las pantallas— el resultado pasó a
 * ser `var(--info)20`, que es CSS inválido: el navegador descarta la
 * declaración entera SIN avisar. El efecto visible era que los fondos y bordes
 * de acento (avatares de agente, insignias, tarjetas de la portada, KPIs)
 * desaparecían y las pantallas se veían planas.
 *
 * `color-mix` sí acepta `var()`, y además sirve igual para los colores que
 * siguen siendo hexadecimales (por ejemplo el `brandColor` que cada
 * administrador configura para su portal).
 *
 * @param color  Cualquier color CSS: `var(--info)`, `#7856f5`, `rgb(...)`.
 * @param alpha  Opacidad de 0 a 1.
 */
export function tinte(color: string, alpha: number): string {
  const pct = Math.max(0, Math.min(100, Math.round(alpha * 1000) / 10));
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}
