import './load-env';
import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';
import { env } from './config/env';

async function main() {
  const app = await createApp();
  const port = env().PORT;
  await app.listen(port, '0.0.0.0');
  Logger.log(`SocialHub API listening on http://localhost:${port}/api`, 'Bootstrap');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
