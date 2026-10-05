/**
 * Marcar en un texto lo que se buscó (puro: lo usa el visor y lo prueba Vitest sin React).
 *
 * La búsqueda no distingue tildes ni mayúsculas («Reunión» encuentra «reunion»), así que no se puede buscar en el texto tal
 * cual: se normaliza carácter por carácter recordando de cuál carácter original salió cada uno, y los rangos que se
 * encuentran se llevan de vuelta al texto original. Así la marca cae exactamente sobre lo que la persona lee, también con
 * letras acentuadas, «ñ», emojis o tildes sueltas.
 */

export type TrozoDeTexto = { texto: string; marca: boolean };

const SIN_TILDES = /[̀-ͯ]/g;

/** Parte `texto` en trozos, con `marca: true` donde aparece alguna de las palabras buscadas (ya normalizadas, como las da `terminosDeBusqueda`). */
export function resaltarCoincidencias(texto: string, terminos: readonly string[]): TrozoDeTexto[] {
  const buscados = terminos.filter(Boolean);
  if (!texto || buscados.length === 0) return [{ texto, marca: false }];

  let normal = "";
  const inicioOriginal: number[] = []; // para cada carácter de `normal`: dónde empieza el carácter original que lo produjo
  const finOriginal: number[] = []; // …y dónde termina
  let posicion = 0;
  for (const caracter of texto) {
    const n = caracter.normalize("NFD").replace(SIN_TILDES, "").toLowerCase();
    // Una tilde suelta (e + ́) no aporta nada al texto normalizado, pero pertenece a la letra de antes: la marca la cubre
    // (si quedara fuera, la tilde se vería suelta al otro lado del borde de la marca).
    if (n.length === 0 && finOriginal.length > 0) finOriginal[finOriginal.length - 1] = posicion + caracter.length;
    for (let k = 0; k < n.length; k++) {
      inicioOriginal.push(posicion);
      finOriginal.push(posicion + caracter.length);
    }
    normal += n;
    posicion += caracter.length;
  }

  const rangos: Array<[number, number]> = [];
  for (const t of buscados) {
    for (let desde = normal.indexOf(t); desde !== -1; desde = normal.indexOf(t, desde + t.length)) {
      rangos.push([inicioOriginal[desde], finOriginal[desde + t.length - 1]]);
    }
  }
  if (rangos.length === 0) return [{ texto, marca: false }];

  // Se juntan los que se tocan o se pisan (dos palabras seguidas quedan en una sola marca).
  rangos.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const unidos: Array<[number, number]> = [];
  for (const r of rangos) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && r[0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], r[1]);
    else unidos.push([r[0], r[1]]);
  }

  const trozos: TrozoDeTexto[] = [];
  let cursor = 0;
  for (const [desde, hasta] of unidos) {
    if (desde > cursor) trozos.push({ texto: texto.slice(cursor, desde), marca: false });
    trozos.push({ texto: texto.slice(desde, hasta), marca: true });
    cursor = hasta;
  }
  if (cursor < texto.length) trozos.push({ texto: texto.slice(cursor), marca: false });
  return trozos;
}

/** «1 coincidencia», «12 coincidencias»; con `hayMas`, «Más de 200 coincidencias». */
export function textoDeCoincidencias(cantidad: number, hayMas: boolean): string {
  if (hayMas) return `Más de ${cantidad} coincidencias`;
  if (cantidad === 0) return "Sin coincidencias";
  return cantidad === 1 ? "1 coincidencia" : `${cantidad} coincidencias`;
}
