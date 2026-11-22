// Client HTTP de l'agent appareil dual-VM (ADR-3012, précisé par ADR-3015 § 1).
//
// L'edge Agent37 coupe les requêtes longues (28 à 120 s) : une campagne Maestro ne peut donc pas
// être une seule requête HTTP. L'agent expose un travail asynchrone —
//   POST /maestro           → { jobId }            (rendu immédiatement)
//   GET  /maestro/<jobId>   → statut, puis junit et artefacts quand le travail est terminé
// — et ce module mène l'attente. **Aucune requête ne dépasse `requestTimeoutMs` (5 s par défaut)** ;
// seul le délai global du travail est long (`jobTimeoutMs`, 30 min par défaut). Un travail qui ne
// rend pas de statut dans ce délai est annulé et l'erreur nomme le `jobId` : plus de
// `container_unreachable` opaque.

/** Statuts terminaux d'un travail. `done` = Maestro a rendu 0 (ADR-3015 § 1). */
export const TERMINAL_STATUSES = new Set(['done', 'failed', 'error', 'cancelled']);

/** Durée d'une requête HTTP au-delà de laquelle l'edge coupe : on reste bien en dessous. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

/** Attente globale d'une campagne (installation, Maestro, vidéo, captures). */
export const DEFAULT_JOB_TIMEOUT_MS = 1_800_000;

/** Intervalle de scrutation du statut. */
export const DEFAULT_POLL_INTERVAL_MS = 2_000;

/**
 * Nombre d'échecs de scrutation consécutifs tolérés avant d'abandonner le travail.
 * L'edge hoquette et la VM téléphone peut manquer de mémoire pendant Maestro : une scrutation
 * perdue n'est pas une campagne perdue, le délai global reste le seul juge (~25 s de patience).
 */
const MAX_CONSECUTIVE_POLL_FAILURES = 12;

export class AgentError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AgentError';
    Object.assign(this, options);
  }
}

/** Requête dépassée ou connexion refusée : le travail peut continuer côté agent. */
export class AgentTimeoutError extends AgentError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'AgentTimeoutError';
  }
}

/** Réponse inattendue de l'agent (jeton refusé, route inconnue, contrat ancien). */
export class AgentProtocolError extends AgentError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'AgentProtocolError';
  }
}

/**
 * Panne de transport passagère : requête coupée, ou edge qui répond 502/503/504 —
 * l'edge Agent37 rend `{"error":"container_unreachable"}` quand il ne joint pas le conteneur un
 * instant. Une scrutation perdue ne doit pas condamner la campagne : elle est retentée.
 */
export function isTransientAgentError(error) {
  if (error instanceof AgentTimeoutError) return true;
  return error instanceof AgentProtocolError && (error.status === undefined || error.status >= 500);
}

/**
 * Crée un client pour un agent appareil.
 *
 * Toutes les dépendances sont injectables pour les tests : `fetchImpl`, `now`, `delay`.
 */
