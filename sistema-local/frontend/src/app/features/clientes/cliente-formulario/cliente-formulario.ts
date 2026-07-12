import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CONDICION_IVA_LEGIBLE,
  CondicionIvaCliente,
  DOC_TIPO_OPCIONES,
} from '../../../core/models/cliente.model';
import { ClientesService } from '../../../core/services/clientes.service';
import { extraerMensajeError } from '../../../shared/utils/errores';

@Component({
  selector: 'app-cliente-formulario',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './cliente-formulario.html',
})
export class ClienteFormulario {
  private readonly fb = inject(FormBuilder);
  private readonly clientesService = inject(ClientesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly docTipoOpciones = DOC_TIPO_OPCIONES;
  protected readonly condicionIvaOpciones = Object.values(CondicionIvaCliente);
  protected readonly condicionIvaLegible = CONDICION_IVA_LEGIBLE;

  protected readonly clienteId = signal<string | null>(null);
  protected readonly cargando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    razonSocial: ['', Validators.required],
    docTipo: [96, Validators.required],
    docNro: [0, [Validators.required, Validators.min(0)]],
    condicionIva: [CondicionIvaCliente.CONSUMIDOR_FINAL, Validators.required],
    domicilio: [''],
    email: ['', Validators.email],
    telefono: [''],
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.clienteId.set(id);
      this.cargando.set(true);
      this.clientesService.obtener(id).subscribe({
        next: (cliente) => {
          this.form.patchValue({
            razonSocial: cliente.razonSocial,
            docTipo: cliente.docTipo,
            docNro: Number(cliente.docNro),
            condicionIva: cliente.condicionIva,
            domicilio: cliente.domicilio ?? '',
            email: cliente.email ?? '',
            telefono: cliente.telefono ?? '',
          });
          this.cargando.set(false);
        },
        error: (err) => {
          this.error.set(extraerMensajeError(err));
          this.cargando.set(false);
        },
      });
    }
  }

  protected guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);

    const valor = this.form.getRawValue();
    const dto = {
      ...valor,
      domicilio: valor.domicilio || undefined,
      email: valor.email || undefined,
      telefono: valor.telefono || undefined,
    };

    const id = this.clienteId();
    const operacion = id
      ? this.clientesService.actualizar(id, dto)
      : this.clientesService.crear(dto);

    operacion.subscribe({
      next: () => this.router.navigate(['/clientes']),
      error: (err) => {
        this.error.set(extraerMensajeError(err));
        this.guardando.set(false);
      },
    });
  }
}
