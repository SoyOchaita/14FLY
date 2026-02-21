import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpHeaders } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';
import { ReservasService } from './reservas.service';
import { AuditService } from './audit.service';

@Component({
  selector: 'app-historial-auditoria',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './historial-auditoria.component.html',
  styleUrls: ['./historial-auditoria.component.scss']
})
export class HistorialAuditoriaComponent implements OnInit {
  loading = true;
  error: string | null = null;
  
  // Datos de reservas activas
  reservasActivas: any[] = [];
  
  // Datos de cancelaciones
  cancelaciones: any[] = [];
  
  // Estadísticas
  stats: any = null;
  
  // Controles de UI
  activeTab: 'activas' | 'canceladas' | 'estadisticas' = 'activas';
  currentPage = 1;
  itemsPerPage = 10;
  totalItems = 0;

  // Hacer disponible Math en el template
  Math = Math;

  constructor(
    private auth: AuthService,
    private reservasService: ReservasService,
    private auditService: AuditService
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    const token = this.auth.getToken();
    if (!token) {
      this.error = 'No autenticado.';
      this.loading = false;
      return;
    }

    // Cargar reservas activas
    this.reservasService.getMyReservations().subscribe({
      next: (res) => {
        this.reservasActivas = res?.data || [];
      },
      error: (err) => {
        console.error('Error cargando reservas activas:', err);
      }
    });

    // Cargar cancelaciones
    const offset = (this.currentPage - 1) * this.itemsPerPage;
    this.auditService.getCancellationHistory(this.itemsPerPage, offset).subscribe({
      next: (res) => {
        const data = res?.data || {};
        this.cancelaciones = data.data || [];
        this.totalItems = data.pagination?.total || 0;
      },
      error: (err) => {
        console.error('Error cargando cancelaciones:', err);
      }
    });

    // Cargar estadísticas
    this.auditService.getCancellationStats().subscribe({
      next: (res) => {
        this.stats = res?.data || null;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Error cargando datos';
        this.loading = false;
      }
    });
  }

  cancelReservation(reservaId: number): void {
    if (confirm('¿Estás seguro de que deseas cancelar esta reserva?')) {
      this.reservasService.deleteReservation(reservaId).subscribe({
        next: () => {
          alert('Reserva cancelada exitosamente.');
          this.loadData();
        },
        error: (err) => {
          alert(err?.error?.message || 'Error al cancelar la reserva.');
        }
      });
    }
  }

  changeTab(tab: 'activas' | 'canceladas' | 'estadisticas'): void {
    this.activeTab = tab;
  }

  nextPage(): void {
    if (this.currentPage * this.itemsPerPage < this.totalItems) {
      this.currentPage++;
      this.loadData();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadData();
    }
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('es-GT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-GT', {
      style: 'currency',
      currency: 'GTQ'
    }).format(amount);
  }

  getSeatClassBadge(seatClass: string): string {
    return seatClass?.toLowerCase().includes('negocio') ? 'business' : 'economy';
  }
}
