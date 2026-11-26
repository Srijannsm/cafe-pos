import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { assertProductionEnv, configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // After create(): ConfigModule has loaded .env into process.env by now.
  assertProductionEnv();
  configureApp(app);
  // Close DB connections cleanly when the process manager stops/restarts us.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
