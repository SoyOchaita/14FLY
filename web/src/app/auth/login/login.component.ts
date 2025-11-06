import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  credentials = { email: '', password: '' };
  showPassword = false;
  loading = false;
  errorMsg: string | null = null;
  allowedDomains: string[] = [];

  constructor(private auth: AuthService) {
    this.auth.getAllowedDomains().subscribe(domains => this.allowedDomains = domains);
  }

  get emailValid(): boolean {
    const e = (this.credentials.email || '').trim();
    if (!e) return false;
    const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!re.test(e)) return false;
    const domain = e.split('@')[1]?.toLowerCase();
    return this.allowedDomains.length ? this.allowedDomains.includes(domain) : true;
  }
  get passwordValid(): boolean {
    return (this.credentials.password || '').length >= 8; // login solo requiere presencia mínima
  }
  get canSubmit(): boolean {
    return this.emailValid && this.passwordValid && !this.loading;
  }
  togglePassword() { this.showPassword = !this.showPassword; }

  onSubmit() {
    if (!this.canSubmit) return;
    this.errorMsg = null;
    this.loading = true;
    this.auth.login(this.credentials).subscribe({
      next: () => { this.loading = false; },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err?.error?.message || 'Error al iniciar sesión.';
      }
    });
  }
}
