import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReservasService } from '../reservas.service';
import { ToastService } from '../../ui/toast/toast.service';

@Component({
  selector: 'app-edit-reserva-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-reserva-modal.component.html'
})
export class EditReservaModalComponent {
  @Input() reservation!: { reservation_id: number; seat_code: string; full_name: string; cui: string; has_bag: boolean; seat_class?: string };
  @Output() closed = new EventEmitter<void>();
  @Output() updated = new EventEmitter<{ reservation_id: number; new_seat_code?: string }>();

  editModel: { id: number; seat_code: string; new_seat_code: string | null; has_bag: boolean; full_name: string; cui: string; seat_class?: string } | null = null;
  editError: string | null = null;
  editQuote: { base: number; total: number; seatChanged: boolean; vipApplied: boolean; discount: number; prevFee: number; addedFee: number } | null = null;

  allSeats: Array<{ seat_id: number; seat_number: string; seat_class: string; is_occupied: boolean }> = [];
  availableSeats: Array<{ seat_id: number; seat_number: string; seat_class: string; is_occupied: boolean }> = [];
  private seatIndex = new Map<string, { seat_id: number; seat_number: string; seat_class: string; is_occupied: boolean }>();
  private quoteTimer: any = null;
  private editClassType: 'business' | 'economy' = 'economy';

  constructor(private api: ReservasService, private toast: ToastService) {}

  ngOnInit() {
    const r = this.reservation;
    this.editModel = { id: r.reservation_id, seat_code: r.seat_code, new_seat_code: r.seat_code, has_bag: !!r.has_bag, full_name: r.full_name, cui: r.cui, seat_class: r.seat_class };
    this.api.getAllSeats().subscribe({
      next: (res) => {
        const rows = Array.isArray(res?.data) ? res.data : res;
        this.allSeats = (rows || []).map((s: any) => ({ seat_id: s.seat_id, seat_number: s.seat_number, seat_class: s.seat_class, is_occupied: !!s.is_occupied }));
        this.seatIndex = new Map(this.allSeats.map((s) => [s.seat_number, s]));
        const className = (r.seat_class || this.seatIndex.get(r.seat_code)?.seat_class || '').toString();
        this.editClassType = this.seatClassToType(className);
        this.availableSeats = this.allSeats.filter((s) => (s.seat_class === className) && (!s.is_occupied || s.seat_number === r.seat_code));
        this.triggerQuote();
      },
      error: () => {
        this.availableSeats = [];
      }
    });
  }

  close() {
    this.closed.emit();
  }

  save() {
    if (!this.editModel) return;
    const m = this.editModel;
    const changeSeat = m.new_seat_code && m.new_seat_code !== m.seat_code;
    let seat_id: number | undefined = undefined;
    if (changeSeat) {
      const found = this.availableSeats.find((s) => s.seat_number === m.new_seat_code);
      if (!found) {
        this.toast.error('Asiento seleccionado inválido.');
        return;
      }
      seat_id = found.seat_id;
    }
    this.api.updateReservation(m.id, { seat_id, has_luggage: !!m.has_bag, full_name: m.full_name, cui: m.cui }).subscribe({
      next: () => {
        this.toast.success('Reserva actualizada');
        this.toast.info('Te enviamos un correo con el detalle de la modificación.');
        this.updated.emit({ reservation_id: m.id, new_seat_code: changeSeat ? m.new_seat_code || undefined : undefined });
        this.close();
      },
      error: (err) => {
        this.editError = err?.error?.message || 'No se pudo actualizar la reserva';
      }
    });
  }

  // Map helpers
  get colOrder(): number[] { return this.editClassType === 'business' ? [1, 2] : [3, 4, 5, 6, 7]; }
  get rowGroups(): string[][] { return this.editClassType === 'business' ? [['I', 'G'], ['F', 'D'], ['C', 'A']] : [['I', 'H', 'G'], ['F', 'E', 'D'], ['C', 'B', 'A']]; }
  getSeat(row: string, col: number): { code: string; available: boolean } | null {
    const code = `${row}${col}`;
    const s = this.seatIndex.get(code);
    if (!s) return null;
    const targetClassName = this.currentClassLabel || this.editModel?.seat_class || '';
    if (s.seat_class !== targetClassName) return null;
    const currentCode = this.editModel?.seat_code;
    const isAvailable = !s.is_occupied || s.seat_number === currentCode;
    return { code, available: isAvailable };
  }
  isChosen(code: string): boolean { return this.editModel?.new_seat_code === code; }
  onSelectSeat(code: string) {
    if (!this.editModel) return;
    const s = this.seatIndex.get(code);
    if (!s) return;
    if (s.is_occupied && code !== this.editModel.seat_code) return;
    this.editModel.new_seat_code = code;
    this.triggerQuote();
  }

  onToggleBag() { this.triggerQuote(); }

  private triggerQuote() {
    if (!this.editModel) return;
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
    this.quoteTimer = setTimeout(() => {
      const m = this.editModel!;
      const changeSeat = m.new_seat_code && m.new_seat_code !== m.seat_code;
      let seat_id: number | undefined = undefined;
      if (changeSeat) {
        const found = this.availableSeats.find((s) => s.seat_number === m.new_seat_code);
        if (found) seat_id = found.seat_id;
      }
      this.api.quoteReservation(m.id, { seat_id, has_luggage: !!m.has_bag }).subscribe({
        next: (res) => {
          const d = res?.data || {};
          this.editQuote = { base: Number(d.base || 0), total: Number(d.total || 0), seatChanged: !!d.seatChanged, vipApplied: !!d.vip_applied || !!d.discount_applied, discount: Number(d.discount || 0), prevFee: Number(d.fee_accumulated || 0), addedFee: Number(d.fee_added || 0) };
        },
        error: () => { this.editQuote = null; }
      });
    }, 250);
  }

  // Desglose de precios para mostrar el +10% y VIP claramente
  get basePrice(): number { return this.editQuote ? this.editQuote.base : 0; }
  get changeFee(): number { return this.editQuote ? Math.round(this.editQuote.addedFee * 100) / 100 : 0; }
  get accumulatedFee(): number { return this.editQuote ? Math.round(this.editQuote.prevFee * 100) / 100 : 0; }
  get vipDiscount(): number { return this.editQuote ? Math.round((this.editQuote.discount || 0) * 100) / 100 : 0; }
  get previewTotal(): number { return this.editQuote ? this.editQuote.total : 0; }

  get currentClassLabel(): string {
    if (!this.editModel) return '';
    const cur = this.seatIndex.get(this.editModel.seat_code);
    return cur?.seat_class || this.editModel.seat_class || '';
  }

  get newClassLabel(): string {
    if (!this.editModel) return '';
    const code = this.editModel.new_seat_code || this.editModel.seat_code;
    const s = this.seatIndex.get(code);
    return s?.seat_class || '';
  }

  private seatClassToType(name: string): 'business' | 'economy' {
    const n = (name || '').toLowerCase();
    if (n.includes('negocio')) return 'business';
    return 'economy';
  }
}
