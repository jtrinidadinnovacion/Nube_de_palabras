import { Component, ElementRef, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ModalDatos } from '../modal_datos/modal_datos';
import { ModalExportado } from '../modal_exportado/modal_exportado';
import { About } from '../about/about';
import type { DatosNube } from '../models/modal-datos';
import type { PalabraNube } from '../models/principal';

/* Lee la imagen de la nube. Los pixeles se guardan en una "tabla de sumas acumuladas" (`sumaAcumulada`) para cada fila, columna
 * dice cuántos pixeles "de nube" hay en el rectángulo que va desde la esquina (0,0) hasta ese punto.*/
interface Mascara {
  ancho: number;
  alto: number;
  datos: Uint8ClampedArray;
  sumaAcumulada: Int32Array;
  radioUtil: number;   /* Qué tan lejos del centro llega el pixel de nube más alejado. La búsqueda en espiral usa esto*/
}

interface CuadriculaOcupacion { /*  qué zonas del lienzo ya están ocupadas por palabras, sin importar cuántas palabras esten*/
  anchoCeldas: number;
  altoCeldas: number;
  celdas: Uint8Array;
}

const RUTA_MASCARA_NUBE = 'img/Nube.png';
const FACTOR_TAMANO_NUBE = 0.92;
const PALETA_COLORES_NUBE = ['#00B7BE', '#6F88FC', '#6F87FB', '#4E3092', '#55A4FB', '#00BCF2'];
const ANGULO_DORADO = 2.399963229; /* Las direcciones se reparten parejo alrededor del centro . Así las palabras se esparcen por toda la nube */
const SEPARACION_ENTRE_PUNTOS = 6;/*  Qué tan seguido pasa un punto nuevo al recorrer un anillo de la espiral. */
const PASO_DE_RADIO = 3;/* Cuánto crece el radio de la espiral entre un anillo y el siguiente. */
const TAMANO_CELDA_OCUPACION = 4; /* Tamaño de cada celda de la cuadrícula de ocupación*/
const FACTOR_COMPACTACION = 1;/*Define qué tan cerca pueden quedar las palabras sin encimarse.*/
const ZOOM_MINIMO = 0;
const ZOOM_MAXIMO = 100;
const PASO_ZOOM = 10;

@Component({
  selector: 'app-principal',
  imports: [ModalDatos, ModalExportado, About, RouterLink],
  templateUrl: './principal.html',
  styleUrl: './principal.css'
})
export class Principal {
  protected readonly mostrarModalDatos = signal(true);
  protected readonly mostrarAbout = signal(false);
  protected readonly mostrarExportado = signal(false);
  protected readonly archivoExportado = signal(false);
  protected readonly datosNube = signal<DatosNube | null>(null);
  protected readonly zoom = signal(50);
  protected readonly panX = signal(0);
  protected readonly panY = signal(0);
  protected readonly arrastrandoLienzoActivo = signal(false);
  private inicioArrastreX = 0;
  private inicioArrastreY = 0;
  private panInicialX = 0;
  private panInicialY = 0;
  protected readonly modoEntrada = signal<'texto' | 'archivo'>('texto');   // 'texto' = el usuario escribe palabras una por una.  'archivo' = el usuario sube un documento.
  protected readonly palabras = signal<string[]>([]);
  protected readonly nombreArchivoSeleccionado = signal<string | null>(null);
  protected readonly arrastrandoArchivo = signal(false);
  protected readonly leyendoArchivo = signal(false);   // true mientras se lee/interpreta el archivo (PDF y Word tardan un poco).
  protected readonly errorArchivo = signal<string | null>(null);
  protected readonly palabrasNube = signal<PalabraNube[]>([]);   // Palabras ya acomodadas dentro de la nube, para pintarse en el lienzo derecho.
  protected readonly generando = signal(false);
  private readonly lienzoRef = viewChild<ElementRef<HTMLDivElement>>('canvasEl');   // Referencia al <div> del lienzo blanco derecho (con #canvasEl en el HTML).
  private mascara: Mascara | null = null;   // Máscara de la nube ya cargada, para no volver a leer la imagen en cada clic..
  protected readonly tamanoLienzo = signal<{ ancho: number; alto: number } | null>(null); // Tamaño del lienzo donde se acomodaron las palabras la última vez que se generó la nube.
  private lecturaEnProgreso: Promise<void> | null = null;
  private lectoresPrecargados = false;// Indica si ya se solicitaron los lectores de PDF/Word para evitar volver a cargarlos cada vez que se cambia de modo.

