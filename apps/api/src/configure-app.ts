import { INestApplication, ValidationPipe } from '@nestjs/common';
import { API_PREFIX } from '@ucc/shared';
import { AppConfig } from './config';

/** Shared by main.ts and the tests so both run the same setup. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  // Behind Vercel or another proxy the real visitor address is in X-Forwarded-For; rate limiting needs it.
  app.getHttpAdapter().getInstance().set?.('trust proxy', 1);
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableCors({ origin: config.corsOrigins, credentials: true });
}
