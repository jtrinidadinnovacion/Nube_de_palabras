import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    /* withHashLocation: la app se carga como archivo local (file://) dentro de Electron, donde no hay
    servidor que resuelva rutas como "/instrucciones". Con rutas tipo #/instrucciones la navegación
    queda toda del lado del cliente y nunca intenta abrir un archivo que no existe. */
    provideRouter(routes, withHashLocation()), provideClientHydration()
  ]
};