  /* Cambia entre "Añadir texto" y "Subir archivo". Al entrar al modo "archivo" se precargan los lectores de PDF y Word para reducir el tiempo de espera al seleccionar un archivo. */
  protected establecerModo(modo: 'texto' | 'archivo'): void {
    this.modoEntrada.set(modo);
    this.archivoExportado.set(false);
    if (modo === 'archivo') {
      this.precargarLectoresDeArchivo();
    }
  }

  protected aumentarZoom(): void {
    this.zoom.update((valor) => Math.min(ZOOM_MAXIMO, valor + PASO_ZOOM));
    this.limitarPan();
  }

  protected reducirZoom(): void {
    this.zoom.update((valor) => Math.max(ZOOM_MINIMO, valor - PASO_ZOOM));
    this.limitarPan();
  }

  private limitarPan(): void {
    const tamano = this.tamanoLienzo();
    if (!tamano) {
      return;
    }
    const factor = this.zoom() / 100;
    const maxPanX = Math.max(0, (tamano.ancho * factor - tamano.ancho) / 2);
    const maxPanY = Math.max(0, (tamano.alto * factor - tamano.alto) / 2);
    this.panX.update((valor) => Math.min(maxPanX, Math.max(-maxPanX, valor)));
    this.panY.update((valor) => Math.min(maxPanY, Math.max(-maxPanY, valor)));
  }

  protected alScrollearEnLienzo(evento: WheelEvent): void { /*(wheel) movimiento de la rueda del mouse.*/
    evento.preventDefault();
    if (evento.deltaY < 0) {
      this.aumentarZoom();
    } else if (evento.deltaY > 0) {
      this.reducirZoom();
    }
  }

  protected alExportarConExito(): void {
    this.archivoExportado.set(true); /*set: asignarle un nuevo valor*/
  }

  protected iniciarArrastreLienzo(evento: MouseEvent): void {
    this.arrastrandoLienzoActivo.set(true);
    this.inicioArrastreX = evento.clientX;
    this.inicioArrastreY = evento.clientY;
    this.panInicialX = this.panX();
    this.panInicialY = this.panY();
  }

  protected moverArrastreLienzo(evento: MouseEvent): void {
    if (!this.arrastrandoLienzoActivo()) {
      return;
    }
    this.panX.set(this.panInicialX + (evento.clientX - this.inicioArrastreX));
    this.panY.set(this.panInicialY + (evento.clientY - this.inicioArrastreY));
    this.limitarPan();
  }

  /* Suelta el mouse: deja de arrastrar. */
  protected terminarArrastreLienzo(): void {
    this.arrastrandoLienzoActivo.set(false);
  }

  /* Al presionar Enter en el campo de texto. Si el usuario escribió o pegó varias palabras separadas por comas, espacios o saltos de línea, las divide y las
  agrega individualmente a la lista, en lugar de guardar todo el texto como una sola palabra. */
  protected agregarPalabra(valor: string): void {
    const nuevasPalabras = this.separarEnPalabras(valor);
    if (!nuevasPalabras.length) {
      return;
    }
    this.palabras.update((lista) => [...lista, ...nuevasPalabras]);
  }

  /* Maneja el texto pegado para conservar los saltos de línea y evitar que el navegador los elimine al insertarlo en el campo.*/
  protected alPegarTexto(evento: ClipboardEvent): void {  /*ClipboardEvent? Es el objeto que representa un evento del portapapeles.*/
    const texto = evento.clipboardData?.getData('text') ?? '';
    if (!texto.trim()) {
      return;
    }
    evento.preventDefault(); /*evita que el navegador pegue el texto directamente en el <input>*/
    this.agregarPalabra(texto);
  }

