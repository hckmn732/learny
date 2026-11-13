import type { TutorSourceDto } from '@learny/contracts';

// SPEC-610 ET-5, CA-3 — the model cites by `chunkId` only. The code keeps the identifiers that were
// actually sent in the context, turns them into readable labels from the resource location and
// drops an invented citation with a `warn`. A tutor answer without an identifier either comes from
// the course or from the model's own knowledge: the last case is always labelled as such.

export interface SourceCandidate {
  chunkId: string;
  resourceId: string;
  title: string;
  kind: string;
  location: Record<string, unknown>;
}

export interface SourceContext {
  candidates: readonly SourceCandidate[];
  chapterPosition: number;
  primaryResourceTitle: string | null;
}

const DURATION_SUFFIX = /,\s*\d{1,2}:\d{2}\s*$/;
const TYPE_SUFFIX = /\s*\((?:PDF|DOCX?|TXT|MD|MARKDOWN|AUDIO|VIDÉO|VIDEO|WEB|HTML)\)\s*$/i;

function baseTitle(title: string): string {
  return title.replace(TYPE_SUFFIX, '').replace(DURATION_SUFFIX, '').trim();
}

function lowerInitial(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function mmss(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60))}:${String(safe % 60).padStart(2, '0')}`;
}

function numberAt(location: Record<string, unknown>, key: string): number | null {
  const value = location[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** ET-5 — stable, human-readable label of one resource passage. */
export function sourceLabel(chunk: Pick<SourceCandidate, 'title' | 'kind' | 'location'>): string {
  const title = baseTitle(chunk.title);
  const page = numberAt(chunk.location, 'page');
  const startSec = numberAt(chunk.location, 'startSec');
  if (chunk.kind === 'pdf' && page !== null) return `${title}, p. ${String(page)}`;
  if (chunk.kind === 'audio' && startSec !== null) {
    return `votre ${lowerInitial(title)}, ${mmss(startSec)}`;
  }
  if ((chunk.kind === 'video' || chunk.kind === 'youtube') && startSec !== null) {
    return `${title}, ${mmss(startSec)}`;
  }
  if (chunk.kind === 'pdf') return title;
  return title;
}

/** ET-5 — tutor knowledge is never presented as a sourced passage. */
export function tutorSource(primaryResourceTitle: string | null): TutorSourceDto {
  const label =
    primaryResourceTitle === null
      ? 'Complété par le tuteur · à confirmer dans vos sources'
      : `Complété par le tuteur · à confirmer dans ${baseTitle(primaryResourceTitle)}`;
  return { label };
}

export interface SourceResolution {
  text: string;
  sources: TutorSourceDto[];
  citedChunkIds: string[];
  invented: string[];
}

const MARKER_START = '[[sources:';
const MARKER_END = ']]';

/** Streaming filter that hides `[[sources:…]]` while keeping the visible answer intact. */
export class SourceMarkerFilter {
  private buffer = '';
  private hidden = false;
  private visible = '';
  private marker = '';
  private cited: string[] = [];

  push(delta: string): string {
    this.buffer += delta;
    let out = '';
    while (this.buffer.length > 0) {
      if (this.hidden) {
        const end = this.buffer.indexOf(MARKER_END);
        if (end < 0) {
          this.marker += this.buffer;
          this.buffer = '';
          break;
        }
        this.marker += this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + MARKER_END.length);
        this.cited.push(...parseMarker(this.marker));
        this.marker = '';
        this.hidden = false;
        continue;
      }
      const start = this.buffer.indexOf(MARKER_START);
      if (start < 0) {
        // Keep a possible partial marker at the end of the buffer.
        const keep = partialPrefix(this.buffer);
        out += this.buffer.slice(0, this.buffer.length - keep.length);
        this.buffer = keep;
        break;
      }
      out += this.buffer.slice(0, start);
      this.buffer = this.buffer.slice(start + MARKER_START.length);
      this.hidden = true;
    }
    this.visible += out;
    return out;
  }

  finish(): { text: string; tokens: string[] } {
    if (this.buffer !== '' && !this.hidden) {
      this.visible += this.buffer;
    }
    if (this.hidden && this.marker !== '') {
      this.cited.push(...parseMarker(`${this.marker}${MARKER_END}`));
    }
    this.buffer = '';
    return { text: this.visible, tokens: this.cited };
  }
}

function partialPrefix(value: string): string {
  for (let length = Math.min(value.length, MARKER_START.length - 1); length > 0; length -= 1) {
    if (MARKER_START.startsWith(value.slice(-length))) return value.slice(-length);
  }
  return '';
}

function parseMarker(marker: string): string[] {
  const body = marker.replace(/^\[\[sources:/, '').replace(/\]\]$/, '');
  return body
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/** Filters guessed identifiers, keeps the sent ones, and labels the answer's provenance. */
export function resolveSources(
  tokens: readonly string[],
  context: SourceContext,
  logger?: { warn: (message: string, fields?: Record<string, unknown>) => void },
): SourceResolution {
  const byChunk = new Map(context.candidates.map((candidate) => [candidate.chunkId, candidate]));
  const sources: TutorSourceDto[] = [];
  const cited: string[] = [];
  const invented: string[] = [];
  for (const token of tokens) {
    if (token === 'course') {
      sources.push({ label: `Votre cours, chapitre ${String(context.chapterPosition)}` });
      continue;
    }
    if (token === 'tutor') {
      sources.push(tutorSource(context.primaryResourceTitle));
      continue;
    }
    const candidate = byChunk.get(token);
    if (candidate === undefined) {
      invented.push(token);
      continue;
    }
    cited.push(token);
    sources.push({ label: sourceLabel(candidate) });
  }
  if (invented.length > 0) {
    logger?.warn('tutor.chat.invented_source', { count: invented.length });
  }
  const unique = sources.filter(
    (source, index) => sources.findIndex((entry) => entry.label === source.label) === index,
  );
  return { text: '', sources: unique, citedChunkIds: cited, invented };
}
