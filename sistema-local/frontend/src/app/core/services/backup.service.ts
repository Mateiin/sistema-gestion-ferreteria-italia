import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { EstadoBackup } from '../models/backup.model';

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly http = inject(HttpClient);

  estado(): Observable<EstadoBackup> {
    return this.http.get<EstadoBackup>('/backup/estado');
  }
}
