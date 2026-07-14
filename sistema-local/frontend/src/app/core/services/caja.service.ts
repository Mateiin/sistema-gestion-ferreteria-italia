import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CierreCaja,
  CierreConMovimientos,
  DiaCaja,
  NuevoMovimientoCaja,
} from '../models/caja.model';

@Injectable({ providedIn: 'root' })
export class CajaService {
  private readonly http = inject(HttpClient);

  registrar(dto: NuevoMovimientoCaja): Observable<DiaCaja['movimientos'][number]> {
    return this.http.post<DiaCaja['movimientos'][number]>('/caja/movimientos', dto);
  }

  /** Movimientos abiertos (sin cerrar) de un día (default hoy) + total y desglose por medio de pago */
  dia(fecha?: string): Observable<DiaCaja> {
    const params = fecha ? new HttpParams().set('fecha', fecha) : undefined;
    return this.http.get<DiaCaja>('/caja/dia', { params });
  }

  borrar(id: string): Observable<void> {
    return this.http.delete<void>(`/caja/movimientos/${id}`);
  }

  /** Cierra la caja del día (default hoy). */
  cerrar(fecha?: string): Observable<CierreCaja> {
    return this.http.post<CierreCaja>('/caja/cierres', fecha ? { fecha } : {});
  }

  listarCierres(): Observable<CierreCaja[]> {
    return this.http.get<CierreCaja[]>('/caja/cierres');
  }

  obtenerCierre(id: string): Observable<CierreConMovimientos> {
    return this.http.get<CierreConMovimientos>(`/caja/cierres/${id}`);
  }
}
