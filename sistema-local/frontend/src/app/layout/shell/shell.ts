import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BackupAlerta } from '../backup-alerta/backup-alerta';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, BackupAlerta],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {}
