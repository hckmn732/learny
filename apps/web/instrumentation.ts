// Startup hook of the Next.js server (SPEC-009, ET-1): the environment is validated once, before
// any route serves a request. An incomplete production environment stops the boot (CA-2).
export async function register(): Promise<void> {
  // Edge runtime has no access to the server secrets; only the Node.js runtime validates them.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { parsePublicEnv } = await import('@learny/config');
  parsePublicEnv(process.env);
  console.info('learny web: configuration publique validée');
  // Telemetry is optional and configured after the environment is known (SPEC-010, ET-4).
  const { registerServerSentry } = await import('./sentry.server.config');
  await registerServerSentry(process.env);
}
