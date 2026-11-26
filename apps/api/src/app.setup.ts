import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

// Everything main.ts does to the app besides listen(), in one place, so the
// end-to-end tests boot the API exactly the way production does.
export function configureApp(app: NestExpressApplication) {
  // transform: true turns query strings like ?take=30 into real numbers per
  // the DTO's @Type() -- without it, controllers received "30" (a string)
  // and `take + 1` became "301".
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS_ORIGIN can list several origins: "https://pos.example.com,https://www.example.com"
  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins.length === 1 ? origins[0] : origins, credentials: true });

  // Basic hardening without an extra dependency (helmet would also work).
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Uploaded images (logos, menu photos). Long cache: file names are unique.
  app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/', maxAge: '30d', index: false, dotfiles: 'deny' });
  return app;
}

/** Refuse to start in production with missing or weak secrets. */
export function assertProductionEnv(env = process.env) {
  const problems: string[] = [];
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'PLATFORM_JWT_SECRET']) if (!env[key]) problems.push(`${key} is not set`);
  if (env.NODE_ENV === 'production') {
    for (const key of ['JWT_SECRET', 'PLATFORM_JWT_SECRET']) {
      if (env[key] && env[key]!.length < 32) problems.push(`${key} must be at least 32 characters in production`);
    }
    if (env.JWT_SECRET && env.JWT_SECRET === env.PLATFORM_JWT_SECRET) problems.push('JWT_SECRET and PLATFORM_JWT_SECRET must be different');
    if (!env.CORS_ORIGIN) problems.push('CORS_ORIGIN must be set to the web app URL in production');
  }
  if (problems.length) throw new Error(`Refusing to start:\n - ${problems.join('\n - ')}`);
}
