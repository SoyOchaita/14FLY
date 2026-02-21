import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuditService {
  private api = '/api/audit';

  constructor(private http: HttpClient) {}

  /**
   * Obtiene el historial de cancelaciones del usuario
   */
  getCancellationHistory(limit: number = 50, offset: number = 0): Observable<any> {
    return this.http.get<any>(`${this.api}/cancellations?limit=${limit}&offset=${offset}`);
  }

  /**
   * Obtiene estadísticas de cancelaciones
   */
  getCancellationStats(): Observable<any> {
    return this.http.get<any>(`${this.api}/cancellations/stats`);
  }

  /**
   * Obtiene el trail de auditoría de una reserva específica
   */
  getReservationAuditTrail(reservationId: number): Observable<any> {
    return this.http.get<any>(`${this.api}/reservations/${reservationId}/trail`);
  }

  /**
   * Obtiene reporte detallado de cancelaciones
   */
  getDetailedCancellationReport(limit: number = 50, offset: number = 0): Observable<any> {
    return this.http.get<any>(`${this.api}/cancellations/report/detailed?limit=${limit}&offset=${offset}`);
  }
}
