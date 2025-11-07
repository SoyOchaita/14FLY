import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';
import { SeatPickerModalComponent } from './seat-picker-modal.component';

export interface ImportSummary {
  total: number;
  ok: number;
  errors: number; // conteo numérico
  elapsedMs: number;
  successes?: Array<any>;
  errorItems?: Array<any>; // lista detallada
}

@Component({
  selector: 'app-admin-import-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SeatPickerModalComponent],
  templateUrl: './admin-import-modal.component.html'
})
export class AdminImportModalComponent implements OnChanges {
  @Input() open = false;
  @Input() uploading = false;
  @Input() summary: ImportSummary | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() upload = new EventEmitter<File>();
  @Output() viewDiagram = new EventEmitter<void>();

  file: File | null = null;
  seats: Array<{ seat_number: string; is_occupied: boolean; seat_class?: string }> = [];
  loadingSeats = false;
  retrying: Record<number, boolean> = {};
  editRow: Record<number, { userEmail: string; seatNumber: string }> = {};
  showPreview = false;
  retryAllProgress: { total: number; done: number } | null = null;

  // Seat picker modal state
  seatPickerOpen = false;
  seatPickerIndex: number | null = null;
  seatPickerInitialCode: string | null = null;
  seatPickerPreferredClass: string | null = null;

  // Wizard state
  step: 1 | 2 | 3 = 1; // 1: Resumen, 2: Corregir, 3: Vista
  currentErrorIndex = 0;

