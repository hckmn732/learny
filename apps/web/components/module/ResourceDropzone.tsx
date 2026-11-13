'use client';

import { useRef, useState } from 'react';

import { cn } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.module;

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

function fileMime(file: File): 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic' | null {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'application/pdf';
  if (file.type === 'image/png' || name.endsWith('.png')) return 'image/png';
  if (file.type === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (file.type === 'image/webp' || name.endsWith('.webp')) return 'image/webp';
  if (file.type === 'image/heic' || file.type === 'image/heif' || name.endsWith('.heic')) {
    return 'image/heic';
  }
  return null;
}

function fileKind(mime: string): 'pdf' | 'image' {
  return mime === 'application/pdf' ? 'pdf' : 'image';
}

export interface ResourceDropzoneProps {
  onNote: (text: string, examGuide: boolean) => Promise<void>;
  onUrl: (kind: 'web' | 'youtube', url: string, title: string) => Promise<void>;
  onFile: (file: File, kind: 'pdf' | 'image', mime: string, examGuide: boolean) => Promise<void>;
  pending?: boolean;
}

/**
 * BR-APP-01, BR-APP-02 — V1 deposit area of SCR-06. The five concrete creation forms (PDF, image,
 * web page, YouTube, note) plus the « Guide d’examen » marking of ADR-0008. Audio and video files
 * are deliberately absent: they only arrive in V2. Every control is keyboard reachable and the
 * drop zone has a real focus target.
 */
