import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigBackup, EjecucionBackup, EstadoBackup } from '../models/backup.model';

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly http = inject(HttpClient);

  config(): Observable<ConfigBackup> {
    return this.http.get<ConfigBackup>('/backup/config');
  }

  actualizarConfig(dto: Partial<ConfigBackup>): Observable<ConfigBackup> {
    return this.http.put<ConfigBackup>('/backup/config', dto);
  }

  ejecutar(): Observable<EjecucionBackup> {
    return this.http.post<EjecucionBackup>('/backup/ejecutar', {});
  }

  ejecuciones(): Observable<EjecucionBackup[]> {
    return this.http.get<EjecucionBackup[]>('/backup/ejecuciones');
  }

  estado(): Observable<EstadoBackup> {
    return this.http.get<EstadoBackup>('/backup/estado');
  }
}
