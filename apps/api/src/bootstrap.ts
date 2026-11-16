import 'reflect-metadata';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env, isProd } from './config/env';
import { LOCAL_UPLOAD_DIR } from './modules/media/storage.service';

export async function createApp(): Promise<INestApplication> {
  const config = env(); // validates environment early with a readable error
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // required for Stripe / Meta webhook signature verification
    logger: isProd() ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
  });

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({
    origin: [config.WEB_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (config.STORAGE_DRIVER === 'local') {
    app.use('/api/uploads', express.static(LOCAL_UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));
  }

  app.enableShutdownHooks();
  Logger.log(`Environment: ${config.NODE_ENV}, web origin: ${config.WEB_URL}`, 'Bootstrap');
  return app;
}
