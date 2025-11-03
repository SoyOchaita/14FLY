import { Pipe, PipeTransform } from '@angular/core';

/**
 * asLocalDate
 * - Si recibe una cadena ISO sin zona horaria (sin 'Z' ni "+/-hh:mm"),
 *   la interpreta como UTC y la convierte a Date local.
 * - Si recibe ISO con zona horaria, o un Date, lo devuelve tal cual.
 */
@Pipe({
  name: 'asLocalDate',
  standalone: true
})
export class AsLocalDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;

    const s = String(value);
    // Detecta si ya tiene indicación de zona horaria (Z o +hh:mm / -hh:mm)
    const hasTz = /Z|[+-]\d{2}:?\d{2}$/.test(s);
    if (hasTz) {
      return new Date(s);
    }
    // Tratar como UTC explícito
    return new Date(s + 'Z');
  }
}