export function ResourceDropzone({ onNote, onUrl, onFile, pending = false }: ResourceDropzoneProps) {
  const pdfInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'none' | 'web' | 'youtube' | 'note'>('none');
  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [examGuide, setExamGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitFile = async (file: File | undefined): Promise<void> => {
    setError(null);
    if (file === undefined) return;
    const mime = fileMime(file);
    if (mime === null) {
      setError(t.errors.unsupportedFile);
      return;
    }
    try {
      await onFile(file, fileKind(mime), mime, examGuide);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.generic);
    }
  };

  const submitNote = async (): Promise<void> => {
    setError(null);
    if (note.trim() === '') {
      setError(t.errors.emptyNote);
      return;
    }
    try {
      await onNote(note, examGuide);
      setNote('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.generic);
    }
  };

  const submitUrl = async (): Promise<void> => {
    setError(null);
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') throw new Error(t.errors.httpsOnly);
      if (mode === 'youtube' && !YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) {
        throw new Error(t.errors.youtube);
      }
      await onUrl(mode === 'youtube' ? 'youtube' : 'web', parsed.href, title.trim());
      setUrl('');
      setTitle('');
      setMode('none');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.errors.invalidUrl);
    }
  };

  const buttonStyle =
    'flex min-h-96 cursor-pointer flex-col items-center justify-center gap-8 rounded-18 border border-border bg-surface px-10 py-14 font-sans text-ink';
  const iconStyle =
    'inline-flex h-40 w-40 items-center justify-center rounded-12 text-18';

  return (
    <section
      aria-label={t.depositLabel}
      className="flex flex-col gap-18"
      data-testid="resource-dropzone"
    >
      <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-5">
        <button
          className={buttonStyle}
          disabled={pending}
          onClick={() => {
            pdfInput.current?.click();
          }}
          type="button"
        >
          <span aria-hidden="true" className={cn(iconStyle, 'bg-orange-soft text-orange-ink-strong')}>
            PDF
          </span>
          <span className="text-14 font-700">{t.types.pdf}</span>
        </button>
        <button
          className={buttonStyle}
          disabled={pending}
          onClick={() => {
            imageInput.current?.click();
          }}
          type="button"
        >
          <span aria-hidden="true" className={cn(iconStyle, 'bg-surface-muted text-ink-secondary')}>
            IMG
          </span>
          <span className="text-14 font-700">{t.types.image}</span>
        </button>
        <button
          className={cn(buttonStyle, mode === 'web' && 'border-ink')}
          disabled={pending}
          onClick={() => {
            setMode(mode === 'web' ? 'none' : 'web');
            setError(null);
          }}
          type="button"
        >
          <span aria-hidden="true" className={cn(iconStyle, 'bg-green-soft text-green-ink')}>
            URL
          </span>
          <span className="text-14 font-700">{t.types.web}</span>
        </button>
        <button
          className={cn(buttonStyle, mode === 'youtube' && 'border-ink')}
          disabled={pending}
          onClick={() => {
            setMode(mode === 'youtube' ? 'none' : 'youtube');
            setError(null);
          }}
          type="button"
        >
          <span aria-hidden="true" className={cn(iconStyle, 'bg-indigo-soft text-indigo-ink-strong')}>
            YT
          </span>
          <span className="text-14 font-700">{t.types.youtube}</span>
        </button>
        <button
          className={cn(buttonStyle, mode === 'note' && 'border-ink')}
          disabled={pending}
          onClick={() => {
            setMode(mode === 'note' ? 'none' : 'note');
            setError(null);
          }}
          type="button"
        >
          <span aria-hidden="true" className={cn(iconStyle, 'bg-lime-softer text-lime-ink-strong')}>
            ✎
          </span>
          <span className="text-14 font-700">{t.types.note}</span>
        </button>
      </div>

      <input
        accept="application/pdf,.pdf"
        aria-label={t.types.pdf}
        className="sr-only"
        onChange={(event) => {
          void submitFile(event.target.files?.[0]);
          event.target.value = '';
        }}
        ref={pdfInput}
        type="file"
      />
      <input
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic"
        aria-label={t.types.image}
        className="sr-only"
        onChange={(event) => {
          void submitFile(event.target.files?.[0]);
          event.target.value = '';
        }}
        ref={imageInput}
        type="file"
      />

      <div
        className="flex flex-wrap items-center justify-center gap-14 rounded-22 border-2 border-dashed border-border-dashed bg-surface-subtle px-20 py-26 text-center focus-within:border-ink"
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          void submitFile(event.dataTransfer.files[0]);
        }}
      >
        <span
          aria-hidden="true"
          className="inline-flex h-44 w-44 items-center justify-center rounded-14 bg-ink text-lime"
        >
          <svg
            fill="none"
            height="20"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="20"
          >
            <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
          </svg>
        </span>
        <span className="flex flex-col gap-2 text-left">
          <span className="text-15 font-700">{t.dropTitle}</span>
          <span className="text-13 text-ink-muted">{t.dropHint}</span>
        </span>
      </div>

      <label className="inline-flex cursor-pointer items-center gap-8 text-13 font-600 text-ink-secondary">
        <input
          checked={examGuide}
          className="h-16 w-16 accent-ink"
          onChange={(event) => {
            setExamGuide(event.target.checked);
          }}
          type="checkbox"
        />
        {t.examGuide}
      </label>

      {mode === 'web' || mode === 'youtube' ? (
        <form
          className="flex flex-col gap-8 rounded-18 bg-surface-subtle p-14"
          onSubmit={(event) => {
            event.preventDefault();
            void submitUrl();
          }}
        >
          <label className="text-13 font-700" htmlFor="resource-url">
            {mode === 'youtube' ? t.youtubeLabel : t.urlLabel}
          </label>
          <input
            className="min-h-44 rounded-12 border border-border-strong bg-surface px-12 text-15 text-ink"
            id="resource-url"
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            placeholder={mode === 'youtube' ? 'https://www.youtube.com/watch?v=…' : 'https://…'}
            required
            type="url"
            value={url}
          />
          <label className="text-13 font-700" htmlFor="resource-url-title">
            {t.urlTitleLabel}
          </label>
          <input
            className="min-h-44 rounded-12 border border-border-strong bg-surface px-12 text-15 text-ink"
            id="resource-url-title"
            maxLength={200}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            value={title}
          />
          <button
            className="inline-flex min-h-44 w-fit cursor-pointer items-center rounded-12 bg-ink px-16 text-14 font-700 text-white"
            disabled={pending}
            type="submit"
          >
            {pending ? t.busy : t.urlAction}
          </button>
        </form>
      ) : null}

      <div className="flex flex-col gap-8">
        <label className="text-13 font-700" htmlFor="resource-note">
          {t.noteLabel}
        </label>
        <textarea
          className="min-h-96 resize-y rounded-16 border border-border-strong bg-surface px-16 py-14 text-15 leading-1.5 text-ink"
          id="resource-note"
          onChange={(event) => {
            setNote(event.target.value);
          }}
          onFocus={() => {
            setMode('note');
          }}
          placeholder={t.notePlaceholder}
          rows={3}
          value={note}
        />
        <button
          className="inline-flex min-h-44 w-fit cursor-pointer items-center rounded-12 bg-ink px-16 text-14 font-700 text-white"
          disabled={pending}
          onClick={() => {
            void submitNote();
          }}
          type="button"
        >
          {pending ? t.busy : t.noteAction}
        </button>
      </div>

      {error === null ? null : (
        <p className="m-0 text-13 text-orange-ink-strong" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
