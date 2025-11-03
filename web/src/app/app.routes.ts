import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { CrearComponent } from './reservas/crear/crear.component';
import { MisReservasComponent } from './reservas/mis-reservas/mis-reservas.component';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
	{ path: '', redirectTo: 'login', pathMatch: 'full' },
	{ path: 'login', component: LoginComponent },
	{ path: 'register', component: RegisterComponent },
	{ path: 'reservas/crear', component: CrearComponent, canActivate: [authGuard] },
	{ path: 'reservas/mis-reservas', component: MisReservasComponent, canActivate: [authGuard] },
	{ path: '**', redirectTo: 'login' }
];
