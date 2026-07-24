import { Routes } from '@angular/router';
import { Inicio } from './pages/inicio/inicio';
import { Instrucciones } from './pages/instrucciones/instrucciones';
import { Principal } from './pages/principal/principal';

export const routes: Routes = [
  { path: '', component: Inicio },
  { path: 'instrucciones', component: Instrucciones },
  { path: 'principal', component: Principal },
];