export function createAgentClient(options = {}) {
  const {
    baseUrl,
    token = null,
    fetchImpl = globalThis.fetch,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    jobTimeoutMs = DEFAULT_JOB_TIMEOUT_MS,
    now = () => Date.now(),
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log = () => {},
  } = options;

  if (typeof baseUrl !== 'string' || baseUrl === '') {
    throw new AgentProtocolError(
      "MOBILE_DEVICE_AGENT_URL absente : impossible de joindre l'agent.",
    );
  }
  const root = baseUrl.replace(/\/+$/, '');

  async function request(
    route,
    { method = 'GET', body = null, timeoutMs = requestTimeoutMs } = {},
  ) {
    let response;
    try {
      response = await fetchImpl(`${root}${route}`, {
        method,
        headers: {
          ...(body === null ? {} : { 'content-type': 'application/json' }),
          ...(token === null ? {} : { 'x-device-token': token }),
        },
        ...(body === null ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new AgentTimeoutError(
        `agent appareil injoignable après ${String(Math.round(timeoutMs / 1000))} s (${method} ${route}) : ${reason}`,
        { route, method },
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new AgentProtocolError(
        `réponse illisible de l'agent (${method} ${route}, HTTP ${String(response.status)}) : ${cause instanceof Error ? cause.message : String(cause)}`,
        { route, method, status: response.status },
      );
    }
    if (!response.ok) {
      const detail =
        typeof payload?.error === 'string' ? payload.error : `HTTP ${String(response.status)}`;
      throw new AgentProtocolError(`${method} ${route} : ${detail}`, {
        route,
        method,
        status: response.status,
      });
    }
    return payload;
  }

  function statusRoute(jobId, { artifacts }) {
    const query = artifacts ? '' : '?artifacts=0';
    return `/maestro/${encodeURIComponent(jobId)}${query}`;
  }

  const client = {
    requestTimeoutMs,
    pollIntervalMs,
    jobTimeoutMs,

    /** `/health` : agent vivant, occupé ou non (préflight). */
    health() {
      return request('/health');
    },

    /** `/device` : appareil connecté (démarre l'AVD au besoin). */
    device() {
      return request('/device', { method: 'POST', body: {} });
    },

    /** `/install` : téléchargement de l'APK par une URL signée, puis installation. */
    install(apkUrl) {
      return request('/install', { method: 'POST', body: { apkUrl } });
    },

    /** `/freeze` : barre d'état figée (13:20, réseau et batterie pleins). */
    freeze() {
      return request('/freeze', { method: 'POST', body: {} });
    },

    /** Soumet une campagne et rend son identifiant, sans attendre Maestro. */
    async submitMaestro(body) {
      const payload = await request('/maestro', { method: 'POST', body });
      if (typeof payload?.jobId !== 'string' || payload.jobId === '') {
        throw new AgentProtocolError(
          "/maestro n'a pas renvoyé de jobId : l'agent appareil est trop ancien (contrat synchrone). " +
            'Redéployez apps/mobile/e2e/device-agent.mjs (ADR-3015 § 1).',
        );
      }
      return payload.jobId;
    },

    /** Statut d'un travail ; `artifacts: false` garde la réponse légère pendant l'attente. */
    job(jobId, { artifacts = true } = {}) {
      return request(statusRoute(jobId, { artifacts }));
    },

    /** Interrompt un travail (le Maestro de l'appareil est tué, le suivant peut démarrer). */
    cancel(jobId) {
      return request(`/maestro/${encodeURIComponent(jobId)}/cancel`, {
        method: 'POST',
        body: {},
      });
    },

    /**
     * Attend la fin d'un travail en scrutant son statut.
     *
     * - chaque scrutation est une requête courte (aucun risque de coupure d'edge) ;
     * - un échec isolé de scrutation est retenté (l'edge peut hoqueter) ;
     * - au-delà de `jobTimeoutMs`, le travail est annulé et `AgentTimeoutError` nomme le `jobId`.
     */
    async waitForJob(jobId, { onPoll = log, artifacts = true } = {}) {
      const deadline = now() + jobTimeoutMs;
      let failures = 0;
      let lastStatus = 'inconnu';
      let lastProgress = null;

      for (;;) {
        let payload = null;
        try {
          payload = await request(statusRoute(jobId, { artifacts: false }));
          failures = 0;
        } catch (error) {
          if (!isTransientAgentError(error)) throw error;
          failures += 1;
          if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) {
            throw new AgentTimeoutError(
              `agent appareil injoignable ${String(failures)} fois de suite pendant la campagne ${jobId} : ${error.message}`,
              { jobId },
            );
          }
          onPoll({ jobId, status: lastStatus, note: 'scrutation en échec, nouvelle tentative' });
        }

        if (payload !== null) {
          lastStatus = String(payload.status ?? 'inconnu');
          lastProgress = payload.progress ?? null;
          onPoll({ jobId, status: lastStatus, progress: lastProgress });
          if (TERMINAL_STATUSES.has(lastStatus)) {
            if (!artifacts || payload.artifacts !== undefined) return { ...payload, jobId };
            const full = await request(statusRoute(jobId, { artifacts: true }));
            return { ...full, jobId };
          }
        }

        if (now() >= deadline) {
          const seconds = Math.round(jobTimeoutMs / 1000);
          try {
            await client.cancel(jobId);
          } catch {
            // L'annulation est un confort : l'erreur de délai reste la cause première.
          }
          throw new AgentTimeoutError(
            `campagne ${jobId} sans statut terminal après ${String(seconds)} s (dernier statut : ${lastStatus}) ; ` +
              'travail annulé pour libérer l’appareil (ADR-3015 § 1).',
            { jobId, status: lastStatus },
          );
        }

        await delay(pollIntervalMs);
      }
    },

    /** Soumet puis attend : rend le travail terminé (statut, `junit`, `artifacts`). */
    async runMaestro(body, { onPoll = log } = {}) {
      const jobId = await client.submitMaestro(body);
      onPoll({ jobId, status: 'soumis', progress: null });
      const done = await client.waitForJob(jobId, { onPoll });
      return { ...done, jobId };
    },
  };

  return client;
}
