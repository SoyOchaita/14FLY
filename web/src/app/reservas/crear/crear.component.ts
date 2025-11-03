import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReservasService } from '../reservas.service';
import { ToastService } from '../../ui/toast/toast.service';

@Component({
  selector: 'app-crear',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crear.component.html',
  styleUrl: './crear.component.scss'
})
export class CrearComponent implements OnInit {
  tipo: 'business' | 'economy' = 'economy';
  cantidad = 1;
  mapa: any = { business: [], economy: [] };
  private mapaIndex: { business: Map<string, any>; economy: Map<string, any> } = {
    business: new Map<string, any>(),
    economy: new Map<string, any>()
  };
  seleccionados: Array<{ code: string; full_name: string; cui: string; has_bag: boolean }> = [];
  loading = false;
  // Modal para selección aleatoria
  showRandomModal = false;
  modalQuantity = 1;
  modalExceeded = false;
  // Disponibilidad por clase
  private availableByClass: { business: number; economy: number } = { business: 0, economy: 0 };
  // Advertencia si el usuario intenta exceder la disponibilidad
  capExceeded = false;
  // Navegación y edición de datos por asiento
  activeSeatIndex = 0;

  constructor(private reservas: ReservasService, private toast: ToastService) {}

  ngOnInit(): void {
    this.cargarMapa();
  }

  cargarMapa(clearSelection: boolean = false) {
    this.reservas.getSeats().subscribe({
      next: (res) => {
        this.mapa = res.data || { business: [], economy: [] };
        // Construir índices por código para lookup rápido
        this.mapaIndex.business = new Map((this.mapa.business as any[]).map((s: any) => [s.code, s]));
        this.mapaIndex.economy = new Map((this.mapa.economy as any[]).map((s: any) => [s.code, s]));
        // Actualiza conteo de disponibles por clase
        this.updateAvailableCounts();
  // Límite máximo depende únicamente de la disponibilidad actual (sin hardcode)
        // Limpia o depura selección según parámetro
        if (clearSelection) {
          this.seleccionados = [];
          // Reiniciar cantidad a 1 tras limpiar selección para evitar desajustes
          const max = this.availableInClass();
          this.cantidad = (Math.min(1, max) || 1);
        } else {
          const disponibles = new Set(
            ((this.mapa.business as any[]).concat(this.mapa.economy)).filter((s: any) => s.available).map((s: any) => s.code)
          );
          this.seleccionados = this.seleccionados.filter((s) => !s.code || disponibles.has(s.code));
        }
        // Ajustar cantidad a lo posible
        if (this.cantidad > this.availableInClass()) this.cantidad = Math.max(1, this.availableInClass());
        this.syncPassengersWithQuantity();
        this.ensureActiveIndex();
        this.capExceeded = false;
      },
    });
  }

  toggleSeleccion(seat: any) {
    if (!seat) return;

    const idx = this.seleccionados.findIndex((s) => s.code === seat.code);
    if (idx >= 0) {
      // Deseleccionar (no tocar disponibilidad real del asiento)
      this.seleccionados.splice(idx, 1);
      this.ensureActiveIndex();
      return;
    }

    if (!seat.available) return; // Ocupado por otra reserva

    const selCount = this.seleccionados.length;
    if (selCount >= this.cantidad) {
      // Modo incremental: si el usuario sigue seleccionando, incrementa cantidad hasta el máximo
      const max = this.availableInClass();
      if (selCount < max) {
        this.cantidad = selCount + 1;
      } else {
        return; // alcanzó el máximo permitido
      }
    }

    this.seleccionados.push({ code: seat.code, full_name: '', cui: '', has_bag: false });
    this.activeSeatIndex = this.seleccionados.length - 1;
  }

  seleccionarAleatorio() {
    // Abrir modal para pedir cantidad aleatoria a seleccionar
    this.modalQuantity = Math.min(Math.max(1, this.cantidad || 1), this.availableInClass());
    this.showRandomModal = true;
  }

  reservar() {
    if (!this.canConfirm) return;
    this.loading = true;
    if (this.seleccionados.length < this.cantidad) return this.toast.warning('Selecciona todos los asientos requeridos.');
    const payload = { seats: this.seleccionados };
    this.reservas.createReservation(payload).subscribe({
      next: () => {
        this.toast.success('Reserva completada');
        this.seleccionados = [];
        this.cargarMapa();
      },
      error: (err) => {
        this.toast.error(err?.error?.message || 'Error al reservar');
        this.cargarMapa();
      },
      complete: () => (this.loading = false),
    });
  }

  syncPassengersWithQuantity() {
    // En manual nunca agregamos placeholders sin código; solo recortamos si sobra
    const conCodigo = this.seleccionados.filter((s) => !!s.code);
    if (conCodigo.length > this.cantidad) {
      this.seleccionados = conCodigo.slice(0, this.cantidad);
    } else {
      this.seleccionados = conCodigo; // mantener lo seleccionado, permitir que el mapa incremente
    }
  }

