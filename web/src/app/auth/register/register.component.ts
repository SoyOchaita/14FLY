import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { Router, RouterLink } from '@angular/router';
import { validateFullName, validatePasswordComplex } from '../../shared/validators';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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
  duplicateType: 'email' | 'cui' | null = null;
  duplicateValue: string | null = null;

  @ViewChild('emailInput') emailInput?: ElementRef<HTMLInputElement>;
  @ViewChild('cuiInput') cuiInput?: ElementRef<HTMLInputElement>;

  constructor(private auth: AuthService, private router: Router) {
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
    return validatePasswordComplex(p);
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
    this.duplicateType = null;
    this.duplicateValue = null;
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
        const msg = String(this.errorMsg);
        // Detectar si el backend informó duplicado específico
        const emailMatch = msg.match(/correo\s+"([^"]+)"\s+ya está asociado/i);
        const cuiMatch = msg.match(/CUI\s+([0-9\-]+)\s+ya está asociado/i);
        if (emailMatch) {
          this.duplicateType = 'email';
          this.duplicateValue = emailMatch[1];
        } else if (cuiMatch) {
          this.duplicateType = 'cui';
          this.duplicateValue = cuiMatch[1];
        } else {
          this.duplicateType = null;
          this.duplicateValue = null;
        }
      }
    });
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  useOtherEmail() {
    this.model.email = '';
    this.errorMsg = null;
    this.duplicateType = null;
    this.duplicateValue = null;
    setTimeout(() => this.emailInput?.nativeElement.focus(), 0);
  }

  fixCui() {
    this.model.cui = '';
    this.errorMsg = null;
    this.duplicateType = null;
    this.duplicateValue = null;
    setTimeout(() => this.cuiInput?.nativeElement.focus(), 0);
  }
}
