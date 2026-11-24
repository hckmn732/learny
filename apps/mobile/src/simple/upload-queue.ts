// File de téléversement reprenable du mode simple (SPEC-4003 ET-2, CL-2).
//
// The queue lives in the encrypted store under the formation identifier: a confirmed document is
// never uploaded again, an interrupted one is proposed to « Réessayer », and at most two uploads
// run at once. The runner is pure — the network call is injected — so the Vitest suite proves the
// concurrency, the resume and the retry without a device nor a server.
import type { SimpleRole } from './view-model';

/** Local status of one queued document. */
export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

/** One document waiting in the queue. */
export interface UploadTask {
  /** Stable identifier across restarts. */
  readonly id: string;
  /** `file` for a picked document, `link` for a web page or a YouTube video. */
  readonly kind: 'file' | 'link';
  readonly name: string;
  readonly mime: string;
  readonly sizeBytes: number;
  /** Local URI (`file://` or `content://`), absent for a link. */
  readonly uri?: string;
  /** URL of a link deposit. */
  readonly url?: string;
  readonly role: SimpleRole;
  readonly status: UploadStatus;
  /** Bytes sent, 0 when the task is not a file. */
  readonly sentBytes: number;
  /** Identifier returned by the server once the document is reserved. */
  readonly resourceId?: string;
  /** Set when the upload failed; the row shows « Réessayer ». */
  readonly error?: string;
}

/** Maximum number of simultaneous uploads (ET-2). */
export const UPLOAD_CONCURRENCY = 2;

/** Storage key of the queue of one formation. */
export function queueKey(formationId: string): string {
  return `learny.simple.uploads.v1.${formationId}`;
}

/** Vérifie qu'un objet stocké a la forme d'une tâche. */
function isTask(value: unknown): value is UploadTask {
  if (value === null || typeof value !== 'object') return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.id === 'string' &&
    (task.kind === 'file' || task.kind === 'link') &&
    typeof task.name === 'string' &&
    typeof task.mime === 'string' &&
    typeof task.sizeBytes === 'number' &&
    (task.status === 'pending' ||
      task.status === 'uploading' ||
      task.status === 'uploaded' ||
      task.status === 'failed') &&
    typeof task.role === 'string'
  );
}

/** Lit une file stockée ; tout contenu illisible donne une file vide. */
export function parseQueue(raw: string | null): UploadTask[] {
  if (raw === null || raw.trim() === '') return [];
  try {
    const value = JSON.parse(raw) as { version?: unknown; items?: unknown };
    if (value.version !== 1 || !Array.isArray(value.items)) return [];
    return value.items.filter(isTask).map((task) => ({
      ...task,
      // Un envoi interrompu redevient « en attente » : la reprise ne perd pas le document.
      status: task.status === 'uploading' ? 'pending' : task.status,
    }));
  } catch {
    return [];
  }
}

/** Sérialise la file. */
export function serializeQueue(items: readonly UploadTask[]): string {
  return JSON.stringify({ version: 1, items });
}

/** Tâches encore à envoyer, dans l'ordre de la file. */
export function pendingTasks(items: readonly UploadTask[]): UploadTask[] {
  return items.filter((task) => task.status === 'pending' || task.status === 'failed');
}

/** Vrai quand toutes les tâches sont confirmées. */
export function allUploaded(items: readonly UploadTask[]): boolean {
  return items.length > 0 && items.every((task) => task.status === 'uploaded');
}

/** Nombre de tâches en cours. */
export function activeCount(items: readonly UploadTask[]): number {
  return items.filter((task) => task.status === 'uploading').length;
}

/** Prochaine tâche à lancer, en respectant la limite de parallélisme. */
export function nextTask(
  items: readonly UploadTask[],
  concurrency = UPLOAD_CONCURRENCY,
): UploadTask | null {
  if (activeCount(items) >= concurrency) return null;
  return items.find((task) => task.status === 'pending') ?? null;
}

