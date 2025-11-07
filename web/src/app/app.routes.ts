import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { CrearComponent } from './reservas/crear/crear.component';
import { MisReservasComponent } from './reservas/mis-reservas/mis-reservas.component';
import { authGuard, guestGuard } from './auth';
import { MeComponent } from './me/me.component';
import { AdminReportComponent } from './admin/admin-report.component';
import { adminGuard } from './auth/admin.guard';

export const routes: Routes = [
	{ path: '', redirectTo: 'login', pathMatch: 'full' },
	{ path: 'login', component: LoginComponent, canActivate: [guestGuard] },
	{ path: 'register', component: RegisterComponent, canActivate: [guestGuard] },
	{ path: 'reservas', redirectTo: 'reservas/mis-reservas', pathMatch: 'full' },
	{ path: 'reservas/crear', component: CrearComponent, canActivate: [authGuard] },
	{ path: 'reservas/mis-reservas', component: MisReservasComponent, canActivate: [authGuard] },
	{ path: 'me', component: MeComponent, canActivate: [authGuard] },
	{ path: 'admin/reportes', component: AdminReportComponent, canActivate: [authGuard, adminGuard] },
	{ path: '**', redirectTo: 'login' }
];
