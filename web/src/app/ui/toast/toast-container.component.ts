import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ToastService, Toast } from './toast.service';
import { NgFor, NgIf } from '@angular/common';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, NgFor],
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss'
})
export class ToastContainerComponent {
  toasts: Toast[] = [];

  constructor(private toast: ToastService) {
    this.toast.toasts$.subscribe(list => this.toasts = list);
  }

  dismiss(id: number) {
    this.toast.dismiss(id);
  }

  iconFor(t: Toast) {
    switch (t.type) {
      case 'success': return '✓';
      case 'error': return '✕';
      case 'warning': return '⚠';
      default: return 'ℹ';
    }
  }
}
