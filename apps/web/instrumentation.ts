// Startup hook of the Next.js server (SPEC-009, ET-1): the environment is validated once, before
// any route serves a request. An incomplete production environment stops the boot (CA-2).
export async function register(): Promise<void> {
  // Edge runtime has no access to the server secrets; only the Node.js runtime validates them.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getServerEnv } = await import('./lib/server-env');
  try {
    const env = getServerEnv(process.env);
    console.info(`learny web: configuration ${env.APP_ENV} validée`);
  } catch (error) {
    // Fail fast: Next.js would otherwise keep a server that answers 500 to every request. The
    // message names the variables to fix and never carries a value (EF-1, CA-2).
    const message = error instanceof Error ? error.message : 'Configuration invalide.';
    console.error(`learny web: démarrage refusé. ${message}`);
    process.exit(1);
  }
}
