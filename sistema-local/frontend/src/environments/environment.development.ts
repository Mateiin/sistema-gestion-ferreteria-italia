// Desarrollo: el frontend corre aparte (`ng serve`, puerto 4200) y el
// backend en el suyo (3000, con CORS habilitado — ver main.ts). Todas las
// rutas de la API viven bajo /api (app.setGlobalPrefix('api')).
export const environment = {
  apiBaseUrl: 'http://localhost:3001/api',
};

