// YouTube extractor (SPEC-510 EF-2, ET-2, CA-2, CL-4; ADR-0057).
//
// The URL is parsed into a strict 11-character video identifier. Captions are read through a port:
// the mock provider uses the committed fixtures (`LLM_MODE=mock`), the live provider uses
// `youtubei.js` and is only reachable in live mode. A video without public captions is a permanent
// `NO_CAPTIONS` failure, never an empty list and never an invented transcript.
import type { LlmMode } from '@learny/config';
import { YoutubeExtraction, type YoutubeSegment } from '@learny/contracts';

import { youtubeFixture } from '../../fixtures/youtube';
import { IngestionError } from '../errors';

import { RemoteUrlInput, YOUTUBE_LIMITS, remoteError } from './remote';
import type { ExtractedContent } from './types';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export interface YoutubeCaptions {
  videoId: string;
  title: string;
  language: string;
  durationSec?: number;
  segments: YoutubeSegment[];
}

export interface YoutubeProvider {
  fetch(videoId: string): Promise<YoutubeCaptions>;
}

export interface YoutubeExtractionOptions {
  provider?: YoutubeProvider;
  mode?: LlmMode;
}

function invalid(): IngestionError {
  return new IngestionError(
    'YOUTUBE_INVALID_URL',
    'Cette adresse n’est pas celle d’une vidéo YouTube : utilisez un lien youtube.com ou youtu.be.',
  );
}

/** ET-2 — accepts watch, shorts, embed, live and youtu.be links, nothing else. */
export function parseYoutubeUrl(input: string): { videoId: string; sourceUrl: string } {
  const parsed = RemoteUrlInput.safeParse({ url: input });
  if (!parsed.success) throw invalid();
  let url: URL;
  try {
    url = new URL(parsed.data.url);
  } catch {
    throw invalid();
  }
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) throw invalid();

  let videoId: string | undefined;
  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0];
  } else if (url.pathname === '/watch') {
    videoId = url.searchParams.get('v') ?? undefined;
  } else {
    const match = /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/.exec(url.pathname);
    videoId = match?.[1];
  }
  if (videoId === undefined || !VIDEO_ID.test(videoId)) throw invalid();
  return { videoId, sourceUrl: `https://www.youtube.com/watch?v=${videoId}` };
}

/** EF-2 — deterministic public captions of the fixtures; an unknown video has no captions. */
export function mockYoutubeProvider(): YoutubeProvider {
  return {
    fetch: (videoId) => {
      const fixture = youtubeFixture(videoId);
      if (fixture === null) {
        return Promise.reject(
          new IngestionError(
            'YOUTUBE_NO_CAPTIONS',
            'Cette vidéo ne propose pas de sous-titres publics : aucune transcription ne peut être importée.',
          ),
        );
      }
      return Promise.resolve({
        videoId: fixture.videoId,
        title: fixture.title,
        language: fixture.language,
        durationSec: fixture.durationSec,
        segments: fixture.segments,
      });
    },
  };
}

interface LiveSegment {
  start_ms?: string;
  end_ms?: string;
  snippet?: { toString(): string };
}

function liveSegmentsOf(value: unknown): YoutubeSegment[] {
  if (value === null || typeof value !== 'object') return [];
  const content = (value as { content?: unknown }).content;
  if (content === null || typeof content !== 'object') return [];
  const body = (content as { body?: unknown }).body;
  if (body === null || typeof body !== 'object') return [];
  const raw = (body as { initial_segments?: unknown }).initial_segments;
  if (!Array.isArray(raw)) return [];
  const segments: YoutubeSegment[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const segment = entry as LiveSegment;
    if (segment.start_ms === undefined || segment.end_ms === undefined) continue;
    const text = segment.snippet?.toString().replace(/\s+/g, ' ').trim() ?? '';
    if (text === '') continue;
    const startSec = Number(segment.start_ms) / 1000;
    const endSec = Number(segment.end_ms) / 1000;
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec < startSec) continue;
    segments.push({ startSec, endSec, text });
    if (segments.length >= YOUTUBE_LIMITS.maxSegments) break;
  }
  return segments;
}

