import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReservasService } from '../reservas/reservas.service';

type Seat = { seat_id: number; seat_number: string; seat_class: string; is_occupied: boolean };

@Component({
  selector: 'app-seat-picker-modal, [appSeatPickerModal]',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './seat-picker-modal.component.html'
})
export class SeatPickerModalComponent {
  @Input() open = false;
  @Input() initialSeatCode: string | null = null;
  @Input() preferredClassName: string | null = null; // 'Negocios' | 'Económica'
  @Output() closed = new EventEmitter<void>();
  @Output() selected = new EventEmitter<string>();

  loading = false;
  seats: Seat[] = [];
  private seatIndex = new Map<string, Seat>();
  currentClassLabel: string = '';
  chosenCode: string | null = null;

  constructor(private api: ReservasService) {}

  ngOnChanges() {
    if (this.open) {
      this.loadSeats();
    }
  }

  private loadSeats() {
    this.loading = true;
    this.api.getAllSeats().subscribe({
      next: (res) => {
        const rows = Array.isArray(res?.data) ? res.data : res;
        this.seats = (rows || []).map((s: any) => ({ seat_id: s.seat_id, seat_number: s.seat_number, seat_class: s.seat_class, is_occupied: !!s.is_occupied }));
        this.seatIndex = new Map(this.seats.map(s => [s.seat_number, s]));
        // Determine initial class
        const initialClass = this.preferredClassName || this.seatIndex.get(this.initialSeatCode || '')?.seat_class || 'Económica';
        this.currentClassLabel = initialClass;
        // Preselect if provided and belongs to the class
        const code = this.initialSeatCode || null;
        if (code) this.chosenCode = code;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  close() { this.closed.emit(); }

  // Toggle between classes
  setClass(label: 'Negocios' | 'Económica') { this.currentClassLabel = label; }

  // Grid helpers (reuse distribution rules)
  get classType(): 'business' | 'economy' {
    const n = (this.currentClassLabel || '').toLowerCase();
    return n.includes('negocio') ? 'business' : 'economy';
  }
  get colOrder(): number[] { return this.classType === 'business' ? [1, 2] : [3, 4, 5, 6, 7]; }
  get rowGroups(): string[][] { return this.classType === 'business' ? [['I', 'G'], ['F', 'D'], ['C', 'A']] : [['I', 'H', 'G'], ['F', 'E', 'D'], ['C', 'B', 'A']]; }

  getSeat(row: string, col: number): { code: string; available: boolean } | null {
    const code = `${row}${col}`;
    const s = this.seatIndex.get(code);
    if (!s) return null;
    if (s.seat_class !== this.currentClassLabel) return null;
    return { code, available: !s.is_occupied };
  }

  onSelectSeat(code: string) {
    const s = this.seatIndex.get(code);
    if (!s) return;
    if (s.is_occupied) return;
    this.chosenCode = code;
  }

  confirm() {
    if (!this.chosenCode) return;
    this.selected.emit(this.chosenCode);
  }
}