  constructor(private http: HttpClient, private auth: AuthService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      if (!this.seats.length) this.loadAvailableSeats();
    }
    if (changes['summary']) {
      // Resetear estados internos para evitar quedar "trabado" entre cargas
      this.retryAllProgress = null;
      this.retrying = {};
      this.editRow = {};
      this.showPreview = false;
      this.step = 1;
      this.currentErrorIndex = 0;
    }
  }

  private loadAvailableSeats() {
    this.loadingSeats = true;
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    this.http.get<any>('/api/seats', { headers }).subscribe({
      next: (res) => {
        const data = res?.data || [];
        this.seats = Array.isArray(data) ? data : [];
        this.loadingSeats = false;
      },
      error: () => { this.loadingSeats = false; }
    });
  }

  pick(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.file = input?.files?.[0] || null;
  }
  startUpload() {
    if (this.file) this.upload.emit(this.file);
  }
  close() {
    this.file = null;
    this.closed.emit();
  }

  humanizeError(e: any): string {
    const code = (e?.error || e?.message || '').toString().toLowerCase();
    switch (code) {
      case 'usuario-no-existe':
        return 'El usuario (correo) no existe en el sistema';
      case 'asiento-no-existe':
        return 'El asiento no existe';
      case 'asiento-ocupado':
        return 'El asiento ya está ocupado';
      case 'campos obligatorios faltantes (seatnumber, passengername, user, idnumber).':
      case 'campos obligatorios faltantes (seatnumber, passengername, user, idnumber)':
        return 'Faltan campos obligatorios (seatNumber, passengerName, user, idNumber)';
      default:
        return e?.error || e?.message || 'Error desconocido';
    }
  }

  suggestSeats(): string[] {
    return this.seats.filter(s => !s.is_occupied).map(s => s.seat_number);
  }

  beginEdit(i: number, e: any) {
    this.editRow[i] = {
      userEmail: e?.userEmail || e?.user || '',
      seatNumber: e?.seatNumber || e?.seat || e?.seat_code || ''
    };
  }
  cancelEdit(i: number) {
    delete this.editRow[i];
  }

  openSeatPicker(i: number, e: any) {
    if (!this.editRow[i]) this.beginEdit(i, e);
    const code = this.editRow[i].seatNumber || e?.seatNumber || e?.seat || e?.seat_code || null;
    this.seatPickerIndex = i;
    this.seatPickerInitialCode = code;
    // If we know the class from current seats list, pass it as preference
    const found = this.seats.find(s => (s.seat_number || '').toUpperCase() === String(code || '').toUpperCase());
    this.seatPickerPreferredClass = found?.seat_class || null;
    this.seatPickerOpen = true;
  }

  onSeatPicked(code: string) {
    if (this.seatPickerIndex === null) { this.seatPickerOpen = false; return; }
    const i = this.seatPickerIndex;
    if (!this.editRow[i]) this.editRow[i] = { userEmail: '', seatNumber: '' } as any;
    this.editRow[i].seatNumber = code;
    this.seatPickerOpen = false;
  }

  async retryOne(i: number, e: any) {
    const edit = this.editRow[i];
    if (!edit) return;
    this.retrying[i] = true;
    try {
      const passengerName = e?.passengerName || e?.passenger || '';
      const idNumber = e?.idNumber || e?.cui || '';
      const hasLuggage = e?.hasLuggage === true || String(e?.hasLuggage).toLowerCase() === 'true';
      const xml = this.buildSingleSeatXML({
        seatNumber: edit.seatNumber || e?.seatNumber,
        passengerName,
        user: edit.userEmail || e?.userEmail,
        idNumber,
        hasLuggage,
        reservationDate: ''
      });
      const token = this.auth.getToken();
      const headers = new HttpHeaders({
        'Content-Type': 'application/xml',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      });
  const res: any = await this.http.post('/api/reports/reservations.xml/upload', xml, { headers }).toPromise();
      const data = res?.data || {};
      if (Number(data.ok || 0) >= 1 && Number(data.errors || 0) === 0) {
        // éxito: actualizar resumen local, mover error a éxito y limpiar edición
        if (this.summary) {
          this.summary.ok = Number(this.summary.ok || 0) + 1;
          this.summary.errors = Math.max(0, Number(this.summary.errors || 0) - 1);
          // Sacar del errorItems
          const list = (this.summary.errorItems || []) as any[];
          const idx = list.indexOf(e);
          if (idx >= 0) list.splice(idx, 1);
          else list.splice(Math.min(i, Math.max(0, list.length - 1)), 1);
          this.summary.errorItems = list;
          // Agregar a successes para resaltado posterior
          const successEntry = { seat_code: edit.seatNumber } as any;
          if (!Array.isArray(this.summary.successes)) this.summary.successes = [];
          this.summary.successes.push(successEntry);
          // Ajustar índice actual si estamos en paso 2
          if (this.step === 2) {
            const remaining = this.summary.errorItems.length;
            this.currentErrorIndex = Math.max(0, Math.min(this.currentErrorIndex, remaining - 1));
            if (remaining === 0) this.step = 3;
          }
        }
        delete this.editRow[i];
      } else {
        // falló de nuevo, actualizar el motivo del error
        const firstErr = Array.isArray(data.errors) && data.errors.length ? data.errors[0] : null;
        e.error = firstErr?.error || firstErr?.message || 'Error al reintentar';
      }
    } catch (err: any) {
      e.error = err?.error?.message || err?.message || 'Error de red al reintentar';
    } finally {
      this.retrying[i] = false;
    }
  }

  async retryAllEdited() {
    if (!this.summary || !Array.isArray(this.summary.errorItems)) return;
    const indices = Object.keys(this.editRow).map(n => Number(n)).filter(n => !isNaN(n)).sort((a,b) => b - a);
    this.retryAllProgress = { total: indices.length, done: 0 };
    for (const i of indices) {
      const e = this.summary.errorItems[i];
      if (!e) { this.retryAllProgress.done++; continue; }
      await this.retryOne(i, e);
      this.retryAllProgress.done++;
    }
    // limpiar progreso tras breve delay
    setTimeout(() => { this.retryAllProgress = null; }, 600);
  }

  async retryAll() {
    if (!this.summary || !Array.isArray(this.summary.errorItems)) return;
    // Prepara ediciones con valores tal y como vienen (sin cambios) para cada fila
    this.editRow = {};
    this.summary.errorItems.forEach((e: any, i: number) => {
      this.editRow[i] = {
        userEmail: e?.userEmail || e?.user || '',
        seatNumber: e?.seatNumber || e?.seat || e?.seat_code || ''
      };
    });
    await this.retryAllEdited();
  }

  openPreview() { this.showPreview = true; }
  closePreview() { this.showPreview = false; }

  seatStatus(code: string): 'available' | 'occupied' | 'unknown' {
    const s = this.seats.find(x => (x.seat_number || '').toUpperCase() === String(code || '').toUpperCase());
    if (!s) return 'unknown';
    return s.is_occupied ? 'occupied' : 'available';
  }

  private buildSingleSeatXML(item: { seatNumber: string; passengerName: string; user: string; idNumber: string; hasLuggage: boolean; reservationDate: string }) {
    const esc = (s: any) => String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
    const d = item.reservationDate || '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<flightReservation>\n  <flightSeat>\n    <seatNumber>${esc(item.seatNumber)}</seatNumber>\n    <passengerName>${esc(item.passengerName)}</passengerName>\n    <user>${esc(item.user)}</user>\n    <idNumber>${esc(item.idNumber)}</idNumber>\n    <hasLuggage>${item.hasLuggage ? 'true' : 'false'}</hasLuggage>\n    <reservationDate>${esc(d)}</reservationDate>\n  </flightSeat>\n</flightReservation>`;
  }

  // Wizard helpers
  get errorItems(): any[] { return (this.summary?.errorItems || []) as any[]; }
  get hasErrors(): boolean { return this.errorItems.length > 0; }
  gotoStep(n: 1 | 2 | 3) {
    if (n === 2 && !this.hasErrors) { this.step = 3; return; }
    this.step = n;
    if (n === 2) this.ensureEditForCurrent();
  }
  nextStep() {
    if (this.step === 1) this.gotoStep(this.hasErrors ? 2 : 3);
    else if (this.step === 2) this.gotoStep(3);
  }
  prevStep() {
    if (this.step === 3) this.gotoStep(this.hasErrors ? 2 : 1);
    else if (this.step === 2) this.gotoStep(1);
  }

  get currentError(): any | null {
    return this.errorItems[this.currentErrorIndex] || null;
  }
  nextError() {
    if (!this.hasErrors) return;
    this.currentErrorIndex = Math.min(this.errorItems.length - 1, this.currentErrorIndex + 1);
    this.ensureEditForCurrent();
  }
  prevError() {
    if (!this.hasErrors) return;
    this.currentErrorIndex = Math.max(0, this.currentErrorIndex - 1);
    this.ensureEditForCurrent();
  }
  ensureEditForCurrent() {
    const i = this.currentErrorIndex;
    const e = this.currentError;
    if (!e) return;
    if (!this.editRow[i]) {
      this.editRow[i] = {
        userEmail: e?.userEmail || e?.user || '',
        seatNumber: e?.seatNumber || e?.seat || e?.seat_code || ''
      };
    }
  }
}
