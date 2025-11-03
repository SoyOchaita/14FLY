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

  getRandomSeat(seatClass: 'business' | 'economy'): Observable<any> {
    return this.http.get<any>(`${this.api}/seats/random/${seatClass}`);
  }

  createReservation(payload: any): Observable<any> {
    return this.http.post<any>(`${this.api}/reservations`, payload);
  }

  getMyReservations(): Observable<any> {
    return this.http.get<any>(`${this.api}/reservations/me`);
  }
}
