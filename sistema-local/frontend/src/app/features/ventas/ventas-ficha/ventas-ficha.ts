import { DecimalPipe, LowerCasePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { CONDICION_IVA_LEGIBLE, Cliente, tipoFacturaDeCliente } from '../../../core/models/cliente.model';
import { Comprobante, CONDICION_VENTA_FICHA_OPCIONES, CondicionVenta } from '../../../core/models/comprobante.model';
import { EstadoVenta, IVA_PORCENTAJE_OPCIONES, UNIDAD_MEDIDA_OPCIONES, Venta } from '../../../core/models/venta.model';
import { ClientesService } from '../../../core/services/clientes.service';
import { FacturacionService } from '../../../core/services/facturacion.service';
import { VentasService } from '../../../core/services/ventas.service';
import { extraerMensajeError, extraerMensajeErrorAsync } from '../../../shared/utils/errores';
import { abrirPdfEnNuevaPestana } from '../../../shared/utils/pdf';

@Component({
  selector: 'app-ventas-ficha',
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, LowerCasePipe],
  templateUrl: './ventas-ficha.html',
})
export class VentasFicha {
  private readonly fb = inject(FormBuilder);
  private readonly clientesService = inject(ClientesService);
  private readonly ventasService = inject(VentasService);
  private readonly facturacionService = inject(FacturacionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly EstadoVenta = EstadoVenta;
  protected readonly ivaOpciones = IVA_PORCENTAJE_OPCIONES;
  protected readonly unidadMedidaOpciones = UNIDAD_MEDIDA_OPCIONES;
  protected readonly condicionVentaOpciones = CONDICION_VENTA_FICHA_OPCIONES;

  // --- Búsqueda de cliente (cuando no hay ficha abierta en la URL) ---
  protected readonly buscador = new FormControl('', { nonNullable: true });
  protected readonly clientesEncontrados = signal<Cliente[]>([]);
  protected readonly buscandoClientes = signal(false);
  protected readonly abriendoFichaDe = signal<string | null>(null);

  // --- Ficha actual ---
  protected readonly venta = signal<Venta | null>(null);
  protected readonly cargandoFicha = signal(false);
  protected readonly error = signal<string | null>(null);

  // --- Alta de línea ---
  protected readonly guardandoLinea = signal(false);
  protected readonly lineaForm = this.fb.nonNullable.group({
    descripcion: ['', Validators.required],
    cantidad: [1, [Validators.required, Validators.min(0.001)]],
    precioUnitario: [0, [Validators.required, Validators.min(0)]],
    ivaPorcentaje: [21],
    unidadMedida: [7],
  });

  // --- Presupuesto ---
  protected readonly generandoPresupuesto = signal(false);

  // --- Facturar ---
  protected readonly modalFacturarAbierto = signal(false);
  protected readonly condicionVentaSeleccionada = signal<CondicionVenta>(CondicionVenta.CONTADO);
  protected readonly facturando = signal(false);
  protected readonly errorFacturar = signal<string | null>(null);
  protected readonly comprobanteRecienEmitido = signal<Comprobante | null>(null);
  protected readonly descargandoPdf = signal(false);

  constructor() {
    this.buscador.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((nombre) => this.buscarClientes(nombre));

    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const ventaId = params.get('ventaId');
      this.comprobanteRecienEmitido.set(null);
      this.error.set(null);
      if (ventaId) {
        this.cargarFicha(ventaId);
      } else {
        this.venta.set(null);
        this.buscarClientes('');
      }
    });
  }

  protected readonly condicionIvaLegible = CONDICION_IVA_LEGIBLE;

  protected tipoFacturaCliente(cliente: Cliente): 'A' | 'B' {
    return tipoFacturaDeCliente(cliente);
  }

  protected etiquetaPrecio(cliente: Cliente): string {
    return this.tipoFacturaCliente(cliente) === 'A' ? 'Precio NETO (sin IVA)' : 'Precio (IVA incluido)';
  }

  protected subtotalLinea(cantidad: number | string, precioUnitario: number | string): number {
    return Math.round(Number(cantidad) * Number(precioUnitario) * 100) / 100;
  }

  protected unidadEtiqueta(codigo: number): string {
    return this.unidadMedidaOpciones.find((u) => u.valor === codigo)?.etiqueta ?? `Cód. ${codigo}`;
  }

  protected numeroComprobante(comprobante: Comprobante): string {
    const pv = String(comprobante.puntoVenta).padStart(4, '0');
    const nro = String(comprobante.numero).padStart(8, '0');
    return `${pv}-${nro}`;
  }

  // --- Búsqueda ---

  private buscarClientes(nombre: string): void {
    this.buscandoClientes.set(true);
    this.clientesService.listar(nombre || undefined).subscribe({
      next: (clientes) => {
        this.clientesEncontrados.set(clientes);
        this.buscandoClientes.set(false);
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.buscandoClientes.set(false);
      },
    });
  }

  protected abrirFichaDeCliente(cliente: Cliente): void {
    this.abriendoFichaDe.set(cliente.id);
    this.error.set(null);
    this.ventasService.abrirFicha(cliente.id).subscribe({
      next: (venta) => {
        this.abriendoFichaDe.set(null);
        this.router.navigate(['/ventas', venta.id]);
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.abriendoFichaDe.set(null);
      },
    });
  }

  protected volverABuscar(): void {
    this.router.navigate(['/ventas']);
  }

  // --- Ficha ---

  private cargarFicha(ventaId: string): void {
    this.cargandoFicha.set(true);
    this.ventasService.obtener(ventaId).subscribe({
      next: (venta) => {
        this.venta.set(venta);
        this.cargandoFicha.set(false);
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.cargandoFicha.set(false);
      },
    });
  }

  private refrescarFicha(): void {
    const actual = this.venta();
    if (actual) this.cargarFicha(actual.id);
  }

  // --- Líneas ---

  protected agregarLinea(): void {
    const actual = this.venta();
    if (!actual || this.lineaForm.invalid) {
      this.lineaForm.markAllAsTouched();
      return;
    }
    this.guardandoLinea.set(true);
    this.error.set(null);
    this.ventasService.agregarLinea(actual.id, this.lineaForm.getRawValue()).subscribe({
      next: (venta) => {
        this.venta.set(venta);
        this.guardandoLinea.set(false);
        this.lineaForm.reset({
          descripcion: '',
          cantidad: 1,
          precioUnitario: 0,
          ivaPorcentaje: 21,
          unidadMedida: 7,
        });
      },
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.guardandoLinea.set(false);
      },
    });
  }

  protected quitarLinea(lineaId: string): void {
    const actual = this.venta();
    if (!actual) return;
    this.error.set(null);
    this.ventasService.quitarLinea(actual.id, lineaId).subscribe({
      next: (venta) => this.venta.set(venta),
      error: (err) => this.error.set(extraerMensajeError(err)),
    });
  }

  // --- Presupuesto ---

  protected imprimirPresupuesto(): void {
    const actual = this.venta();
    if (!actual) return;
    this.generandoPresupuesto.set(true);
    this.error.set(null);
    this.ventasService.presupuestoPdf(actual.id).subscribe({
      next: (blob) => {
        abrirPdfEnNuevaPestana(blob);
        this.generandoPresupuesto.set(false);
      },
      error: async (err) => {
        this.error.set(await extraerMensajeErrorAsync(err));
        this.generandoPresupuesto.set(false);
      },
    });
  }

  // --- Facturar ---

  protected abrirModalFacturar(): void {
    this.errorFacturar.set(null);
    this.condicionVentaSeleccionada.set(CondicionVenta.CONTADO);
    this.modalFacturarAbierto.set(true);
  }

  protected cerrarModalFacturar(): void {
    this.modalFacturarAbierto.set(false);
  }

  protected confirmarFacturar(): void {
    const actual = this.venta();
    if (!actual) return;
    this.facturando.set(true);
    this.errorFacturar.set(null);
    this.ventasService.facturar(actual.id, this.condicionVentaSeleccionada()).subscribe({
      next: (comprobante) => {
        this.facturando.set(false);
        this.modalFacturarAbierto.set(false);
        this.comprobanteRecienEmitido.set(comprobante);
        this.refrescarFicha();
      },
      error: (err) => {
        this.errorFacturar.set(extraerMensajeError(err));
        this.facturando.set(false);
      },
    });
  }

  protected verPdfFactura(comprobanteId: string | null | undefined): void {
    if (!comprobanteId) return;
    this.descargandoPdf.set(true);
    this.error.set(null);
    this.facturacionService.pdf(comprobanteId).subscribe({
      next: (blob) => {
        abrirPdfEnNuevaPestana(blob);
        this.descargandoPdf.set(false);
      },
      error: async (err) => {
        this.error.set(await extraerMensajeErrorAsync(err));
        this.descargandoPdf.set(false);
      },
    });
  }
}
