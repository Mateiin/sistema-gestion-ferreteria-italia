import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FacturacionService {
  private readonly http = inject(HttpClient);

  pdf(comprobanteId: string): Observable<Blob> {
    return this.http.get(`/facturacion/facturas/${comprobanteId}/pdf`, {
      responseType: 'blob',
    });
  }
}
