import { Component, afterNextRender, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

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
  protected readonly pantallaCompleta = signal(false);
  private ipcRenderer: IpcRenderer | null = null;

  constructor() {
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
