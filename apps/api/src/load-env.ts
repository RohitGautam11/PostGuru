import { existsSync } from 'fs';
import { resolve } from 'path';

// Local/Docker runs read apps/api/.env. On Vercel, variables come from the project settings instead.
// Values already present in the environment always win.
const file = resolve(process.cwd(), '.env');
if (existsSync(file)) process.loadEnvFile(file);
