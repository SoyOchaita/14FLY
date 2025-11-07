import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-me',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './me.component.html'
})
export class MeComponent implements OnInit {
  loading = true;
  error: string | null = null;
  profile: any = null;
  vipInfo: { isVIP: boolean; reservations: number } | null = null;

  constructor(private http: HttpClient, private auth: AuthService) {}

  ngOnInit(): void {
    const token = this.auth.getToken();
    if (!token) {
      this.error = 'No autenticado.';
      this.loading = false;
      return;
    }
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.http.get<any>('/api/users/me', { headers }).subscribe({
      next: (res) => {
        this.profile = res?.data || null;
        // Guarda también en AuthService/localStorage
        if (this.profile) localStorage.setItem('user', JSON.stringify(this.profile));
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Error al cargar el perfil';
        this.loading = false;
      }
    });
    // VIP info simple (conteo de reservas y estado VIP)
    this.http.get<any>('/api/users/me/vip', { headers }).subscribe({
      next: (res) => {
        const data = res?.data || {};
        this.vipInfo = { isVIP: !!data.isVIP, reservations: Number(data.reservations || 0) };
      },
      error: (_) => { /* opcional ocultar error aquí */ }
    });
  }
}
