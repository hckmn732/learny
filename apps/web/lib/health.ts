export interface Health {
  status: 'ok';
}

// Shared by the /api/v1/health route and the demo page (no HTTP round trip).
export function getHealth(): Health {
  return { status: 'ok' };
}
