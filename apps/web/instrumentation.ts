// Startup hook of the Next.js server (SPEC-009, ET-1): the environment is validated once, before
// any route serves a request. An incomplete production environment stops the boot (CA-2).
export async function register(): Promise<void> {
  // Edge runtime has no access to the server secrets; only the Node.js runtime validates them.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getServerEnv } = await import('./lib/server-env');
  let databaseUrl: string | undefined;
  try {
    const env = getServerEnv(process.env);
    databaseUrl = env.DATABASE_URL;
    console.info(`learny web: configuration ${env.APP_ENV} validée`);
  } catch (error) {
    // Fail fast: Next.js would otherwise keep a server that answers 500 to every request. The
    // message names the variables to fix and never carries a value (EF-1, CA-2).
    const message = error instanceof Error ? error.message : 'Configuration invalide.';
    console.error(`learny web: démarrage refusé. ${message}`);
    process.exit(1);
  }
  // SPEC-101 — /api/v1/health probes the configured database (`select 1`, bounded delay).
  const { registerDatabaseHealth } = await import('./lib/health-database');
  registerDatabaseHealth({ DATABASE_URL: databaseUrl });
  // Telemetry is optional and configured after the environment is known (SPEC-010, ET-4).
  const { registerServerSentry } = await import('./sentry.server.config');
  await registerServerSentry(process.env);
  // SPEC-611 — the inline dispatcher must know the injected quiz-grade job before the first emit.
  const { registerInlineJobs } = await import('./lib/quiz-grade-registry');
  registerInlineJobs();
}
