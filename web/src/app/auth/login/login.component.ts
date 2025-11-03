import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  credentials = { email: '', password: '' };

  constructor(private auth: AuthService) {}

  onSubmit() {
    this.auth.login(this.credentials).subscribe({
      error: (err) => console.error('Error al iniciar sesión:', err)
    });
  }
}
