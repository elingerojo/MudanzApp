/**
 * El anillo de nombres de invitación (corte 4c-fix, decisión §42).
 *
 * Una sola lista, compartida por todos los eventos: la emisión toma la palabra siguiente a la última y
 * cierra el círculo al llegar a la vigésima. Así dos emisiones consecutivas del sistema nunca repiten
 * palabra, y la misma palabra vuelve a salir veinte emisiones después.
 *
 * Es **puro**: no lee la base, no lee el reloj y no recuerda nada. El puntero —cuál fue la última—
 * vive en `app.invitation_label_sequence` y lo mueve `issueInvitation`, que es quien puede hacerlo
 * dentro de una transacción.
 *
 * La lista es **solo de añadidos al final**: cambiar su orden o su longitud cambia el ciclo desde esa
 * emisión, no las etiquetas ya escritas. Las palabras son sustantivos concretos, en minúsculas y ASCII,
 * porque el nombre viaja en una URL y se dicta por teléfono.
 */
export const INVITATION_LABELS: readonly string[] = [
  'caja',
  'flete',
  'manta',
  'soga',
  'cinta',
  'guante',
  'diario',
  'radio',
  'silla',
  'mesa',
  'plato',
  'vaso',
  'cubo',
  'percha',
  'colchon',
  'libro',
  'juguete',
  'lampara',
  'cortina',
  'alfombra',
];

/**
 * La siguiente palabra del anillo.
 *
 * `null` —nadie ha emitido todavía— y una etiqueta ajena a la lista —solo posible por una edición
 * manual en la base— devuelven la primera: el anillo no se queda sin respuesta. Después de `alfombra`
 * vuelve `caja`.
 */
export function nextInvitationLabel(last: string | null): string {
  const first = INVITATION_LABELS[0];
  if (first === undefined) {
    throw new Error('invitation-label-list-empty');
  }

  const next = INVITATION_LABELS.indexOf(last ?? '') + 1;
  return INVITATION_LABELS[next % INVITATION_LABELS.length] ?? first;
}
