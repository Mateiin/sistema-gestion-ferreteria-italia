import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DiaCaja, NuevoMovimientoCaja } from '../models/caja.model';

@Injectable({ providedIn: 'root' })
export class CajaService {
  private readonly http = inject(HttpClient);

  registrar(dto: NuevoMovimientoCaja): Observable<DiaCaja['movimientos'][number]> {
    return this.http.post<DiaCaja['movimientos'][number]>('/caja/movimientos', dto);
  }

  /** Movimientos de un día (default hoy) + total y desglose por medio de pago */
  dia(fecha?: string): Observable<DiaCaja> {
    const params = fecha ? new HttpParams().set('fecha', fecha) : undefined;
    return this.http.get<DiaCaja>('/caja/dia', { params });
  }

  borrar(id: string): Observable<void> {
    return this.http.delete<void>(`/caja/movimientos/${id}`);
  }
}
