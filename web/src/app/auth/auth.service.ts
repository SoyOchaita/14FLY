import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = '/api/users';

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
        }
      })
    );
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
}
