// Runs in the browser before hydration (Next.js file convention).
import { installSafeConsole } from './lib/client-log';

if (process.env.NODE_ENV === 'production') installSafeConsole(console);
