import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

// Interceptor para capturar 401/403 y cerrar sesión limpiamente
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((error) => {
      const status = error?.status;
      if (status === 401 || status === 403) {
        auth.logout();
      }
      return throwError(() => error);
    })
  );
};
