import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Cliente, ClienteFormValue } from '../models/cliente.model';
import { ClienteConSaldo, CuentaCliente } from '../models/cuenta-corriente.model';

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly http = inject(HttpClient);

  listar(nombre?: string): Observable<Cliente[]> {
    const params = nombre ? new HttpParams().set('nombre', nombre) : undefined;
    return this.http.get<Cliente[]>('/clientes', { params });
  }

  obtener(id: string): Observable<Cliente> {
    return this.http.get<Cliente>(`/clientes/${id}`);
  }

  crear(dto: ClienteFormValue): Observable<Cliente> {
    return this.http.post<Cliente>('/clientes', dto);
  }

  actualizar(id: string, dto: Partial<ClienteFormValue>): Observable<Cliente> {
    return this.http.put<Cliente>(`/clientes/${id}`, dto);
  }

  conSaldo(): Observable<ClienteConSaldo[]> {
    return this.http.get<ClienteConSaldo[]>('/clientes/con-saldo');
  }

  cuenta(id: string): Observable<CuentaCliente> {
    return this.http.get<CuentaCliente>(`/clientes/${id}/cuenta`);
  }

  registrarPago(
    id: string,
    dto: { monto: number; descripcion?: string },
  ): Observable<CuentaCliente> {
    return this.http.post<CuentaCliente>(`/clientes/${id}/pagos`, dto);
  }
}