/** Transport d'une tâche : renvoie l'identifiant de la ressource confirmée. */
export type UploadTransport = (
  task: UploadTask,
  onProgress: (sentBytes: number) => void,
) => Promise<{ resourceId: string }>;

export interface RunnerOptions {
  readonly transport: UploadTransport;
  readonly concurrency?: number;
  /** Appelé à chaque changement de la file (l'écran remplace son état). */
  readonly onChange: (items: readonly UploadTask[]) => void;
  /** Appelé une fois quand toutes les tâches sont confirmées. */
  readonly onDone?: (items: readonly UploadTask[]) => void;
  /** Appelé quand une tâche échoue (la file continue les autres). */
  readonly onError?: (task: UploadTask, error: unknown) => void;
}

/**
 * Exécute la file jusqu'à ce qu'il n'y ait plus de tâche en attente. Une tâche en échec reste
 * `failed` et ne bloque pas les suivantes ; `retryFailed` la repasse en attente.
 */
export class UploadRunner {
  private items: UploadTask[];
  private running = false;
  private readonly concurrency: number;

  constructor(
    initial: readonly UploadTask[],
    private readonly options: RunnerOptions,
  ) {
    this.items = initial.map((task) => ({ ...task }));
    this.concurrency = options.concurrency ?? UPLOAD_CONCURRENCY;
  }

  /** File courante (copie immuable). */
  snapshot(): readonly UploadTask[] {
    return this.items;
  }

  /** Ajoute des tâches, sans doublon d'identifiant. */
  add(tasks: readonly UploadTask[]): void {
    const known = new Set(this.items.map((task) => task.id));
    this.items = [
      ...this.items,
      ...tasks.filter((task) => !known.has(task.id)).map((task) => ({ ...task })),
    ];
    this.emit();
  }

  /** Repasse une tâche en échec en attente, ou toutes. */
  retry(id?: string): void {
    this.items = this.items.map((task) => {
      const target =
        id === undefined ? task.status === 'failed' : task.id === id && task.status === 'failed';
      if (!target) return task;
      const next = { ...task, status: 'pending' as const };
      delete next.error;
      return next;
    });
    this.emit();
  }

  /** Lance la file ; sans effet si elle tourne déjà. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const task = nextTask(this.items, this.concurrency);
        if (task === null) {
          if (activeCount(this.items) === 0) break;
          await new Promise((resolve) => setTimeout(resolve, 20));
          continue;
        }
        this.patch(task.id, { status: 'uploading', sentBytes: 0 });
        void this.runOne(task.id);
      }
      // Toutes les tâches lancées doivent être terminées avant le bilan.
      while (activeCount(this.items) > 0) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      if (allUploaded(this.items)) this.options.onDone?.(this.items);
    } finally {
      this.running = false;
    }
  }

  private async runOne(id: string): Promise<void> {
    const task = this.items.find((entry) => entry.id === id);
    if (task === undefined) return;
    try {
      const result = await this.options.transport(task, (sentBytes) => {
        this.patch(id, { sentBytes });
      });
      this.patch(id, {
        status: 'uploaded',
        sentBytes: task.sizeBytes,
        resourceId: result.resourceId,
      });
    } catch (error) {
      this.patch(id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      this.options.onError?.(task, error);
    }
  }

  private patch(id: string, patch: Partial<UploadTask>): void {
    this.items = this.items.map((task) => (task.id === id ? { ...task, ...patch } : task));
    this.emit();
  }

  private emit(): void {
    this.options.onChange(this.items.map((task) => ({ ...task })));
  }
}

/** Pourcentage d'envoi d'une tâche (0 à 100). */
export function uploadPercent(task: UploadTask): number {
  if (task.status === 'uploaded') return 100;
  if (task.sizeBytes <= 0) return task.status === 'uploading' ? 50 : 0;
  return Math.min(99, Math.round((task.sentBytes / task.sizeBytes) * 100));
}
