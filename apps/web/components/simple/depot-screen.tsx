'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '@learny/api-client';
import type { ResourceRole, SimpleSource, SimpleState } from '@learny/contracts';
import { fr } from '@learny/i18n/fr/simple';
import { Button } from '@learny/ui';
import { colors } from '@learny/ui/tokens';

import { AnalysisPanel } from './analysis-panel';
import { ArrowLeftIcon, LinkIcon, UploadIcon } from './icons';
import { KeyWarning } from './key-warning';
import { SimpleFileList } from './simple-file-list';
import { errorMessage, hasReadyCourseFile, type FileStatus } from './simple-mode';
import { guessRole, putFile, runPool } from './simple-upload';

const t = fr.simple;

/** Nombre de téléversements simultanés (ET-2). */
const UPLOAD_CONCURRENCY = 3;
/** Cadence d'interrogation de l'état de l'analyse (EF-4). */
const ANALYSIS_POLL_MS = 2000;

interface LocalFile {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  role: ResourceRole;
  status: FileStatus;
  progress: number;
  pages: number | null;
  resourceId: string | null;
  message: string | null;
  file: File | null;
}

interface LinkRow {
  resourceId: string;
  title: string;
  role: ResourceRole;
  status: SimpleSource['status'];
}

function roleLabel(role: ResourceRole): string {
  return t.roles[role];
}

function localFromBrowserFile(file: File): LocalFile {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mime: file.type === '' ? 'application/octet-stream' : file.type,
    sizeBytes: file.size,
    role: guessRole(file.name),
    status: 'queued',
    progress: 0,
    pages: null,
    resourceId: null,
    message: null,
    file,
  };
}

export interface DepotScreenProps {
  /** Formation déjà créée (page `/formations/[fid]/depot`), sinon `null`. */
  fid: string | null;
  /** État serveur de la préparation, `null` avant la première création. */
  initialState: SimpleState | null;
}

/**
 * SPEC-4002 EF-2, EF-4 (SCR-21 et SCR-22) — le dépôt des documents et l'analyse.
 *
 * La page sert les deux états de la maquette : tant que la préparation est `collecting`, elle
 * affiche la zone de dépôt, la liste des fichiers avec leur rôle, le lien et la motivation ; dès
 * que l'analyse a démarré, elle bascule sur les quatre étapes, interrogées toutes les deux secondes.
 * Rien n'est conservé côté client : un rechargement en pleine analyse reprend l'état serveur (CL-3).
 */
