import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  // Serve uploaded files (logos, etc.) as static assets under /uploads/
  app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/' });
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
