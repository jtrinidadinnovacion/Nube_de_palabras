import { Injectable, signal } from '@angular/core';

/* La barra de la ventana (app.ts) usa imágenes distintas según la pantalla. Como "Acerca de" es un modal que se
abre encima de la ruta "principal" (no cambia de ruta), esta señal le avisa a la barra que, mientras esté abierto,
debe verse como el resto de las pantallas (ini_fondo) y no como "principal" (prin_fondo). */
@Injectable({ providedIn: 'root' })
export class TitlebarService {
  readonly mostrandoAbout = signal(false);
}
