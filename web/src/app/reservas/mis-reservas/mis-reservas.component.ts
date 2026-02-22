import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReservasService } from '../reservas.service';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../ui/toast/toast.service';

@Component({
  selector: 'app-mis-reservas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mis-reservas.component.html',
  styleUrl: './mis-reservas.component.scss'
})
export class MisReservasComponent implements OnInit {
  reservas: Array<{ reservation_id: number; seat_code: string; created_at: string; full_name: string; cui: string; has_bag: boolean; batch_id?: string | null; seat_class?: string; total?: number; price_base?: number }> = [];
  grupos: Array<{
    batch_id: string;
    created_at: string; // del primer item
    count: number;
    classes: string[]; // únicas
    sum_base: number;
    sum_total: number;
    items: any[];
  }> = [];
  highlightId: number | null = null;
  // Modal edición
  showEditModal = false;
  editModel: { id: number; seat_code: string; has_bag: boolean; new_seat_code: string | null; full_name: string; cui: string; seat_class?: string } | null = null;
  editError: string | null = null;
  availableSeats: Array<{ seat_id: number; seat_number: string; seat_class: string; is_occupied?: boolean }> = [];
  allSeats: Array<{ seat_id: number; seat_number: string; seat_class: string; is_occupied: boolean }> = [];
  private seatIndex: Map<string, { seat_id: number; seat_number: string; seat_class: string; is_occupied: boolean }> = new Map();
  // Previsualización y resultado
  editQuote: { base: number; total: number; seatChanged: boolean; vipApplied: boolean; discount: number; prevFee: number; addedFee: number } | null = null;
  editSuccess: { total: number; seatChanged: boolean; vip: boolean } | null = null;
  private quoteTimer: any = null;
  // Clase del conjunto actual para limitar el mapa
  private editClassType: 'business' | 'economy' = 'economy';

  // Modales de cancelación
  showCancelModal = false;
  cancelTarget: any | null = null; // reserva seleccionada
  confirmCui = '';
  isCancelling = false;

  showCancelBatchModal = false;
  cancelBatchTarget: { batch_id: string; items: any[] } | null = null;
  confirmPhrase = '';

