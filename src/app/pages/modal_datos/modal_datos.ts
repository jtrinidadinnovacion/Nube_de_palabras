import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import type { DatosNube } from '../models/modal-datos';

@Component({
  selector: 'app-modal-datos',
  imports: [FormsModule],
  templateUrl: './modal_datos.html',
  styleUrl: './modal_datos.css'
})
export class ModalDatos {
  @Output() guardado = new EventEmitter<DatosNube>();

  protected readonly datos: DatosNube = {
    nombreEstudiante: '',
    semestre: '',
    nombreDocente: '',
    asignatura: '',
    tema: '',
  };

  protected filtrarSoloNumeros(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const limpio = input.value.replace(/[^0-9]/g, '');
    this.datos.semestre = limpio;
    if (input.value !== limpio) {
      input.value = limpio;
    }
  }

  protected siguiente(formulario: NgForm): void {
    if (formulario.invalid) {
      return;
    }
    this.guardado.emit({ ...this.datos });
  }
}
