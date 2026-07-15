import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Todas las rutas de la API bajo /api: en producción este mismo proceso
  // también sirve el build de Angular en la raíz (ver AppModule /
  // ServeStaticModule), así que la API necesita un prefijo para no
  // colisionar con los archivos estáticos ni con las rutas del router de
  // Angular (deep links).
  app.setGlobalPrefix('api');
  // En desarrollo el frontend corre aparte (`ng serve`, puerto 4200) y
  // necesita CORS para pegarle a este puerto. En producción no hace falta
  // (mismo origen), pero dejarlo prendido ahí no agrega riesgo real: es una
  // herramienta de uso local, sin acceso remoto (ver CLAUDE.md → Despliegue).
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
