import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { validateFullName } from '../../shared/validators';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  model = { full_name: '', email: '', password: '', cui: '' };
  showPassword = false;
  loading = false;
  errorMsg: string | null = null;
  successMsg: string | null = null;
  allowedDomains: string[] = [];

  constructor(private auth: AuthService) {
    this.auth.getAllowedDomains().subscribe(d => this.allowedDomains = d);
  }

  togglePassword() { this.showPassword = !this.showPassword; }

  get nameValid(): boolean {
    return validateFullName(this.model.full_name || '') !== null;
  }
  get emailValid(): boolean {
    const e = (this.model.email || '').trim();
    if (!e) return false;
    const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!re.test(e)) return false;
    const domain = e.split('@')[1]?.toLowerCase();
    return this.allowedDomains.length ? this.allowedDomains.includes(domain) : true;
  }
  get passwordValid(): boolean {
    const p = this.model.password || '';
    const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&._-])[A-Za-z\d@$!%*?&._-]{8,}$/;
    return pattern.test(p);
  }
  get cuiValid(): boolean {
    const digits = (this.model.cui || '').replace(/\D/g, '');
    return digits.length === 13;
  }
  get canSubmit(): boolean {
    return this.nameValid && this.emailValid && this.passwordValid && this.cuiValid && !this.loading;
  }

  formatCui() {
    let raw = (this.model.cui || '').replace(/\D/g, '').slice(0,13);
    if (raw.length >= 4) raw = raw.slice(0,4) + '-' + raw.slice(4);
    if (raw.length >= 10) raw = raw.slice(0,10) + '-' + raw.slice(10);
    this.model.cui = raw;
  }

  onSubmit() {
    if (!this.canSubmit) return;
    this.errorMsg = null;
    this.successMsg = null;
    this.loading = true;
    const payload = { ...this.model, cui: (this.model.cui || '').replace(/\D/g,'') };
    this.auth.register(payload).subscribe({
      next: () => {
        this.loading = false;
        this.successMsg = 'Cuenta creada. Redirigiendo…';
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err?.error?.message || 'Error al registrar.';
      }
    });
  }
}
