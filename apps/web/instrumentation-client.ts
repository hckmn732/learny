// Runs in the browser before hydration (Next.js file convention).
import { installSafeConsole } from './lib/client-log';
import { registerClientSentry } from './sentry.client.config';

if (process.env.NODE_ENV === 'production') installSafeConsole(console);
void registerClientSentry();
