import { Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { TitlebarService } from './services/titlebar.service';

/* Forma mínima de ipcRenderer que usamos aquí (ver preload/contextIsolation:false en el proyecto de Electron). */
interface IpcRenderer {
  send(canal: string): void;
  on(canal: string, escucha: (...datos: unknown[]) => void): void;
}

/* Con nodeIntegration:true y contextIsolation:false, Electron expone `require` como global en la ventana. */
interface VentanaConElectron extends Window {
  require?: (modulo: 'electron') => { ipcRenderer: IpcRenderer };
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly router = inject(Router);
  private readonly titlebarService = inject(TitlebarService);
  protected readonly pantallaCompleta = signal(false);
  private readonly rutaEnPrincipal = signal(this.router.url.startsWith('/principal'));
  /* La barra de la ventana usa imágenes distintas dentro de "principal" (prin_fondo/prin_mini/prin_max) que en el resto
  de las pantallas -inicio, instrucciones, about- (ini_fondo/ini_mini/ini-max). "Acerca de" se abre encima de la ruta
  "principal" sin cambiarla, así que también cuenta como "no principal" mientras esté abierto. */
  protected readonly enPrincipal = computed(() => this.rutaEnPrincipal() && !this.titlebarService.mostrandoAbout());
  /* Ícono de maximizar/restaurar: cada grupo de pantallas tiene su propio par según el estado de la ventana.
  En pantalla completa el botón restaura (achica); en ventana normal, maximiza (agranda). */
  protected readonly iconoMaximizar = computed(() => {
    if (this.enPrincipal()) {
      return this.pantallaCompleta() ? 'img/prin_max.png' : 'img/prin_max2.png';
    }
    return this.pantallaCompleta() ? 'img/ini-max.png' : 'img/ini_max2.png';
  });
  private ipcRenderer: IpcRenderer | null = null;

  constructor() {
    this.router.events.pipe(filter((evento) => evento instanceof NavigationEnd)).subscribe(() => {
      this.rutaEnPrincipal.set(this.router.url.startsWith('/principal'));
    });

    afterNextRender(() => {
      const ventana = window as VentanaConElectron;

      if (ventana.require) {
        /* Corriendo dentro de Electron: los botones controlan la ventana real por IPC (ver main.js del proyecto de Electron). */
        this.ipcRenderer = ventana.require('electron').ipcRenderer;
        this.ipcRenderer.on('maximizeComplet', () => this.pantallaCompleta.set(true));
        this.ipcRenderer.on('resizeRestoreComplet', () => this.pantallaCompleta.set(false));
        this.ipcRenderer.on('restoreComplet', () => this.pantallaCompleta.set(false));
      } else {
        /* Corriendo en un navegador normal: sin IPC, usamos lo único que el navegador permite (pantalla completa). */
        document.addEventListener('fullscreenchange', () => {
          this.pantallaCompleta.set(!!document.fullscreenElement);
        });
      }

      /* Evita que las imágenes se puedan arrastrar fuera de la página (Firefox no respeta -webkit-user-drag). */
      document.addEventListener('dragstart', (evento) => {
        if (evento.target instanceof HTMLImageElement) {
          evento.preventDefault();
        }
      });
    });
  }

  /* En el navegador no existe forma de minimizar la ventana real; dentro de Electron sí (IPC "minimize"). */
  protected minimizar(): void {
    this.ipcRenderer?.send('minimize');
  }

  protected alternarPantallaCompleta(): void {
    if (this.ipcRenderer) {
      this.ipcRenderer.send(this.pantallaCompleta() ? 'restore' : 'maximize');
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();    
    } else {
      void document.documentElement.requestFullscreen();
    }
  }

  protected cerrar(): void {
    if (this.ipcRenderer) {
      this.ipcRenderer.send('close');
      return;
    }
    window.close();
  }
}