  constructor(private api: ReservasService, private toast: ToastService, private route: ActivatedRoute, public router: Router) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const edit = params.get('edit');
      this.highlightId = edit ? Number(edit) : null;
    });
    this.api.getMyReservations().subscribe({
      next: (res) => {
        this.reservas = res.data || [];
        this.buildGroups();
      },
      error: (err) => {
        const msg = err?.error?.message || 'No se pudieron cargar tus reservas.';
        this.toast.error(msg);
      }
    });
  }

  private buildGroups() {
    const map = new Map<string, any[]>();
    for (const r of this.reservas) {
      const key = r.batch_id || `single-${r.reservation_id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const groups: any[] = [];
    for (const [key, list] of map.entries()) {
      // Ordenar por fecha desc ya viene así; tomar la más reciente como encabezado
      const created_at = list[0]?.created_at || '';
      const classes = Array.from(new Set(list.map((x: any) => x.seat_class).filter(Boolean)));
      const sum_base = list.reduce((acc: number, it: any) => acc + Number(it?.price_base || 0), 0);
      const sum_total = list.reduce((acc: number, it: any) => acc + Number(it?.total || 0), 0);
      groups.push({ batch_id: key, created_at, count: list.length, classes, sum_base, sum_total, items: list });
    }
    // Ordenar grupos por fecha desc (primer item)
    groups.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    this.grupos = groups;
  }

  openEdit(r: any) {
    this.editModel = { id: r.reservation_id, seat_code: r.seat_code, has_bag: !!r.has_bag, new_seat_code: r.seat_code, full_name: r.full_name, cui: r.cui, seat_class: r.seat_class };
    this.editError = null;
    this.editQuote = null;
    this.editSuccess = null;
    this.showEditModal = true;
    this.api.getAllSeats().subscribe({
      next: (res) => {
        const rows = Array.isArray(res?.data) ? res.data : res;
        this.allSeats = (rows || []).map((s: any) => ({
          seat_id: s.seat_id,
          seat_number: s.seat_number,
          seat_class: s.seat_class,
          is_occupied: !!s.is_occupied
        }));
        // Índice por código
        this.seatIndex = new Map(this.allSeats.map((s) => [s.seat_number, s]));
        // Determinar clase (Negocios/Económica) y tipo ('business'|'economy')
        const currentSeat = this.seatIndex.get(r.seat_code);
        const className = (currentSeat?.seat_class || r.seat_class || '').toString();
        this.editClassType = this.seatClassToType(className);
        // Disponibles para cambiar (incluye el actual)
        this.availableSeats = this.allSeats.filter((s: any) => (s.seat_class === className) && (!s.is_occupied || s.seat_number === r.seat_code));
        // Generar previsualización inicial
        this.triggerQuote();
      },
      error: () => {
        this.availableSeats = [];
        this.allSeats = [];
        this.seatIndex = new Map();
      }
    });
  }

  // Copiar texto al portapapeles
  copy(value: string) {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      this.toast.success('Copiado: ' + value);
    }).catch(() => {
      this.toast.error('No se pudo copiar');
    });
  }

  closeEdit() {
    this.showEditModal = false;
    this.editModel = null;
    this.availableSeats = [];
    this.editError = null;
    this.allSeats = [];
    this.seatIndex = new Map();
    this.editQuote = null;
    this.editSuccess = null;
  }

  saveEdit() {
    if (!this.editModel) return;
    const model = this.editModel;
    const changeSeat = model.new_seat_code && model.new_seat_code !== model.seat_code;
    let seat_id: number | undefined = undefined;
    if (changeSeat) {
      const found = this.availableSeats.find((s) => s.seat_number === model.new_seat_code);
      if (!found) {
        this.toast.error('Asiento seleccionado inválido.');
        return;
      }
      seat_id = found.seat_id;
    }
    this.api.updateReservation(model.id, { seat_id, has_luggage: !!model.has_bag, full_name: model.full_name, cui: model.cui }).subscribe({
      next: (res) => {
        this.toast.success('Reserva actualizada');
        // Refrescar lista agrupada para reflejar el nuevo número de asiento en el conjunto
        this.api.getMyReservations().subscribe({
          next: (res2) => {
            this.reservas = res2.data || [];
            this.buildGroups();
          }
        });
        // Cerrar automáticamente el modal después de guardar
        this.closeEdit();
      },
      error: (err) => {
        this.editError = err?.error?.message || 'No se pudo actualizar la reserva';
      }
    });
  }

  // Seat map helpers (usar layout general de Económica para mostrar todo)
  get colOrder(): number[] {
    return this.editClassType === 'business' ? [1, 2] : [3, 4, 5, 6, 7];
  }
  get rowGroups(): string[][] {
    return this.editClassType === 'business'
      ? [['I', 'G'], ['F', 'D'], ['C', 'A']]
      : [['I', 'H', 'G'], ['F', 'E', 'D'], ['C', 'B', 'A']];
  }
  getSeat(row: string, col: number): { code: string; available: boolean } | null {
    const code = `${row}${col}`;
    const s = this.seatIndex.get(code);
    if (!s) return null;
    // Filtrar por clase: solo mostrar asientos de la misma clase de la reserva actual
    const targetClassName = this.currentClassLabel || this.editModel?.seat_class || '';
    if (s.seat_class !== targetClassName) return null;
    const currentCode = this.editModel?.seat_code;
    const isAvailable = !s.is_occupied || s.seat_number === currentCode;
    return { code, available: isAvailable };
  }
  isChosen(code: string): boolean {
    return this.editModel?.new_seat_code === code;
  }
  onSelectSeat(code: string) {
    if (!this.editModel) return;
    const s = this.seatIndex.get(code);
    if (!s) return;
    if (s.is_occupied && code !== this.editModel.seat_code) return; // ocupado y no es el actual
    this.editModel.new_seat_code = code;
    this.triggerQuote();
  }

  onToggleBag() {
    this.triggerQuote();
  }

  private triggerQuote() {
    if (!this.editModel) return;
    // Debounce simple
    if (this.quoteTimer) clearTimeout(this.quoteTimer);
    this.quoteTimer = setTimeout(() => {
      const model = this.editModel!;
      const changeSeat = model.new_seat_code && model.new_seat_code !== model.seat_code;
      let seat_id: number | undefined = undefined;
      if (changeSeat) {
        const found = this.availableSeats.find((s) => s.seat_number === model.new_seat_code);
        if (found) seat_id = found.seat_id;
      }
      this.api.quoteReservation(model.id, { seat_id, has_luggage: !!model.has_bag }).subscribe({
        next: (res) => {
          const d = res?.data || {};
          this.editQuote = { base: Number(d.base || 0), total: Number(d.total || 0), seatChanged: !!d.seatChanged, vipApplied: !!d.vip_applied || !!d.discount_applied, discount: Number(d.discount || 0), prevFee: Number(d.fee_accumulated || 0), addedFee: Number(d.fee_added || 0) };
        },
        error: () => {
          this.editQuote = null;
        }
      });
    }, 300);
  }

  // Desglose para mostrar 10% y VIP
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

  // Abrir/Cerrar modal cancelar individual
  openCancel(r: any) {
    this.cancelTarget = r;
    this.confirmCui = '';
    this.showCancelModal = true;
  }
  closeCancel() {
    this.showCancelModal = false;
    this.cancelTarget = null;
    this.confirmCui = '';
    this.isCancelling = false;
  }
  confirmCancel() {
    if (!this.cancelTarget) return;
    const expected = String(this.cancelTarget.cui || '').replace(/\D/g, '');
    const entered = String(this.confirmCui || '').replace(/\D/g, '');
    if (!entered || entered !== expected) {
      this.toast.error('El CUI no coincide. Verifica e intenta nuevamente.');
      return;
    }
    this.isCancelling = true;
    this.api.deleteReservation(this.cancelTarget.reservation_id).subscribe({
      next: () => {
        this.isCancelling = false;
        this.toast.success('Reserva cancelada correctamente');
        this.closeCancel();
        this.api.getMyReservations().subscribe({
          next: (res) => { 
            this.reservas = res.data || []; 
            this.buildGroups(); 
          },
          error: (err) => {
            this.toast.error('Error al recargar reservas');
            console.error('Error al recargar:', err);
          }
        });
      },
      error: (err) => {
        this.isCancelling = false;
        this.toast.error(err?.error?.message || 'Error al cancelar reserva');
        console.error('Error cancelación:', err);
      }
    });
  }

  // Cancelación por conjunto
  openCancelBatch(group: { batch_id: string; items: any[] }) {
    if (!group?.batch_id) return;
    // Prevenir apertura de modal si el grupo está vacío (edge case de race conditions)
    if (!group.items || group.items.length === 0) {
      this.toast.error('Este conjunto ya no tiene reservas activas.');
      return;
    }
    this.cancelBatchTarget = { batch_id: group.batch_id, items: group.items || [] };
    this.confirmPhrase = '';
    this.showCancelBatchModal = true;
  }
  closeCancelBatch() {
    this.showCancelBatchModal = false;
    this.cancelBatchTarget = null;
    this.confirmPhrase = '';
  }
  confirmCancelBatch() {
    if (!this.cancelBatchTarget) return;
    if ((this.confirmPhrase || '').trim().toUpperCase() !== 'CANCELAR') {
      this.toast.error('Para confirmar escribe la palabra CANCELAR.');
      return;
    }
    const bid = this.cancelBatchTarget.batch_id;
    const batchSize = this.cancelBatchTarget.items?.length || 0;
    
    this.api.cancelBatch({ batch_id: bid }).subscribe({
      next: (response) => {
        const data = response?.data || {};
        const count = data.count || 0;
        const alreadyCancelled = data.already_cancelled === true;
        
        if (alreadyCancelled || count === 0) {
          // Batch ya fue cancelado previamente (idempotencia)
          this.toast.success(response.message || 'El conjunto ya estaba cancelado');
        } else  {
          // Cancelación exitosa de reservas activas
          this.toast.success(`Conjunto cancelado (${count} reserva${count !== 1 ? 's' : ''})`);
        }
        
        this.closeCancelBatch();
        
        // SIEMPRE refrescar el listado para reflejar el estado real
        this.api.getMyReservations().subscribe({
          next: (res) => { 
            this.reservas = res.data || []; 
            this.buildGroups();
            console.log('[CANCEL-BATCH] Listado actualizado:', this.grupos.length, 'grupos');
          },
          error: (err) => {
            this.toast.error('Error al recargar reservas');
            console.error('[CANCEL-BATCH] Error al recargar:', err);
          }
        });
      },
      error: (err) => {
        const msg = err?.error?.message || 'Error al cancelar conjunto';
        this.toast.error(msg);
        console.error('[CANCEL-BATCH] Error:', err);
      }
    });
  }
}
