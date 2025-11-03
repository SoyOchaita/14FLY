import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReservasService } from '../reservas.service';
import { ToastService } from '../../ui/toast/toast.service';

@Component({
  selector: 'app-mis-reservas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mis-reservas.component.html',
  styleUrl: './mis-reservas.component.scss'
})
export class MisReservasComponent implements OnInit {
  reservas: Array<{ reservation_id: number; seat_code: string; created_at: string; full_name: string; cui: string; has_bag: boolean }> = [];

  constructor(private api: ReservasService, private toast: ToastService) {}

  ngOnInit(): void {
    this.api.getMyReservations().subscribe({
      next: (res) => (this.reservas = res.data || []),
      error: (err) => {
        const msg = err?.error?.message || 'No se pudieron cargar tus reservas.';
        this.toast.error(msg);
      }
    });
  }
}
