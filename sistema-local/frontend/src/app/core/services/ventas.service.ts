import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Comprobante, CondicionVenta } from '../models/comprobante.model';
import { NuevaLineaVenta, Venta } from '../models/venta.model';

@Injectable({ providedIn: 'root' })
export class VentasService {
  private readonly http = inject(HttpClient);

  /** Abre la ficha del cliente, o devuelve la que ya tenga abierta. */
  abrirFicha(clienteId: string): Observable<Venta> {
    return this.http.post<Venta>('/ventas/abrir', { clienteId });
  }

  obtener(id: string): Observable<Venta> {
    return this.http.get<Venta>(`/ventas/${id}`);
  }

  abiertas(): Observable<Venta[]> {
    return this.http.get<Venta[]>('/ventas/abiertas');
  }

  agregarLinea(ventaId: string, dto: NuevaLineaVenta): Observable<Venta> {
    return this.http.post<Venta>(`/ventas/${ventaId}/lineas`, dto);
  }

  quitarLinea(ventaId: string, lineaId: string): Observable<Venta> {
    return this.http.delete<Venta>(`/ventas/${ventaId}/lineas/${lineaId}`);
  }

  vaciarLineas(ventaId: string): Observable<Venta> {
    return this.http.delete<Venta>(`/ventas/${ventaId}/lineas`);
  }

  presupuestoPdf(ventaId: string): Observable<Blob> {
    return this.http.post(
      `/ventas/${ventaId}/presupuesto`,
      {},
      { responseType: 'blob' },
    );
  }

  facturar(ventaId: string, condicionVenta: CondicionVenta): Observable<Comprobante> {
    return this.http.post<Comprobante>(`/ventas/${ventaId}/facturar`, { condicionVenta });
  }
}
