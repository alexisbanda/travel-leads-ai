/** Nombre del secreto de una referencia `secret:NOMBRE`. */
export function secretName(ref: string): string {
  return ref.replace(/^secret:/, "");
}
