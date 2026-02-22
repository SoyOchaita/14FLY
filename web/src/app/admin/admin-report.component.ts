import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';

interface AdminMetrics {
  users_total: number;
  reservations_total: number;
  seats: { business: { occupied: number; free: number }; economy: { occupied: number; free: number } };
  selections: { manual: number; random: number };
  modified: number; cancelled: number;
  per_user: Array<{ user_id: number; full_name: string; email: string; reservations_total: number; modified: number; cancelled: number; created_manual: number; created_random: number }>;
}

@Component({
  selector: 'app-admin-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-report.component.html'
})
export class AdminReportComponent implements OnInit {
  loading = true;
  error: string | null = null;
  data: AdminMetrics | null = null;
  seats: Array<{ seat_number: string; seat_class: string; is_occupied: boolean }> = [];
  private seatIndex = new Map<string, { seat_number: string; seat_class: string; is_occupied: boolean }>();
  constructor(private http: HttpClient, private auth: AuthService) {}
  ngOnInit() { this.fetch(); this.fetchSeats(); }
  fetch() {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    this.http.get<any>('/api/reports/admin-dashboard', { headers }).subscribe({
      next: (res) => { this.data = res?.data || null; this.loading = false; },
      error: (err) => { this.error = err?.error?.message || 'Error al cargar métricas'; this.loading = false; }
    });
  }
  ratioBusyBusiness() { return this.data ? this.data.seats.business.occupied + '/' + (this.data.seats.business.occupied + this.data.seats.business.free) : '—'; }
  ratioBusyEconomy() { return this.data ? this.data.seats.economy.occupied + '/' + (this.data.seats.economy.occupied + this.data.seats.economy.free) : '—'; }
  fetchSeats() {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    this.http.get<any>('/api/seats', { headers }).subscribe({
      next: (res) => {
        const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
        this.seats = rows.map((s: any) => ({ seat_number: s.seat_number, seat_class: s.seat_class, is_occupied: !!s.is_occupied }));
        this.seatIndex = new Map(this.seats.map(s => [s.seat_number, s]));
      },
      error: () => {}
    });
  }
  colOrderFor(cls: 'Negocios' | 'Económica'): number[] { return cls === 'Negocios' ? [1,2] : [3,4,5,6,7]; }
  rowGroupsFor(cls: 'Negocios' | 'Económica'): string[][] { return cls === 'Negocios' ? [['I','G'],['F','D'],['C','A']] : [['I','H','G'],['F','E','D'],['C','B','A']]; }
  isAisleAfter(col: number, cls: 'Negocios' | 'Económica'): boolean {
    if (cls === 'Negocios') return col === 1;
    return col === 4;
  }
  getSeat(cls: 'Negocios' | 'Económica', row: string, col: number): { code: string; available: boolean } | null {
    const code = `${row}${col}`;
    const s = this.seatIndex.get(code);
    if (!s) return null;
    if (s.seat_class !== cls) return null;
    return { code, available: !s.is_occupied };
  }
}
