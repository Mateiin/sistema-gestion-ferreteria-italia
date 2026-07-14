import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'ventas' },
  {
    path: 'ventas',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/ventas/ventas-ficha/ventas-ficha').then((m) => m.VentasFicha),
      },
      // 'abiertas' antes de ':ventaId': si no, el router la toma como id de ficha.
      {
        path: 'abiertas',
        loadComponent: () =>
          import('./features/ventas/fichas-abiertas/fichas-abiertas').then(
            (m) => m.FichasAbiertas,
          ),
      },
      {
        path: ':ventaId',
        loadComponent: () =>
          import('./features/ventas/ventas-ficha/ventas-ficha').then((m) => m.VentasFicha),
      },
    ],
  },
  {
    path: 'clientes',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/clientes/clientes-lista/clientes-lista').then(
            (m) => m.ClientesLista,
          ),
      },
      {
        path: 'nuevo',
        loadComponent: () =>
          import('./features/clientes/cliente-formulario/cliente-formulario').then(
            (m) => m.ClienteFormulario,
          ),
      },
      {
        path: ':id/editar',
        loadComponent: () =>
          import('./features/clientes/cliente-formulario/cliente-formulario').then(
            (m) => m.ClienteFormulario,
          ),
      },
    ],
  },
  {
    path: 'caja',
    children: [
      {
        path: '',
        loadComponent: () => import('./features/caja/caja/caja').then((m) => m.Caja),
      },
      // 'registros' antes de 'registros/:id': mismo criterio que 'ventas/abiertas'.
      {
        path: 'registros',
        loadComponent: () =>
          import('./features/caja/registros-caja/registros-caja').then((m) => m.RegistrosCaja),
      },
      {
        path: 'registros/:id',
        loadComponent: () =>
          import('./features/caja/cierre-detalle/cierre-detalle').then((m) => m.CierreDetalle),
      },
    ],
  },
  {
    path: 'cuentas-por-cobrar',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/cuentas/cuentas-lista/cuentas-lista').then((m) => m.CuentasLista),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/cuentas/cuenta-detalle/cuenta-detalle').then(
            (m) => m.CuentaDetalle,
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'ventas' },
];