  /* Guarda el nombre del primer archivo elegido y lee su contenido para sacar las palabras que va a usar la nube. Acepta .pdf, .docx y .txt. */
  protected alSeleccionarArchivo(archivos: FileList | null): void {
    const archivo = archivos?.[0];
    if (!archivo) {
      return;
    }
    this.nombreArchivoSeleccionado.set(archivo.name);
    this.lecturaEnProgreso = this.leerPalabrasDeArchivo(archivo);
  }

  protected quitarArchivo(): void {
    this.nombreArchivoSeleccionado.set(null);
    this.errorArchivo.set(null);
    this.palabras.set([]);
    this.palabrasNube.set([]);
    this.lecturaEnProgreso = null;
  }

  protected alArrastrarSobre(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrandoArchivo.set(true);
  }

  /* El archivo salió del recuadro sin soltarse: quitamos el resaltado. */
  protected alSalirDelArrastre(): void {
    this.arrastrandoArchivo.set(false);
  }

  /* El usuario soltó el archivo dentro del recuadro. */
  protected alSoltarArchivo(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrandoArchivo.set(false);
    this.alSeleccionarArchivo(evento.dataTransfer?.files ?? null);
  }

  /** Pide que el navegador empiece a descargar pdfjs-dist y mammoth antes de que hagan falta, para adelantar esa espera. */
  private precargarLectoresDeArchivo(): void {
    if (this.lectoresPrecargados) {
      return;
    }
    this.lectoresPrecargados = true;
    void import('pdfjs-dist');
    void import('mammoth');
  }

  /* Lee el archivo (PDF, Word o texto plano), saca su texto y lo separa en palabras. El resultado reemplaza la lista de `palabras`*/
  private async leerPalabrasDeArchivo(archivo: File): Promise<void> {
    this.leyendoArchivo.set(true);
    this.errorArchivo.set(null);
    try {
      const extension = archivo.name.split('.').pop()?.toLowerCase() ?? '';/*split() divide un texto usando un separador. pop() obtiene el último elemento del arreglo.*/
      let texto: string;
      if (extension === 'pdf') {
        texto = await this.extraerTextoDePdf(archivo);
      } else if (extension === 'docx') {
        texto = await this.extraerTextoDeDocx(archivo);
      } else {
        texto = await archivo.text();
      }

      const palabrasDelArchivo = this.separarEnPalabras(texto);
      if (!palabrasDelArchivo.length) {
        this.errorArchivo.set('No encontramos palabras dentro de ese archivo.');
      }
      this.palabras.set(palabrasDelArchivo);
    } catch {
      this.errorArchivo.set('No se pudo leer el archivo. Intenta con otro .pdf, .docx o .txt.');
      this.palabras.set([]);
    } finally {
      this.leyendoArchivo.set(false);
    }
  }

  private separarEnPalabras(texto: string): string[] {
    return texto
      .split(/[^\p{L}\p{N}]+/u) /*divide el texto usando como separadores cualquier carácter que no sea una letra o un número.*/
      .map((palabra) => palabra.trim())
      .filter((palabra) => palabra.length > 0); /** elimina los elementos vacíos que puedan haberse generado.*/
  }

  /**Se carga la librería PDF.js de forma dinámica y se configura su Worker para poder leer archivos PDF de manera eficiente sin afectar el rendimiento de la aplicación. */
  private async extraerTextoDePdf(archivo: File): Promise<string> {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();

    const datosArchivo = await archivo.arrayBuffer();
    const documento = await pdfjsLib.getDocument({ data: datosArchivo }).promise;

    const textoPorPagina: string[] = [];
    for (let numeroPagina = 1; numeroPagina <= documento.numPages; numeroPagina++) {
      const pagina = await documento.getPage(numeroPagina);
      const contenido = await pagina.getTextContent();
      const textoDeLaPagina = contenido.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      textoPorPagina.push(textoDeLaPagina);
    }
    return textoPorPagina.join('\n');
  }

