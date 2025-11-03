import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration: number; // ms
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 1;
  private readonly _toasts$ = new BehaviorSubject<Toast[]>([]);
  readonly toasts$ = this._toasts$.asObservable();

  private push(message: string, type: ToastType, duration = 3000) {
    const toast: Toast = { id: this.seq++, message, type, duration };
    this._toasts$.next([...this._toasts$.value, toast]);
    if (duration > 0) {
      setTimeout(() => this.dismiss(toast.id), duration);
    }
  }

  dismiss(id: number) {
    this._toasts$.next(this._toasts$.value.filter(t => t.id !== id));
  }

  clear() {
    this._toasts$.next([]);
  }

  success(message: string, duration?: number) { this.push(message, 'success', duration ?? 2500); }
  error(message: string, duration?: number) { this.push(message, 'error', duration ?? 4000); }
  info(message: string, duration?: number) { this.push(message, 'info', duration ?? 3000); }
  warning(message: string, duration?: number) { this.push(message, 'warning', duration ?? 3500); }
}
