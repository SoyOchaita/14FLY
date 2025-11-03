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
  seleccionMode: 'manual' | 'random' = 'manual';
  mapa: any = { business: [], economy: [] };
  private mapaIndex: { business: Map<string, any>; economy: Map<string, any> } = {
    business: new Map<string, any>(),
    economy: new Map<string, any>()
  };
  seleccionados: Array<{ code: string; full_name: string; cui: string; has_bag: boolean }> = [];
  loading = false;

  constructor(private reservas: ReservasService, private toast: ToastService) {}

  ngOnInit(): void {
    this.cargarMapa();
  }

  cargarMapa() {
    this.reservas.getSeats().subscribe({
      next: (res) => {
        this.mapa = res.data || { business: [], economy: [] };
        // Construir índices por código para lookup rápido
        this.mapaIndex.business = new Map((this.mapa.business as any[]).map((s: any) => [s.code, s]));
        this.mapaIndex.economy = new Map((this.mapa.economy as any[]).map((s: any) => [s.code, s]));
        // Limpia selección si quedaron códigos ocupados
        const codesDisponibles = new Set((this.mapa.business as any[]).concat(this.mapa.economy).map((s: any) => s.code));
        this.seleccionados = this.seleccionados.filter((s) => codesDisponibles.has(s.code));
      },
    });
  }

  toggleSeleccion(seat: any) {
    if (!seat) return;
    const idx = this.seleccionados.findIndex((s) => s.code === seat.code);
    if (idx >= 0) {
      // Deseleccionar
      this.seleccionados.splice(idx, 1);
      seat.available = true;
      return;
    }
    if (seat.available && this.seleccionados.length < this.cantidad) {
      seat.available = false;
      this.seleccionados.push({ code: seat.code, full_name: '', cui: '', has_bag: false });
    }
  }

  seleccionarAleatorio() {
    if (this.seleccionados.length >= this.cantidad) return;
    this.loading = true;
    this.reservas.getRandomSeat(this.tipo).subscribe({
      next: (res) => {
        const seat = res.data;
        if (!seat) return;
        // Marcar en el mapa si existe
        const list = this.mapa[this.tipo] as any[];
        const target = list.find((s) => s.code === seat.code);
        if (target && target.available) {
          this.toggleSeleccion(target);
        }
      },
      error: () => {},
      complete: () => (this.loading = false),
    });
  }

  reservar() {
    if (!this.canConfirm) return;
    this.loading = true;
    if (this.seleccionMode === 'manual') {
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
      return;
    }

    // Modo aleatorio: usar cantidad y tipo; seatsData con datos de pasajeros
    if (this.seleccionados.length !== this.cantidad) {
      // Sin selección manual, solo usamos la longitud como cantidad para recolectar datos
      this.syncPassengersWithQuantity();
    }
    const payload = {
      quantity: this.cantidad,
      seatClass: this.tipo,
      selectionMode: 'random',
      seatsData: this.seleccionados.map(({ code, ...rest }) => rest),
    };
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
    const current = this.seleccionados.length;
    if (current < this.cantidad) {
      for (let i = current; i < this.cantidad; i++) {
        this.seleccionados.push({ code: '', full_name: '', cui: '', has_bag: false });
      }
    } else if (current > this.cantidad) {
      // Si había asientos manualmente seleccionados extra, liberarlos en el mapa
      const removidos = this.seleccionados.splice(this.cantidad);
      removidos.forEach((r) => {
        if (!r.code) return;
        const list = (this.mapa.business as any[]).concat(this.mapa.economy);
        const seat = list.find((s) => s.code === r.code);
        if (seat) seat.available = true;
      });
    }
  }

  onTipoChange() {
    // Al cambiar de clase, limpiar selección manual y ajustar pasajeros
    if (this.seleccionMode === 'manual') {
      // Liberar los asientos marcados en el mapa
      this.seleccionados.forEach((sel) => {
        const list = (this.mapa.business as any[]).concat(this.mapa.economy);
        const seat = list.find((s) => s.code === sel.code);
        if (seat) seat.available = true;
      });
      this.seleccionados = [];
    }
    this.syncPassengersWithQuantity();
  }

  onModeChange() {
    // Al cambiar de modo, para aleatorio no se requieren códigos
    if (this.seleccionMode === 'random') {
      // Liberar asientos seleccionados en el mapa
      this.seleccionados.forEach((sel) => {
        const list = (this.mapa.business as any[]).concat(this.mapa.economy);
        const seat = list.find((s) => s.code === sel.code);
        if (seat) seat.available = true;
      });
      // Mantener solo los datos de pasajero sin códigos
      this.seleccionados = this.seleccionados.map(({ full_name, cui, has_bag }) => ({ code: '', full_name, cui, has_bag }));
      this.syncPassengersWithQuantity();
    }
  }

  cuiIsValid(cui: string): boolean {
    const digits = (cui || '').replace(/\D/g, '');
    return digits.length === 13;
  }

  passengerIsValid(p: { full_name: string; cui: string }): boolean {
    return !!p.full_name?.trim() && this.cuiIsValid(p.cui);
  }

  get canConfirm(): boolean {
    if (this.seleccionMode === 'manual') {
      if (this.seleccionados.length !== this.cantidad) return false;
      return this.seleccionados.every((p) => this.passengerIsValid(p));
    }
    // random
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
}
