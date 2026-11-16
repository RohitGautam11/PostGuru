import type { Request, Response } from 'express';
import { createApp } from './bootstrap';

/**
 * Vercel serverless entry. The Nest app is created once per warm instance and reused across invocations.
 */
let server: Promise<(req: Request, res: Response) => void> | null = null;

async function getServer() {
  const app = await createApp();
  await app.init();
  return app.getHttpAdapter().getInstance();
}

export default async function handler(req: Request, res: Response) {
  if (!server) {
    server = getServer().catch((err) => {
      server = null; // allow the next request to retry boot
      throw err;
    });
  }
  const instance = await server;
  return instance(req, res);
}
