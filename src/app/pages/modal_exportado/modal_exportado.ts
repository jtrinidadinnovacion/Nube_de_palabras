import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, signal, viewChild } from '@angular/core';
import type { DatosNube } from '../models/modal-datos';
import type { PalabraNube } from '../models/principal';

@Component({
  selector: 'app-modal-exportado',
  imports: [],
  templateUrl: './modal_exportado.html',
  styleUrl: './modal_exportado.css'
})
export class ModalExportado implements OnChanges {
  @Input({ required: true }) datos!: DatosNube;
  @Input({ required: true }) palabras!: PalabraNube[];
  @Input({ required: true }) tamanoLienzo!: { ancho: number; alto: number };
  @Output() closed = new EventEmitter<void>();
  @Output() exportado = new EventEmitter<void>();

  private readonly documentoRef = viewChild<ElementRef<HTMLDivElement>>('documentoRef');

  protected readonly exportando = signal(true);
  protected readonly error = signal(false);
  private yaExportado = false;

  ngOnChanges(): void {
    if (this.yaExportado) {
      return;
    }
    this.yaExportado = true;
    void this.intentarExportar();
  }

  protected close(): void {
    this.closed.emit();
  }

  protected reintentar(): void {
    void this.intentarExportar();
  }

  private async intentarExportar(): Promise<void> {
    this.exportando.set(true);
    this.error.set(false);
    try {
      if (!navigator.onLine) {
        throw new Error('Sin conexión a internet.');
      }
      await this.exportarPdf();
      this.exportando.set(false);
      this.exportado.emit();
    } catch {
      this.exportando.set(false);
      this.error.set(true);
    }
  }

  private async exportarPdf(): Promise<void> {
    const { imagen, ancho, alto } = await this.construirImagenDocumento();
    const { jsPDF } = await import('jspdf');
    const documento = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [297, 210] });
    const anchoPagina = documento.internal.pageSize.getWidth();
    const altoPagina = documento.internal.pageSize.getHeight();

    const proporcionImagen = alto / ancho;
    let anchoImagen = anchoPagina;
    let altoImagen = anchoImagen * proporcionImagen;
    if (altoImagen > altoPagina) {
      altoImagen = altoPagina;
      anchoImagen = altoImagen / proporcionImagen;
    }
    const x = (anchoPagina - anchoImagen) / 2;
    const y = (altoPagina - altoImagen) / 2;

    documento.addImage(imagen, 'PNG', x, y, anchoImagen, altoImagen);
    documento.save(this.nombreArchivoParaGuardar());
  }

  private nombreArchivoParaGuardar(): string {
    const base = this.datos.tema.trim() || this.datos.nombreEstudiante.trim() || 'nube-de-palabras';
    const slug = base
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return `${slug || 'nube-de-palabras'}.pdf`;
  }

  /** Rasteriza el documento oculto (`#documentoRef`, ver la plantilla): así el PDF sale pintado con el mismo HTML/CSS */
  private async construirImagenDocumento(): Promise<{ imagen: string; ancho: number; alto: number }> {
    await Promise.all([
      document.fonts.load("700 100px 'Goldplay Bold'"),
      document.fonts.load("700 100px 'Goldplay Medium'"),
      document.fonts.load("500 100px 'Goldplay Medium'"),
    ]);
    // Un frame extra para asegurarnos de que Angular ya pintó los @Input en el documento oculto.
    await new Promise(resolve =>
    requestAnimationFrame(() =>
        requestAnimationFrame(resolve)
    )
);
    const elemento = this.documentoRef()!.nativeElement;
    this.centrarNube(elemento);
    const { default: html2canvas } = await import('html2canvas');
    /* scale:4 y PNG (sin pérdida) en vez de JPEG: se ve más nítido, especialmente el texto de la nube.
    Pesa más el PDF, pero eso ya no es problema (límite de 10MB con espacio de sobra). */
    const canvas = await html2canvas(elemento, { backgroundColor: '#ffffff', scale: 4 });

    return { imagen: canvas.toDataURL('image/png'), ancho: canvas.width, alto: canvas.height };
  }

  private centrarNube(elemento: HTMLElement): void {
    const nube = elemento.querySelector<HTMLElement>('.documento-exportar__nube');
    const palabras = nube?.querySelectorAll<HTMLElement>('.documento-exportar__palabra');
    if (!nube || !palabras || !palabras.length) {
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    palabras.forEach(palabra => {
      const left = parseFloat(palabra.style.left);
      const top = parseFloat(palabra.style.top);
      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, left + palabra.offsetWidth);
      maxY = Math.max(maxY, top + palabra.offsetHeight);
    });

    const dx = nube.clientWidth / 2 - (minX + maxX) / 2;
    const dy = nube.clientHeight / 2 - (minY + maxY) / 2;
    const ajusteVerticalNubePx = -40;
    nube.style.transform = `scale(1.15) translate(${dx}px, ${dy + ajusteVerticalNubePx}px)`;
  }
}
