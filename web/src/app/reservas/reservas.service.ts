import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ReservasService {
  private api = '/api';

  constructor(private http: HttpClient) {}

  getSeats(): Observable<any> {
    return this.http.get<any>(`${this.api}/seats/map`);
  }

  // Obtiene todos los asientos con id/numero/clase/estado para edición
  getAllSeats(): Observable<any> {
    return this.http.get<any>(`${this.api}/seats`);
  }

  getRandomSeat(seatClass: 'business' | 'economy'): Observable<any> {
    return this.http.get<any>(`${this.api}/seats/random/${seatClass}`);
  }

  createReservation(payload: any): Observable<any> {
    return this.http.post<any>(`${this.api}/reservations`, payload);
  }

  getMyReservations(): Observable<any> {
    return this.http.get<any>(`${this.api}/reservations/me`);
  }

  updateReservation(id: number, payload: any): Observable<any> {
    return this.http.put<any>(`${this.api}/reservations/${id}`, payload);
  }

  quoteReservation(id: number, params: { seat_id?: number; price_base?: number; has_luggage?: boolean }): Observable<any> {
    const q = new URLSearchParams();
    if (typeof params.seat_id === 'number') q.set('seat_id', String(params.seat_id));
    if (typeof params.price_base === 'number') q.set('price_base', String(params.price_base));
    if (typeof params.has_luggage === 'boolean') q.set('has_luggage', String(params.has_luggage));
    const qs = q.toString();
    return this.http.get<any>(`${this.api}/reservations/${id}/quote${qs ? `?${qs}` : ''}`);
  }

  lookupReservationByCuiAndSeat(payload: { cui: string; seat_code: string }): Observable<any> {
    return this.http.post<any>(`${this.api}/reservations/lookup`, payload);
  }

  cancelByCuiAndSeat(payload: { cui: string; seat_code: string }): Observable<any> {
    return this.http.post<any>(`${this.api}/reservations/cancel-by-cui-seat`, payload);
  }
}
