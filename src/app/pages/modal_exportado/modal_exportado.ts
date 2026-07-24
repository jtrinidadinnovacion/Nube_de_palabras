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

  // Referencia al contenido que se captura para generar un PDF con el mismo diseño que se muestra en pantalla.
  private readonly documentoRef = viewChild<ElementRef<HTMLDivElement>>('documentoRef');

  protected readonly exportando = signal(true);
  protected readonly error = signal(false);
  private yaExportado = false;

  /* En cuanto llegan los @Input (datos, palabras y tamaño del lienzo), armamos el PDF una sola vez. */
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

    const documento = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
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

  /* Convierte el tema (o el nombre del estudiante, si no hay tema) en un nombre de archivo seguro. */
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

  /**
   * Rasteriza el documento oculto (`#documentoRef`, ver la plantilla): así el PDF sale pintado con el
   * mismo HTML/CSS real que arma el panel de datos y la nube, en vez de una aproximación dibujada a
   * mano en un canvas.
   */
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
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(elemento, { backgroundColor: '#ffffff', scale: 2 });

    return { imagen: canvas.toDataURL('image/png'), ancho: canvas.width, alto: canvas.height };
  }
}