/** Live provider; only loaded in `LLM_MODE=live`, never imported by a test or the demo. */
export function liveYoutubeProvider(): YoutubeProvider {
  return {
    async fetch(videoId) {
      try {
        const { Innertube } = await import('youtubei.js');
        const youtube = await Innertube.create({ lang: 'fr', location: 'FR' });
        const info = await youtube.getInfo(videoId);
        const transcript = await info.getTranscript();
        const segments = liveSegmentsOf(transcript.transcript);
        if (segments.length === 0) {
          throw new IngestionError(
            'YOUTUBE_NO_CAPTIONS',
            'Cette vidéo ne propose pas de sous-titres publics : aucune transcription ne peut être importée.',
          );
        }
        const duration = info.basic_info.duration;
        return {
          videoId,
          title: info.basic_info.title?.trim() || `Vidéo YouTube ${videoId}`,
          language: transcript.selectedLanguage || 'fr',
          ...(duration === undefined || !Number.isFinite(duration)
            ? {}
            : { durationSec: Math.max(0, duration) }),
          segments,
        };
      } catch (error) {
        if (error instanceof IngestionError) throw error;
        throw remoteError(error, 'YOUTUBE_UNAVAILABLE');
      }
    },
  };
}

export function defaultYoutubeProvider(mode: LlmMode): YoutubeProvider {
  return mode === 'live' ? liveYoutubeProvider() : mockYoutubeProvider();
}

/**
 * ET-2, CA-2 — returns timed segments. `NO_CAPTIONS` is permanent (CL-4): the retry button of the
 * UI is only useful when the source itself can change.
 */
export async function extractYoutube(
  url: string,
  options: YoutubeExtractionOptions = {},
): Promise<YoutubeExtraction> {
  const { videoId, sourceUrl } = parseYoutubeUrl(url);
  const provider = options.provider ?? defaultYoutubeProvider(options.mode ?? 'mock');
  let captions: YoutubeCaptions;
  try {
    captions = await provider.fetch(videoId);
  } catch (error) {
    throw remoteError(error, 'YOUTUBE_NO_CAPTIONS');
  }

  if (captions.segments.length === 0) {
    throw new IngestionError(
      'YOUTUBE_NO_CAPTIONS',
      'Cette vidéo ne propose pas de sous-titres publics : aucune transcription ne peut être importée.',
    );
  }
  const extraction = {
    videoId,
    title: captions.title.trim().slice(0, 200) || `Vidéo YouTube ${videoId}`,
    language: captions.language.slice(0, 35) || 'fr',
    ...(captions.durationSec === undefined
      ? {}
      : { durationSec: Math.max(0, captions.durationSec) }),
    sourceUrl,
    segments: captions.segments.slice(0, YOUTUBE_LIMITS.maxSegments),
  };
  const parsed = YoutubeExtraction.safeParse(extraction);
  if (!parsed.success) {
    throw new IngestionError(
      'YOUTUBE_UNAVAILABLE',
      'Les sous-titres de cette vidéo ne respectent pas le format attendu.',
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

/** Converts timed segments into exact located content; each passage keeps its minute range. */
export function youtubeContent(extraction: YoutubeExtraction): ExtractedContent {
  let text = '';
  const locations: ExtractedContent['locations'] = [];
  for (const segment of extraction.segments) {
    if (text !== '') text += '\n\n';
    const charStart = text.length;
    text += segment.text;
    locations.push({
      startSec: segment.startSec,
      endSec: segment.endSec,
      charStart,
      charEnd: text.length,
    });
  }
  return {
    text,
    pages: null,
    locations,
    title: extraction.title,
    metadata: {
      youtubeId: extraction.videoId,
      language: extraction.language,
      ...(extraction.durationSec === undefined ? {} : { durationSec: extraction.durationSec }),
    },
    contentOrigin: 'source',
  };
}