  onTipoChange() {
    // Al cambiar de clase, limpiar selección manual y ajustar pasajeros
    this.seleccionados = [];
    this.activeSeatIndex = 0;
    // Actualizar límites por disponibilidad
    // Reiniciar cantidad a 1 para evitar quedar con cantidades altas sin selección
    const max = this.availableInClass();
    this.cantidad = (Math.min(1, max) || 1);
    this.syncPassengersWithQuantity();
    this.ensureActiveIndex();
    this.capExceeded = false;
  }

  // (Eliminado cambio de modo)

  cuiIsValid(cui: string): boolean {
    const digits = (cui || '').replace(/\D/g, '');
    return digits.length === 13;
  }

  passengerIsValid(p: { full_name: string; cui: string }): boolean {
    return !!p.full_name?.trim() && this.cuiIsValid(p.cui);
  }

  get canConfirm(): boolean {
    if (this.capExceeded) return false;
    if (this.seleccionados.length !== this.cantidad) return false;
    return this.seleccionados.every((p) => this.passengerIsValid(p));
  }

  // Ordenamiento/maquetación del mapa
  get colOrder(): number[] {
    return this.tipo === 'business' ? [1, 2] : [3, 4, 5, 6, 7];
  }

  get rowGroups(): string[][] {
    return this.tipo === 'business'
      ? [['I', 'G'], ['F', 'D'], ['C', 'A']]
      : [['I', 'H', 'G'], ['F', 'E', 'D'], ['C', 'B', 'A']];
  }

  getSeat(row: string, col: number): any | null {
    const code = `${row}${col}`;
    const map = this.mapaIndex[this.tipo] as Map<string, any>;
    return map.get(code) || null;
  }

  isSelected(code: string): boolean {
    return this.seleccionados.some((s) => s.code === code);
  }

  // Helpers de disponibilidad y selección aleatoria
  private updateAvailableCounts() {
    const b = (this.mapa.business as any[]).filter((s: any) => s.available).length || 0;
    const e = (this.mapa.economy as any[]).filter((s: any) => s.available).length || 0;
    this.availableByClass = { business: b, economy: e };
  }

  availableInClass(): number {
    return this.tipo === 'business' ? this.availableByClass.business : this.availableByClass.economy;
  }

  onCantidadChange(val: number) {
    const max = this.availableInClass() || 1;
    const raw = Number(val) || 1;
    this.capExceeded = raw > max;
    this.cantidad = Math.min(Math.max(1, raw), max);
    this.syncPassengersWithQuantity();
    this.ensureActiveIndex();
  }

  closeRandomModal() {
    this.showRandomModal = false;
    this.modalExceeded = false;
  }

  confirmRandomModal() {
    const n = Math.min(Math.max(1, this.modalQuantity || 1), this.availableInClass());
    if (this.modalExceeded || this.availableInClass() === 0) return;
    this.pickRandomSeats(n);
    this.closeRandomModal();
  }

  onModalQtyChange(val: number) {
    const max = this.availableInClass() || 1;
    const raw = Number(val) || 1;
    this.modalExceeded = raw > max;
    this.modalQuantity = Math.min(Math.max(1, raw), max);
  }

  modalIncrement() {
    this.onModalQtyChange((this.modalQuantity || 1) + 1);
  }

  modalDecrement() {
    this.onModalQtyChange((this.modalQuantity || 1) - 1);
  }

  modalSetMax() {
    this.modalQuantity = this.availableInClass() || 1;
  }

  private pickRandomSeats(n: number) {
    // Construye lista de disponibles actuales en la clase
    const list = (this.mapa[this.tipo] as any[]).filter((s: any) => s.available && !this.isSelected(s.code));
    if (!list.length) {
      this.toast.warning('No hay asientos disponibles en esta clase.');
      return;
    }
    // Shuffle simple
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    const take = Math.min(n, list.length);
    const chosen = list.slice(0, take);
  // Convertir a selección manual para que el usuario vea y pueda editar (flujo ahora siempre manual)
    chosen.forEach((seat: any) => {
      if (!this.isSelected(seat.code)) this.seleccionados.push({ code: seat.code, full_name: '', cui: '', has_bag: false });
    });
    this.cantidad = this.seleccionados.length;
    // Límite máximo siempre deriva de disponibilidad (sin variable fija)
    this.activeSeatIndex = this.seleccionados.length ? 0 : 0;
  }

  // Helpers UI para edición por asiento
  get activeSeat() {
    return this.seleccionados[this.activeSeatIndex];
  }

  setActiveSeat(i: number) {
    if (!this.seleccionados.length) {
      this.activeSeatIndex = 0;
      return;
    }
    this.activeSeatIndex = Math.min(Math.max(0, i), this.seleccionados.length - 1);
  }

  setActiveSeatPrev() {
    this.setActiveSeat(this.activeSeatIndex - 1);
  }

  setActiveSeatNext() {
    this.setActiveSeat(this.activeSeatIndex + 1);
  }

  ensureActiveIndex() {
    if (!this.seleccionados.length) {
      this.activeSeatIndex = 0;
      return;
    }
    if (this.activeSeatIndex > this.seleccionados.length - 1) this.activeSeatIndex = this.seleccionados.length - 1;
  }

  setTipo(t: 'business' | 'economy') {
    if (this.tipo !== t) {
      this.tipo = t;
      this.onTipoChange();
    }
  }
}
