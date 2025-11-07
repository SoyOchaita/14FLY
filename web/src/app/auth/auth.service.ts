import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = '/api/users';
  private allowedDomainsCache: string[] | null = null;

  constructor(private http: HttpClient, private router: Router) {}

  login(credentials: { email: string; password: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/login`, credentials).pipe(
      tap((res) => {
        if (res?.success && res?.data?.token) {
          localStorage.setItem('token', res.data.token);
          // La API devuelve { token, profile }
          const profile = res.data.profile || res.data.user || null;
          if (profile) localStorage.setItem('user', JSON.stringify(profile));
          this.router.navigate(['/reservas/mis-reservas'], { replaceUrl: true });
          // Refrescar perfil desde /me para asegurar is_admin y otros campos actuales
          this.refreshProfile().subscribe();
        }
      })
    );
  }

  register(payload: { full_name: string; email: string; password: string; cui: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/register`, payload).pipe(
      tap((res) => {
        if (res?.success) {
          // Inicio de sesión automático opcional tras registro
          this.login({ email: payload.email, password: payload.password }).subscribe();
        }
      })
    );
  }

  getAllowedDomains(): Observable<string[]> {
    if (this.allowedDomainsCache) {
      return new Observable((obs) => { obs.next(this.allowedDomainsCache as string[]); obs.complete(); });
    }
    // No hay endpoint dedicado; derivamos desde variable en frontend si existiera, o devolvemos defaults conocidos
    const defaults = ['gmail.com','outlook.com'];
    return new Observable((obs) => { this.allowedDomainsCache = defaults; obs.next(defaults); obs.complete(); });
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/login'], { replaceUrl: true });
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  getUser<T = any>(): T | null {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  displayName(): string {
    const u: any = this.getUser();
    return (
      u?.name || u?.full_name || u?.username || u?.email || 'Usuario'
    );
  }

  isAdmin(): boolean {
    const u: any = this.getUser();
    return !!u?.is_admin;
  }

  refreshProfile(): Observable<any> {
    const token = this.getToken();
    if (!token) return of(null);
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.get<any>(`${this.apiUrl}/me`, { headers }).pipe(
      tap((res) => {
        if (res?.success && res?.data) {
          localStorage.setItem('user', JSON.stringify(res.data));
        }
      })
    );
  }
}
