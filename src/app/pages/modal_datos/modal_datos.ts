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

  protected siguiente(formulario: NgForm): void {
    if (formulario.invalid) {
      return;
    }
    this.guardado.emit({ ...this.datos });
  }
}
