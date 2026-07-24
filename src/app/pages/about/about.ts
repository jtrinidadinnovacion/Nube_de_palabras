import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import type { ItemSlider, Member } from '../models/interfaces';
import { ItemSlide } from './item-slide/item-slide';

@Component({
  selector: 'app-about',
  imports: [ItemSlide],
  templateUrl: './about.html',
  styleUrl: './about.css'
})
export class About implements OnInit {
  @Output() closed = new EventEmitter<void>();

  private readonly equipoDesarrollo: ItemSlider[] = [
    {
      members: [
        { name: 'Ing. Alicia Morales De Aquino', role: 'Desarrolladora' },
        { name: 'Ing. Oscar Enrique Vargas Guerrero', role: 'Desarrollador' },
        { name: 'Ing. Carlos Alberto Pomposo Farfán', role: 'Desarrollador' },
      ],
    },
    {
      members: [
        { name: 'Lic. Yael Gerardo Alarcón Flores', role: 'Desarrollador' },
        { name: 'Ing. Carlos Martinez Tapia', role: 'Desarrollador' },
        { name: 'Ing. Antonio de Jesús Tristan Moreno', role: 'Desarrollador' },
      ],
    },
    {
      members: [
        { name: 'Ing. Jocelyn Trinidad Sánchez', role: 'Desarrollador' },
        ],
    },
  ];

  private readonly equipoDiseno: ItemSlider[] = [
    {
      members: [
        { name: 'Lic. Claudia Paola Bautista Corona', role: 'Diseñadora' },
        { name: 'Lic. Denhy Guadalupe Monroy Angeles', role: 'Diseñadora' },
        { name: 'Lic. Elda Eloísa Vargas Ledezma', role: 'Diseñadora' },
      ],
    },
    {
      members: [
        { name: 'Lic. Jesús Eduardo Rojas Delgado', role: 'Diseñador' },
        { name: 'Lic. Ricardo Javier Pérez Torres', role: 'Diseñador' },
      ],
    },
  ];

  protected readonly equipoDireccion: ItemSlider[] = [
    {
      members: [
        { name: 'Ing. David Campuzano Juárez', role: 'Director' },
        { name: 'Ing. Abigail Arrazola Acosta', role: 'Gerente de Innovación' },
        { name: 'Lic. Diana Ivette Camargo Pérez', role: 'Gerente de Diseño' },
      ],
    },
  ];

  protected listaDesarrollo: ItemSlider[] = [];
  protected listaDiseno: ItemSlider[] = [];

  /* Junta a todo el equipo de cada área, lo baraja y lo vuelve a repartir en grupos de 3, para que
   * la tarjeta no muestre siempre a las mismas personas primero. */
  ngOnInit(): void {
    this.listaDesarrollo = this.agruparDeATres(this.mezclar(this.aplanar(this.equipoDesarrollo)));
    this.listaDiseno = this.agruparDeATres(this.mezclar(this.aplanar(this.equipoDiseno)));
  }

  protected close(): void {
    this.closed.emit();
  }

  private aplanar(slides: ItemSlider[]): Member[] {
    return slides.flatMap((slide) => slide.members);
  }

  /* Baraja (Fisher-Yates) una copia del arreglo, sin tocar el original. */
  private mezclar(miembros: Member[]): Member[] {
    const resultado = [...miembros];
    for (let i = resultado.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [resultado[i], resultado[j]] = [resultado[j], resultado[i]];
    }
    return resultado;
  }

  private agruparDeATres(miembros: Member[]): ItemSlider[] {
    const grupos: ItemSlider[] = [];
    for (let i = 0; i < miembros.length; i += 3) {
      grupos.push({ members: miembros.slice(i, i + 3) });
    }
    return grupos;
  }
}
