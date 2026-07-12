import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Único lugar que conoce la URL del backend: los servicios llaman rutas
 * relativas ('/clientes', '/ventas/...') y acá se les antepone
 * `environment.apiBaseUrl`. Cambiar de ambiente es cambiar solo el environment.
 */
export const apiUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/')) {
    return next(req);
  }
  return next(req.clone({ url: `${environment.apiBaseUrl}${req.url}` }));
};
