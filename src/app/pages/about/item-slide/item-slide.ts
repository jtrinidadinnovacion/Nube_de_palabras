import { Component, Input, signal } from '@angular/core';
import type { ItemSlider } from '../../models/interfaces';

@Component({
  selector: 'app-item-slide',
  imports: [],
  templateUrl: './item-slide.html',
  styleUrl: './item-slide.css'
})
export class ItemSlide {
  @Input({ required: true }) slideshowItems!: ItemSlider[];

  protected readonly indice = signal(0);

  protected anterior(): void {
    this.indice.update((i) => (i - 1 + this.slideshowItems.length) % this.slideshowItems.length);
  }

  protected siguiente(): void {
    this.indice.update((i) => (i + 1) % this.slideshowItems.length);
  }

  protected irA(i: number): void {
    this.indice.set(i);
  }
}