  private async extraerTextoDeDocx(archivo: File): Promise<string> {
    const mammoth = await import('mammoth'); /*librería para procesar archivos de Word.*/
    const datosArchivo = await archivo.arrayBuffer(); /**Convierte el archivo de Word a un formato que puede ser leído */
    const resultado = await mammoth.extractRawText({ arrayBuffer: datosArchivo });/**Mammoth lee el contenido del documento y extrae únicamente el texto. */
    return resultado.value;
  }


  protected async generar(): Promise<void> {
    if (this.generando()) {
      return;
    }

    if (this.lecturaEnProgreso) {
      await this.lecturaEnProgreso;
    }

    const palabras = this.palabras(); /**obtiene las palabras, verifica que exista el lienzo donde se dibujará */
    const lienzo = this.lienzoRef()?.nativeElement;
    if (!palabras.length || !lienzo) {
      return;
    }

    this.generando.set(true); /**prepara la generación de la nube */
    const ancho = Math.floor(lienzo.clientWidth);
    const alto = Math.floor(lienzo.clientHeight);

    try {
      await Promise.all([this.cargarMascara(ancho, alto), document.fonts.load("700 100px 'Goldplay Bold'")]);
    } catch {
      this.generando.set(false);
      return;
    }

    this.palabrasNube.set(this.acomodarPalabras(palabras, ancho, alto));
    this.tamanoLienzo.set({ ancho, alto });
    this.panX.set(0);
    this.panY.set(0);
    this.generando.set(false);
  }

  protected alGuardarDatosModal(datos: DatosNube): void {
    this.datosNube.set(datos);
    this.mostrarModalDatos.set(false);
  }

  protected guardarNube(): void {
    if (!this.datosNube()) {
      this.mostrarModalDatos.set(true);
      return;
    }

    if (!this.palabrasNube().length) {
      return;
    }

    this.mostrarExportado.set(true);
  }

