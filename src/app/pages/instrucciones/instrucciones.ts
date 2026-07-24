import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-instrucciones',
  imports: [],
  templateUrl: './instrucciones.html',
  styleUrl: './instrucciones.css'
})
export class Instrucciones {
  protected readonly slides: string[][] = [
    [
      'Haz clic en el botón “Empezar” para acceder al espacio de creación.',
      'Llena todos los campos en la ventana que se muestra.',
      'Puedes ingresar información de dos formas:',
      'Escribiendo o pegando el texto manualmente.',
      'Subiendo un archivo desde tu computadora mediante el botón “Subir archivo”.',
    ],
    [
      'Una vez cargado el contenido, presiona “Generar”. El sistema analizará el texto y mostrará las palabras más relevantes con distintos tamaños según su frecuencia o importancia.',
      'La nube generada aparecerá en el área principal de trabajo. Verifica que el diseño, las palabras y la distribución sean correctos.',
      'Si deseas empezar de nuevo, utiliza la opción “Borrar” para limpiar el contenido y cargar otro texto o archivo.',
      'Cuando estés satisfecho con el resultado, puedes exportar tu nube de palabras en formato PDF como archivo entregable.',
    ],
  ];

  protected readonly currentSlide = signal(0);

  constructor(private readonly router: Router) {}

  protected goTo(index: number): void {
    this.currentSlide.set(index);
  }

  protected advanceOrStart(): void {
    if (this.currentSlide() < this.slides.length - 1) {
      this.currentSlide.update((i) => i + 1);
    } else {
      this.router.navigate(['/principal']);
    }
  }
}