export function DepotScreen({ fid, initialState }: DepotScreenProps) {
  const router = useRouter();
  const [formationId, setFormationId] = useState<string | null>(fid);
  const [state, setState] = useState<SimpleState | null>(initialState);
  const [files, setFiles] = useState<LocalFile[]>(() =>
    (initialState?.sources ?? [])
      .filter((source) => source.kind !== 'web' && source.kind !== 'youtube')
      .map((source) => ({
        id: source.resourceId,
        name: source.title,
        mime: '',
        sizeBytes: 0,
        role: source.role,
        status: source.status,
        progress: source.status === 'ready' ? 100 : 0,
        pages: source.pages,
        resourceId: source.resourceId,
        message: null,
        file: null,
      })),
  );
  const [links, setLinks] = useState<LinkRow[]>(() =>
    (initialState?.sources ?? [])
      .filter((source) => source.kind === 'web' || source.kind === 'youtube')
      .map((source) => ({
        resourceId: source.resourceId,
        title: source.title,
        role: source.role,
        status: source.status,
      })),
  );
  const [linkValue, setLinkValue] = useState('');
  const [linkPending, setLinkPending] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [motivation, setMotivation] = useState(initialState?.motivation ?? '');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [analysing, setAnalysing] = useState(initialState?.status === 'analysing');
  const [keyBlocked, setKeyBlocked] = useState(false);
  const creatingKey = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingUploads = useRef(false);

  const analysingNow = state?.status === 'analysing' || analysing;
  const returnTo = formationId === null ? '/formations/depot' : `/formations/${formationId}/depot`;

  // EF-3, BR-IA-06 — vérification préalable des modèles : sans clé ni modèle choisi pour le
  // programme et le cours, l'encart s'affiche et « Créer ma formation » reste désactivé.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const models = await api.meAiModelsGet({});
        if (controller.signal.aborted) return;
        setKeyBlocked(
          models.tasks.some(
            (task) => (task.task === 'programme' || task.task === 'course') && !task.available,
          ),
        );
      } catch {
        if (!controller.signal.aborted) setKeyBlocked(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, []);

  const refreshState = useCallback(async (id: string): Promise<void> => {
    const next = await api.simpleGet({ params: { fid: id } });
    setState(next);
    if (next.status !== 'analysing') setAnalysing(false);
  }, []);

  // EF-4 — interrogation toutes les deux secondes pendant l'analyse (CL-3 : aucun état local).
  useEffect(() => {
    if (!analysingNow || formationId === null) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await api.simpleGet({ params: { fid: formationId } });
        if (cancelled) return;
        setState(next);
        if (next.status !== 'analysing') setAnalysing(false);
      } catch {
        // Une erreur réseau transitoire ne coupe pas l'interrogation.
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), ANALYSIS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [analysingNow, formationId]);

  // EF-4 — le programme est prêt : la page d'aperçu prend le relais.
  useEffect(() => {
    if (formationId !== null && state?.status === 'proposed') {
      router.replace(`/formations/${formationId}/apercu`);
    }
  }, [formationId, router, state?.status]);

  const updateFile = useCallback((id: string, patch: Partial<LocalFile>) => {
    setFiles((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }, []);

  const ensureFormation = useCallback(async (): Promise<string | null> => {
    if (formationId !== null) return formationId;
    if (creatingKey.current !== null) return null;
    const key = crypto.randomUUID();
    creatingKey.current = key;
    setCreating(true);
    try {
      const trimmed = motivation.trim();
      const created = await api.simpleCreate(
        { body: trimmed === '' ? {} : { motivation: trimmed } },
        { idempotencyKey: key },
      );
      setFormationId(created.formationId);
      setState(created);
      // URL de l'étape en cours sans rechargement : les fichiers déjà choisis restent affichés.
      window.history.replaceState(null, '', `/formations/${created.formationId}/depot`);
      return created.formationId;
    } catch (error) {
      setNotice(errorMessage(error, t.errors.generic));
      return null;
    } finally {
      creatingKey.current = null;
      setCreating(false);
    }
  }, [formationId, motivation]);

  const upload = useCallback(
    async (id: string, entry: LocalFile, target: string): Promise<void> => {
      const file = entry.file;
      if (file === null) return;
      updateFile(id, { status: 'uploading', progress: 5, message: null });
      try {
        const created = await api.simpleUpload(
          {
            params: { fid: target },
            body: {
              fileName: entry.name,
              mime: entry.mime,
              sizeBytes: entry.sizeBytes,
              role: entry.role,
            },
          },
          { idempotencyKey: crypto.randomUUID() },
        );
        updateFile(id, { role: created.role, resourceId: created.resourceId });
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
        await putFile(created.uploadUrl, file, entry.mime, anonKey, (percent) => {
          updateFile(id, { progress: percent });
        });
        updateFile(id, { status: 'processing', progress: 100 });
        const finalized = await api.resourcesFinalize({ params: { rid: created.resourceId } });
        updateFile(id, {
          status: finalized.status === 'ready' ? 'ready' : 'processing',
          pages: finalized.pages,
          sizeBytes: finalized.sizeBytes,
        });
      } catch (error) {
        updateFile(id, { status: 'failed', message: errorMessage(error, t.errors.generic) });
      }
    },
    [updateFile],
  );

  const addFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const list = Array.from(incoming);
      if (list.length === 0 || pendingUploads.current) return;
      pendingUploads.current = true;
      const rows = list.map(localFromBrowserFile);
      setFiles((current) => [...current, ...rows]);
      setNotice(t.depot.announce.count(rows.length));
      try {
        const target = await ensureFormation();
        if (target === null) return;
        await runPool(rows, UPLOAD_CONCURRENCY, async (row) => {
          await upload(row.id, row, target);
        });
      } finally {
        pendingUploads.current = false;
      }
    },
    [ensureFormation, upload],
  );

  const changeRole = useCallback(
    async (id: string, role: ResourceRole) => {
      const entry = files.find((candidate) => candidate.id === id);
      updateFile(id, { role });
      setNotice(entry === undefined ? '' : t.depot.announce.role(entry.name, roleLabel(role)));
      if (entry?.resourceId != null) {
        try {
          await api.resourceRole({ params: { rid: entry.resourceId }, body: { role } });
        } catch (error) {
          setNotice(errorMessage(error, t.errors.generic));
        }
      }
    },
    [files, updateFile],
  );

  const removeFile = useCallback(
    async (id: string) => {
      const entry = files.find((candidate) => candidate.id === id);
      setFiles((current) => current.filter((candidate) => candidate.id !== id));
      setNotice(entry === undefined ? '' : t.depot.announce.removed(entry.name));
      if (entry?.resourceId != null) {
        try {
          await api.resourcesDelete({ params: { rid: entry.resourceId } });
        } catch {
          // Une ressource déjà supprimée n'a pas d'effet sur la liste locale.
        }
      }
    },
    [files],
  );

  const retryUpload = useCallback(
    async (id: string) => {
      const entry = files.find((candidate) => candidate.id === id);
      if (entry === undefined || formationId === null) return;
      await upload(id, entry, formationId);
    },
    [files, formationId, upload],
  );

  const addLink = useCallback(async () => {
    const url = linkValue.trim();
    if (url === '') return;
    setLinkPending(true);
    setLinkError(null);
    try {
      const target = await ensureFormation();
      if (target === null) return;
      const created = await api.simpleLink(
        { params: { fid: target }, body: { url } },
        { idempotencyKey: crypto.randomUUID() },
      );
      setLinks((current) => [
        ...current,
        {
          resourceId: created.resourceId,
          title: created.title,
          role: created.role,
          status: created.status,
        },
      ]);
      setLinkValue('');
      setNotice(t.depot.link.added(created.title));
    } catch (error) {
      setLinkError(errorMessage(error, t.depot.link.invalid));
    } finally {
      setLinkPending(false);
    }
  }, [ensureFormation, linkValue]);

  const changeLinkRole = useCallback(async (resourceId: string, role: ResourceRole) => {
    setLinks((current) =>
      current.map((entry) => (entry.resourceId === resourceId ? { ...entry, role } : entry)),
    );
    try {
      await api.resourceRole({ params: { rid: resourceId }, body: { role } });
    } catch {
      // Le rôle affiché reste celui choisi ; l'analyse le relira au démarrage.
    }
  }, []);

  const removeLink = useCallback(async (resourceId: string) => {
    setLinks((current) => current.filter((entry) => entry.resourceId !== resourceId));
    try {
      await api.resourcesDelete({ params: { rid: resourceId } });
    } catch {
      // Idem : la liste locale reste la source d'affichage de l'écran.
    }
  }, []);

  const create = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setNotice('');
    try {
      const target = await ensureFormation();
      if (target === null) return;
      await api.simpleAnalysis(
        { params: { fid: target } },
        { idempotencyKey: crypto.randomUUID() },
      );
      setAnalysing(true);
      await refreshState(target);
    } catch (error) {
      const message = errorMessage(error, t.errors.generic);
      if (message.includes(t.errors.AI_NOT_CONFIGURED)) setKeyBlocked(true);
      setNotice(message);
    } finally {
      setStarting(false);
    }
  }, [ensureFormation, refreshState, starting]);

  const retryAnalysis = useCallback(async () => {
    if (formationId === null || retrying) return;
    setRetrying(true);
    try {
      await api.simpleAnalysis(
        { params: { fid: formationId } },
        { idempotencyKey: crypto.randomUUID() },
      );
      setAnalysing(true);
      await refreshState(formationId);
    } catch (error) {
      setNotice(errorMessage(error, t.errors.generic));
    } finally {
      setRetrying(false);
    }
  }, [formationId, refreshState, retrying]);

  const remoteSources = useMemo(() => state?.sources ?? [], [state]);
  const canCreate =
    !keyBlocked &&
    !starting &&
    hasReadyCourseFile(
      files.map((entry) => ({ role: entry.role, status: entry.status })),
      remoteSources,
    );

  if (analysingNow && state !== null) {
    return (
      <main className="mx-auto w-full px-16 pb-40 nav:px-40" data-testid="simple-analysis-page">
        <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-24 py-24">
          <AnalysisPanel onRetry={() => void retryAnalysis()} retrying={retrying} state={state} />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full px-16 pb-40 nav:px-40" data-testid="simple-depot">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-20 py-24">
        <a
          className="flex items-center gap-10 text-13 text-ink-muted"
          data-testid="simple-depot-back"
          href="/accueil"
        >
          <ArrowLeftIcon />
          {t.depot.back}
        </a>
        <header className="flex flex-col gap-4">
          <h1 className="m-0 font-display text-32 font-600 tracking-title">{t.depot.title}</h1>
          <p className="m-0 text-15 text-ink-muted">{t.depot.intro}</p>
        </header>

        <div className="grid items-start gap-20 lg:grid-cols-[1.35fr_1fr]">
          <div className="flex flex-col gap-12">
            <button
              className="flex h-170 cursor-pointer flex-col items-center justify-center gap-8 rounded-18 border-2 border-dashed border-border-strong bg-surface-subtle text-center"
              data-testid="simple-dropzone"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                void addFiles(event.dataTransfer.files);
              }}
              type="button"
            >
              <UploadIcon color={colors['ink-muted']} size={28} />
              <span className="text-16 font-600">{t.depot.dropzone.label}</span>
              <span className="text-13 text-ink-muted">{t.depot.dropzone.browse}</span>
              <span className="sr-only">{t.depot.dropzone.keyboard}</span>
            </button>
            <input
              accept=".pdf,.docx,.txt,.md,.markdown,image/*"
              className="sr-only"
              data-testid="simple-dropzone-input"
              multiple
              onChange={(event) => {
                void addFiles(event.target.files ?? []);
                event.target.value = '';
              }}
              ref={inputRef}
              tabIndex={-1}
              type="file"
            />

            <SimpleFileList
              files={files.map((entry) => ({
                id: entry.id,
                name: entry.name,
                sizeBytes: entry.sizeBytes,
                pages: entry.pages,
                role: entry.role,
                status: entry.status,
                progress: entry.progress,
                message: entry.message,
              }))}
              links={links}
              onChangeLinkRole={(resourceId, role) => {
                void changeLinkRole(resourceId, role);
              }}
              onChangeRole={(id, role) => {
                void changeRole(id, role);
              }}
              onRemove={(id) => {
                void removeFile(id);
              }}
              onRemoveLink={(resourceId) => {
                void removeLink(resourceId);
              }}
              onRetry={(id) => {
                void retryUpload(id);
              }}
            />

            <div className="flex flex-wrap items-center gap-8 rounded-11 border border-solid border-border-strong bg-surface px-12 py-2">
              <span className="text-ink-muted">
                <LinkIcon />
              </span>
              <label className="sr-only" htmlFor="simple-link-input">
                {t.depot.link.label}
              </label>
              <input
                className="min-w-0 flex-1 border-0 bg-transparent py-9 text-14 outline-none placeholder:text-ink-muted"
                data-testid="simple-link"
                id="simple-link-input"
                onChange={(event) => {
                  setLinkValue(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void addLink();
                  }
                }}
                placeholder={t.depot.link.label}
                type="url"
                value={linkValue}
              />
              <Button
                disabled={linkValue.trim() === ''}
                loading={linkPending}
                onClick={() => void addLink()}
                size="md"
                type="button"
                variant="outline"
              >
                {t.depot.link.action}
              </Button>
            </div>
            {linkError === null ? null : (
              <p className="m-0 text-12 font-600 text-orange-ink" role="alert">
                {linkError}
              </p>
            )}
          </div>

          <aside className="flex flex-col gap-14 rounded-18 border border-solid border-border bg-surface p-20">
            {keyBlocked ? <KeyWarning returnTo={returnTo} /> : null}
            <div className="flex flex-col gap-8">
              <label className="text-15 font-600" htmlFor="simple-motivation">
                {t.depot.motivation.label}{' '}
                <span className="font-500 text-ink-muted">· {t.depot.motivation.optional}</span>
              </label>
              <textarea
                className="min-h-[74px] w-full resize-y rounded-11 border border-solid border-border-strong bg-surface px-12 py-11 text-14 placeholder:text-ink-muted"
                data-testid="simple-motivation"
                id="simple-motivation"
                onChange={(event) => {
                  setMotivation(event.target.value);
                }}
                placeholder={t.depot.motivation.placeholder}
                value={motivation}
              />
            </div>
            <p className="m-0 text-13 leading-1.55 text-ink-muted">{t.depot.note}</p>
            <Button
              data-testid="simple-create"
              disabled={!canCreate}
              loading={starting}
              onClick={() => void create()}
              size="lg"
              type="button"
              variant="lime"
            >
              {creating ? t.depot.createPending : t.depot.create}
            </Button>
            <p className="m-0 text-center text-12 text-ink-muted">{t.depot.createHint}</p>
          </aside>
        </div>

        <p aria-live="polite" className="sr-only" data-testid="simple-depot-announce">
          {notice}
        </p>
      </div>
    </main>
  );
}
