import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './ui/toast/toast-container.component';
import { AuthService } from './auth/auth.service';
import { HttpClient, HttpHeaders, HttpClientModule } from '@angular/common/http';
import { AdminImportModalComponent, ImportSummary } from './admin/admin-import-modal.component';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ToastContainerComponent, HttpClientModule, AdminImportModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = '14fly-web';
  uploading = false;
  showAdminImport = false;
  importSummary: ImportSummary | null = null;
  lastSuccessSeatCodes: string[] = [];
  adminMenuOpen = false;
  constructor(public auth: AuthService, private http: HttpClient, private router: Router) {}

  ngOnInit(): void {
    // Al recargar la página, si hay token, refrescar perfil para asegurar is_admin actualizado
    if (this.auth.isLoggedIn()) {
      this.auth.refreshProfile().subscribe();
    }
  }

  downloadAllReservationsXML() {
    const token = this.auth.getToken();
    const headers: any = token ? { Authorization: `Bearer ${token}` } : {};
    const url = '/api/reports/reservations.xml';
    fetch(url, { headers }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'reservations.xml';
      a.click();
      URL.revokeObjectURL(a.href);
    }).catch(() => {
      // Fallback toast via window dispatch if needed
      console.warn('Fallo al descargar XML');
    });
  }

  async uploadReservationsXML(file: File) {
    if (!file) return;
    this.uploading = true;
    const token = this.auth.getToken();
    const headers = new HttpHeaders({
      'Content-Type': 'application/xml',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    });
    const text = await file.text();
    const started = performance.now();
    this.http.post<any>('/api/reports/reservations.xml/upload', text, { headers })
      .subscribe({
        next: (res) => {
          const elapsed = Math.round(performance.now() - started);
          const data = res?.data || res || {};
          const ok = Number(data.ok || 0);
          const errors = typeof data.errors === 'number' ? Number(data.errors) : (Array.isArray(data.errors) ? data.errors.length : Number(data.errorsCount || 0));
          const total = Number(data.total || (ok + errors));
          const elapsedMs = Number(data.elapsedMs || elapsed);
          const successes = Array.isArray(data.successes) ? data.successes : [];
          const errorItems = Array.isArray(data.errorsList) ? data.errorsList : (Array.isArray(data.errorItems) ? data.errorItems : (Array.isArray(data.errors) ? data.errors : []));
          // Extraer códigos de asiento de los éxitos (seat_code | code | seat)
          this.lastSuccessSeatCodes = successes
            .map((x: any) => x?.seat_code || x?.code || x?.seat || '')
            .filter((s: string) => !!s);
          this.importSummary = { total, ok, errors, elapsedMs, successes, errorItems };
          this.uploading = false;
          this.showAdminImport = true; // mostrar resultado en el modal
        },
        error: (err) => {
          console.error('Error al subir XML', err);
          this.importSummary = { total: 0, ok: 0, errors: 1, elapsedMs: 0, errorItems: [{ message: err?.error?.message || 'Error al procesar el XML' }] };
          this.showAdminImport = true;
          this.uploading = false;
        }
      });
  }

  onAdminXMLSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (file) {
      this.uploadReservationsXML(file);
      // clear for subsequent same-file uploads
      input.value = '';
    }
  }

  openAdminImportModal() {
    this.importSummary = null;
    this.showAdminImport = true;
  }
  closeAdminImportModal() {
    this.showAdminImport = false;
  }
  goToDiagram() {
    // Navegar al diagrama con resaltado de asientos importados (incluye éxitos posteriores a reintentos)
    const extra = Array.isArray(this.importSummary?.successes)
      ? (this.importSummary!.successes as any[]).map((x: any) => x?.seat_code || x?.code || x?.seat || '').filter((s: string) => !!s)
      : [];
    const all = Array.from(new Set([...(this.lastSuccessSeatCodes || []), ...extra]));
    const hl = all.join(',');
    this.showAdminImport = false;
    this.router.navigate(['/reservas/crear'], { queryParams: hl ? { highlight: hl } : {} });
  }

  goToAdminReport() {
    this.router.navigate(['/admin/reportes']);
  }

  toggleAdminMenu() { this.adminMenuOpen = !this.adminMenuOpen; }
  closeAdminMenu() { this.adminMenuOpen = false; }
}