  /** Dibuja la imagen de la nube en un canvas invisible del tamaño del lienzo real, guarda sus pixeles y arma la tabla de sumas acumuladas (ver `Mascara`). */
  private cargarMascara(ancho: number, alto: number): Promise<void> {
    if (this.mascara && this.mascara.ancho === ancho && this.mascara.alto === alto) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const imagen = new Image();
      imagen.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = ancho;
        canvas.height = alto;
        const contexto = canvas.getContext('2d')!;

        const escala = Math.min(ancho / imagen.naturalWidth, alto / imagen.naturalHeight) * FACTOR_TAMANO_NUBE;
        const anchoDibujado = imagen.naturalWidth * escala;
        const altoDibujado = imagen.naturalHeight * escala;
        const desplazoX = (ancho - anchoDibujado) / 2;
        const desplazoY = (alto - altoDibujado) / 2;
        contexto.drawImage(imagen, desplazoX, desplazoY, anchoDibujado, altoDibujado);

        const datos = contexto.getImageData(0, 0, ancho, alto).data;

        /* sumaAcumulada tiene una fila y una columna extra (todas en cero) al nicio, como "borde de cortesía":
        así la fórmula de la esquina de abajo no necesita casos especiales para la fila/columna 0.*/
        const anchoTabla = ancho + 1;
        const sumaAcumulada = new Int32Array(anchoTabla * (alto + 1));
        for (let fila = 0; fila < alto; fila++) {
          for (let col = 0; col < ancho; col++) {
            const esNube = datos[(fila * ancho + col) * 4 + 3] > 40 ? 1 : 0;
            const arriba = sumaAcumulada[fila * anchoTabla + (col + 1)];
            const izquierda = sumaAcumulada[(fila + 1) * anchoTabla + col];
            const arribaIzquierda = sumaAcumulada[fila * anchoTabla + col];
            sumaAcumulada[(fila + 1) * anchoTabla + (col + 1)] = esNube + arriba + izquierda - arribaIzquierda;
          }
        }

        // La búsqueda se limita al área ocupada por la nube para evitar recorrer zonas vacías del lienzo y mejorar el rendimiento.
        const centroX = ancho / 2;
        const centroY = alto / 2;
        const distancia = (px: number, py: number) => Math.hypot(px - centroX, py - centroY);
        const radioUtil = Math.max(
          distancia(desplazoX, desplazoY),
          distancia(desplazoX + anchoDibujado, desplazoY),
          distancia(desplazoX, desplazoY + altoDibujado),
          distancia(desplazoX + anchoDibujado, desplazoY + altoDibujado)
        );

        this.mascara = { ancho, alto, datos, sumaAcumulada, radioUtil };
        resolve();
      };
      imagen.onerror = () => reject(new Error('No se pudo cargar la forma de la nube'));
      imagen.src = RUTA_MASCARA_NUBE;
    });
  }

  private estaDentroDeLaMascara(x: number, y: number): boolean {
    if (!this.mascara) {
      return false;
    }
    const { ancho, alto, datos } = this.mascara;
    if (x < 0 || y < 0 || x >= ancho || y >= alto) {
      return false;
    }
    // Cada pixel ocupa 4 posiciones en el arreglo: rojo, verde, azul y transparencia .
    const indice = (Math.floor(y) * ancho + Math.floor(x)) * 4;
    return datos[indice + 3] > 40;
  }

  /* Cuenta los píxeles ocupados por la nube en un área usando una tabla de sumas acumuladas para obtener el resultado */
  private contarPixelesDeNube(x0: number, y0: number, x1: number, y1: number): number {
    const { sumaAcumulada, ancho } = this.mascara!;
    const anchoTabla = ancho + 1;
    return (
      sumaAcumulada[y1 * anchoTabla + x1] -
      sumaAcumulada[y0 * anchoTabla + x1] -
      sumaAcumulada[y1 * anchoTabla + x0] +
      sumaAcumulada[y0 * anchoTabla + x0]
    );
  }

  //**Verifica que toda la caja de la palabra permanezca dentro de la silueta de la nube, comprobando que todos sus píxeles estén contenidos.*/
  private cabeEnLaMascara(x: number, y: number, ancho: number, alto: number): boolean {
    if (!this.mascara) {
      return false;
    }
    const x0 = Math.ceil(x);
    const y0 = Math.ceil(y);
    const x1 = Math.floor(x + ancho);
    const y1 = Math.floor(y + alto);

    if (x0 < 0 || y0 < 0 || x1 > this.mascara.ancho || y1 > this.mascara.alto) {
      return false; /* Verifica que la palabra quepa completamente en el lienzo y no solo que su centro permanezca dentro de la nube.*/
    }

    if (x1 <= x0 || y1 <= y0) {
      return this.estaDentroDeLaMascara(x + ancho / 2, y + alto / 2); // Caja demasiado grande para redondear a pixeles enteros: con revisar el centro basta.
    }

    const area = (x1 - x0) * (y1 - y0);
    return this.contarPixelesDeNube(x0, y0, x1, y1) === area;
  }

  private crearCuadriculaOcupacion(ancho: number, alto: number): CuadriculaOcupacion {
    const anchoCeldas = Math.max(1, Math.ceil(ancho / TAMANO_CELDA_OCUPACION));
    const altoCeldas = Math.max(1, Math.ceil(alto / TAMANO_CELDA_OCUPACION));
    return { anchoCeldas, altoCeldas, celdas: new Uint8Array(anchoCeldas * altoCeldas) };
  }

  /**Calcula las celdas de la cuadrícula que ocupa una caja. Puede usar una versión reducida para comprobar espacio disponible o
   *  la caja completa para marcar una palabra ya colocada. */
  private celdasDeLaCaja(
    cuadricula: CuadriculaOcupacion,
    x: number,
    y: number,
    ancho: number,
    alto: number,
    encoger: boolean
  ): { celdaX0: number; celdaY0: number; celdaX1: number; celdaY1: number } {
    const margenX = encoger ? (ancho * (1 - FACTOR_COMPACTACION)) / 2 : 0;
    const margenY = encoger ? (alto * (1 - FACTOR_COMPACTACION)) / 2 : 0;
    return {
      celdaX0: Math.max(0, Math.floor((x + margenX) / TAMANO_CELDA_OCUPACION)),
      celdaY0: Math.max(0, Math.floor((y + margenY) / TAMANO_CELDA_OCUPACION)),
      celdaX1: Math.min(cuadricula.anchoCeldas - 1, Math.floor((x + ancho - margenX) / TAMANO_CELDA_OCUPACION)),
      celdaY1: Math.min(cuadricula.altoCeldas - 1, Math.floor((y + alto - margenY) / TAMANO_CELDA_OCUPACION)),
    };
  }

  /** Revisa si la caja de una palabra nueva, chocaría con alguna zona ya ocupada. */
  private zonaOcupada(cuadricula: CuadriculaOcupacion, x: number, y: number, ancho: number, alto: number): boolean {
    const { celdaX0, celdaY0, celdaX1, celdaY1 } = this.celdasDeLaCaja(cuadricula, x, y, ancho, alto, true);
    for (let fila = celdaY0; fila <= celdaY1; fila++) {
      const base = fila * cuadricula.anchoCeldas;
      for (let col = celdaX0; col <= celdaX1; col++) {
        if (cuadricula.celdas[base + col]) {
          return true;
        }
      }
    }
    return false;
  }

  /** Cuenta cuántas celdas (ya encogidas por compactación) de una caja nueva están ocupadas (0 = no choca con nada). */
  private contarCeldasOcupadas(cuadricula: CuadriculaOcupacion, x: number, y: number, ancho: number, alto: number): number {
    const { celdaX0, celdaY0, celdaX1, celdaY1 } = this.celdasDeLaCaja(cuadricula, x, y, ancho, alto, true);
    let contador = 0;
    for (let fila = celdaY0; fila <= celdaY1; fila++) {
      const base = fila * cuadricula.anchoCeldas;
      for (let col = celdaX0; col <= celdaX1; col++) {
        if (cuadricula.celdas[base + col]) {
          contador++;
        }
      }
    }
    return contador;
  }

  private marcarZonaOcupada(cuadricula: CuadriculaOcupacion, x: number, y: number, ancho: number, alto: number): void {
    const { celdaX0, celdaY0, celdaX1, celdaY1 } = this.celdasDeLaCaja(cuadricula, x, y, ancho, alto, false);
    for (let fila = celdaY0; fila <= celdaY1; fila++) {
      const base = fila * cuadricula.anchoCeldas;
      for (let col = celdaX0; col <= celdaX1; col++) {
        cuadricula.celdas[base + col] = 1;
      }
    }
  }

  /**Genera puntos de búsqueda desde el centro hacia afuera en anillos, distribuyendo los puntos uniformemente para encontrar una posición adecuada para cada palabra.*/
  private *puntosEnEspiral(
    centroX: number,
    centroY: number,
    radioMaximo: number,
    anguloInicial: number
  ): Generator<{ x: number; y: number }> {
    yield { x: centroX, y: centroY }; // `yield` devuelve un valor y pausa la ejecución de la función hasta que se solicite el siguiente.
    for (let radio = PASO_DE_RADIO; radio < radioMaximo; radio += PASO_DE_RADIO) {
      const puntosEnEsteAnillo = Math.max(6, Math.round((2 * Math.PI * radio) / SEPARACION_ENTRE_PUNTOS));
      for (let i = 0; i < puntosEnEsteAnillo; i++) {
        const angulo = anguloInicial + (i / puntosEnEsteAnillo) * 2 * Math.PI;
        yield { x: centroX + radio * Math.cos(angulo), y: centroY + radio * Math.sin(angulo) };
      }
    }
  }

  private buscarLugarEnEspiral(
    anchoCaja: number,
    altoCaja: number,
    centroX: number,
    centroY: number,
    radioMaximo: number,
    cuadricula: CuadriculaOcupacion,
    anguloInicial: number
  ): { x: number; y: number } | null {
    for (const centro of this.puntosEnEspiral(centroX, centroY, radioMaximo, anguloInicial)) {
      const x = centro.x - anchoCaja / 2;
      const y = centro.y - altoCaja / 2;
      if (this.cabeEnLaMascara(x, y, anchoCaja, altoCaja) && !this.zonaOcupada(cuadricula, x, y, anchoCaja, altoCaja)) {
        return { x, y };
      }
    }
    return null;
  }

  private buscarLugarConMenosEncimado(
    anchoCaja: number,
    altoCaja: number,
    centroX: number,
    centroY: number,
    radioMaximo: number,
    cuadricula: CuadriculaOcupacion,
    anguloInicial: number
  ): { x: number; y: number } {
    let mejorLugar = { x: centroX - anchoCaja / 2, y: centroY - altoCaja / 2 };
    let menosEncimados = Infinity;

    for (const centro of this.puntosEnEspiral(centroX, centroY, radioMaximo, anguloInicial)) {
      const x = centro.x - anchoCaja / 2;
      const y = centro.y - altoCaja / 2;

      if (!this.cabeEnLaMascara(x, y, anchoCaja, altoCaja)) {
        continue;
      }
      const encimados = this.contarCeldasOcupadas(cuadricula, x, y, anchoCaja, altoCaja);
      if (encimados < menosEncimados) {
        menosEncimados = encimados;
        mejorLugar = { x, y };
        if (encimados === 0) {
          break;
        }
      }
    }

    return mejorLugar;
  }

  private acomodarPalabras(palabrasCrudas: string[], ancho: number, alto: number): PalabraNube[] {
    /* Cuenta repeticiones sin distinguir mayúsculas/minúsculas ni espacios extra. */
    const conteos = new Map<string, number>();
    for (const palabra of palabrasCrudas) {
      const clave = palabra.trim().toLowerCase();
      conteos.set(clave, (conteos.get(clave) ?? 0) + 1);
    }

    // Nos quedamos con una sola aparición de cada palabra repetida.
    const yaVistas = new Set<string>();
    const palabrasUnicas: Array<{ texto: string; conteo: number }> = [];
    for (const palabra of palabrasCrudas) {
      const limpio = palabra.trim();
      const clave = limpio.toLowerCase();
      if (!yaVistas.has(clave)) {
        yaVistas.add(clave);
        palabrasUnicas.push({ texto: limpio, conteo: conteos.get(clave)! });
      }
    }

    // De la más repetida a la menos repetida.
    const ordenadas = palabrasUnicas.sort((a, b) => b.conteo - a.conteo);

    /*Calcula el rango de tamaños según el espacio disponible en la nube, estimando un tamaño de letra que permita acomodar las palabras sin
    error y aprovechando el área de forma equilibrada.*/
    const areaDisponible = this.contarPixelesDeNube(0, 0, ancho, alto);
    const longitudPromedio = ordenadas.reduce((suma, p) => suma + p.texto.length, 0) / ordenadas.length;
    const factorAnchoPorCaracter = 0.62; // ancho como fracción del tamaño de letra
    const factorAltoDeLinea = 1.1;
    const objetivoRelleno = 0.55; // qué fracción del área de la nube intentamos ocupar en promedio
    const areaObjetivo = areaDisponible * objetivoRelleno;
    const tamanoTipico = Math.sqrt(
      areaObjetivo / (ordenadas.length * factorAnchoPorCaracter * longitudPromedio * factorAltoDeLinea)
    );

    const tamanoMinimoAbsoluto = Math.max(6, Math.min(10, Math.round(tamanoTipico * 0.55)));
    const tamanoMinimoInicial = Math.max(tamanoMinimoAbsoluto, Math.round(tamanoTipico * 0.75));
    const tamanoMaximoCalculado = Math.max(tamanoMinimoInicial + 8, Math.round(tamanoTipico * 2.4));
    const tamanoMaximo = Math.min(tamanoMaximoCalculado, Math.min(ancho, alto) * 0.22);
    const conteoMasAlto = ordenadas[0].conteo;
    const conteoMasBajo = ordenadas[ordenadas.length - 1].conteo;
    const rangoConteos = conteoMasAlto - conteoMasBajo;
    const contextoMedicion = document.createElement('canvas').getContext('2d')!;    // Canvas invisible que solo usamos para medir cuánto espacio ocupa cada palabra.
    const centroX = ancho / 2;
    const centroY = alto / 2;
    const radioMaximo = this.mascara?.radioUtil ?? Math.max(ancho, alto);// Usa el radio real de la nube para limitar la búsqueda y evitar probar posiciones que quedan fuera de la silueta.
    const cuadricula = this.crearCuadriculaOcupacion(ancho, alto);

    const resultado: PalabraNube[] = [];

    ordenadas.forEach((palabra, indice) => {
      const proporcionRepeticion = rangoConteos > 0 ? (palabra.conteo - conteoMasBajo) / rangoConteos : 0;
      const proporcionOrden = ordenadas.length > 1 ? 1 - indice / (ordenadas.length - 1) : 1; // Agrega una ligera variación de tamaño entre palabras con la misma frecuencia para mejorar la apariencia visual.
      const proporcion = proporcionRepeticion * 0.7 + proporcionOrden * 0.3;
      const color = PALETA_COLORES_NUBE[indice % PALETA_COLORES_NUBE.length];
      const anguloInicial = indice * ANGULO_DORADO;
      /*Cada palabra inicia la búsqueda desde un punto distinto de la nube para distribuirlas de forma uniforme y evitar que se concentren en el centro.*/
      const radioObjetivo = radioMaximo * Math.sqrt((indice + 0.5) / ordenadas.length);
      const centroBusquedaX = centroX + radioObjetivo * Math.cos(anguloInicial);
      const centroBusquedaY = centroY + radioObjetivo * Math.sin(anguloInicial);

      let tamanoIntento = Math.round(tamanoMinimoInicial + proporcion * (tamanoMaximo - tamanoMinimoInicial));
      let anchoPalabra = 0;
      let altoPalabra = 0;
      let lugar: { x: number; y: number } | null = null;

      
      while (tamanoIntento >= tamanoMinimoAbsoluto) {// Intento con el tamaño ideal y, si no cabe, se achica.
        contextoMedicion.font = `700 ${tamanoIntento}px 'Goldplay Bold', sans-serif`;
        anchoPalabra = contextoMedicion.measureText(palabra.texto).width;
        altoPalabra = tamanoIntento * 1.1;

        lugar = this.buscarLugarEnEspiral(anchoPalabra, altoPalabra, centroBusquedaX, centroBusquedaY, radioMaximo, cuadricula, anguloInicial);
        if (lugar) {
          break;
        }
        tamanoIntento = Math.round(tamanoIntento * 0.85);
      }

      // 4) Último recurso: al tamaño mínimo, buscamos el lugar donde MENOS se encima con otras palabras.
      if (!lugar) {
        tamanoIntento = tamanoMinimoAbsoluto;
        contextoMedicion.font = `700 ${tamanoIntento}px 'Goldplay Bold', sans-serif`;
        anchoPalabra = contextoMedicion.measureText(palabra.texto).width;
        altoPalabra = tamanoIntento * 1.1;
        lugar = this.buscarLugarConMenosEncimado(anchoPalabra, altoPalabra, centroBusquedaX, centroBusquedaY, radioMaximo, cuadricula, anguloInicial);
      }

      if (lugar) {
        this.marcarZonaOcupada(cuadricula, lugar.x, lugar.y, anchoPalabra, altoPalabra);
        resultado.push({ texto: palabra.texto, tamano: tamanoIntento, color, izquierda: lugar.x, arriba: lugar.y });
      }
    });

    return resultado;
  }
}
