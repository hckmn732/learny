// Remote extractors: web, YouTube and image (SPEC-510 EF-1 to EF-5, CA-1 to CA-4).
import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { WEB_FIXTURE_HTML, WEB_FIXTURE_URL } from '../../fixtures/web';
import { IngestionError } from '../errors';

import { extractImage, extractImageDocument, type VisionReader } from './image';
import { IMAGE_LIMITS } from './remote';
import { extractWeb, extractWebDocument, type WebFetcher } from './web';
import { extractYoutube, parseYoutubeUrl, youtubeContent } from './youtube';

const htmlFetcher: WebFetcher = () =>
  Promise.resolve({
    url: WEB_FIXTURE_URL,
    contentType: 'text/html; charset=utf-8',
    body: new TextEncoder().encode(WEB_FIXTURE_HTML),
  });

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function visionReader(text = 'Compte 512 — banque, solde débiteur de 1 200 €.'): VisionReader {
  return {
    read: () =>
      Promise.resolve({
        text,
        origin: { task: 'light', provider: 'anthropic', modelId: 'claude-haiku-5-5' },
      }),
  };
}

describe('[SPEC-510] Ingestion : pages web, YouTube et images', () => {
  it('extrait le titre, le texte principal et les ancrages sans navigation (CA-1)', async () => {
    const extraction = await extractWeb(WEB_FIXTURE_URL, { fetcher: htmlFetcher });

    expect(extraction.title).toBe('Comptabilité de gestion — le compte de résultat');
    expect(extraction.sourceUrl).toBe(WEB_FIXTURE_URL);
    expect(extraction.siteName).toBe('Learnothèque');
    expect(extraction.language).toBe('fr');
    expect(extraction.text).toContain('Le compte de résultat présente les charges');
    expect(extraction.text).toContain('La marge brute est la différence');
    expect(extraction.text).not.toContain('navigation');
    expect(extraction.text).not.toContain('Publicité');
    expect(extraction.anchors.map((anchor) => anchor.id)).toEqual(['marge-brute', 'resultat-net']);
  });

  it('conserve des passages exacts et leurs ancrages (CA-1)', async () => {
    const { extraction, content } = await extractWebDocument(WEB_FIXTURE_URL, {
      fetcher: htmlFetcher,
    });

    expect(content.text).toBe(extraction.text);
    expect(content.locations.length).toBeGreaterThanOrEqual(3);
    for (const location of content.locations) {
      expect(content.text.slice(location.charStart, location.charEnd)).not.toBe('');
      if (location.anchor !== undefined) {
        expect(extraction.anchors.map((anchor) => anchor.id)).toContain(location.anchor);
      }
    }
    expect(content.locations.some((location) => location.anchor === 'marge-brute')).toBe(true);
    expect(content.locations.some((location) => location.anchor === 'resultat-net')).toBe(true);
  });

  it('refuse une réponse non HTML et une URL non HTTP(S) (EF-1, EF-5)', async () => {
    await expect(
      extractWeb(WEB_FIXTURE_URL, {
        fetcher: () =>
          Promise.resolve({ url: WEB_FIXTURE_URL, contentType: 'application/pdf', body: PNG }),
      }),
    ).rejects.toMatchObject({ code: 'WEB_UNSUPPORTED_CONTENT' });
    await expect(extractWeb('javascript:alert(1)', { fetcher: htmlFetcher })).rejects.toMatchObject(
      { code: 'URL_INVALID' },
    );
  });

  it('traduit un refus robots.txt en ROBOTS_DISALLOWED (CL-2)', async () => {
    const blocked: WebFetcher = () =>
      Promise.reject(
        new AppError('WEB_ROBOTS_DISALLOWED', 'Le site interdit la lecture de cette page.'),
      );
    await expect(extractWeb(WEB_FIXTURE_URL, { fetcher: blocked })).rejects.toMatchObject({
      code: 'ROBOTS_DISALLOWED',
      permanent: true,
    });
  });

  it('extrait des segments YouTube horodatés et une vidéo sans sous-titres échoue (CA-2)', async () => {
    const extraction = await extractYoutube('https://youtu.be/dQw4w9WgXcQ');
    expect(extraction.videoId).toBe('dQw4w9WgXcQ');
    expect(extraction.segments.length).toBeGreaterThan(3);
    expect(extraction.segments[0]).toMatchObject({ startSec: 0, endSec: 9 });
    expect(extraction.segments.at(-1)?.endSec).toBe(96);

    const content = youtubeContent(extraction);
    expect(content.text).toContain('Le compte de résultat présente les charges');
    for (const location of content.locations) {
      expect(content.text.slice(location.charStart, location.charEnd)).not.toBe('');
      expect(location.startSec).toBeGreaterThanOrEqual(0);
      expect(location.endSec).toBeGreaterThanOrEqual(location.startSec ?? 0);
    }

    await expect(
      extractYoutube('https://www.youtube.com/watch?v=noCaptions1'),
    ).rejects.toMatchObject({ code: 'YOUTUBE_NO_CAPTIONS', permanent: true });
  });

  it('refuse une adresse qui n’est pas une vidéo YouTube (EF-2)', async () => {
    expect(() => parseYoutubeUrl('https://example.test/watch?v=dQw4w9WgXcQ')).toThrow(
      IngestionError,
    );
    await expect(
      extractYoutube('https://www.youtube.com/watch?v=trop-court'),
    ).rejects.toMatchObject({ code: 'YOUTUBE_INVALID_URL' });
  });

  it('lit une image par le modèle light et marque son origine (CA-4)', async () => {
    const extraction = await extractImage(
      { bytes: PNG, mime: 'image/png', title: 'Capture du compte 512' },
      visionReader(),
    );
    expect(extraction.text).toContain('Compte 512');
    expect(extraction.origin).toEqual({
      task: 'light',
      provider: 'anthropic',
      modelId: 'claude-haiku-5-5',
    });

    const { content } = await extractImageDocument(
      { bytes: PNG, mime: 'image/png', title: 'Capture du compte 512' },
      { reader: visionReader(), db: {} as never, userId: '00000000-0000-4000-8000-000000000510' },
    );
    expect(content.contentOrigin).toBe('model');
    expect(content.vision?.modelId).toBe('claude-haiku-5-5');
    expect(content.locations[0]).toMatchObject({ anchor: 'lecture-ia', charStart: 0 });
    expect(content.text.slice(content.locations[0]?.charStart, content.locations[0]?.charEnd)).toBe(
      extraction.text,
    );
  });

  it('refuse une image illisible, vide ou trop lourde (CL-5)', async () => {
    await expect(
      extractImage({ bytes: PNG, mime: 'image/jpeg', title: 'Capture' }, visionReader()),
    ).rejects.toMatchObject({ code: 'IMAGE_UNREADABLE' });
    await expect(
      extractImage(
        { bytes: new Uint8Array(), mime: 'image/png', title: 'Capture' },
        visionReader(),
      ),
    ).rejects.toMatchObject({ code: 'IMAGE_UNREADABLE' });
    await expect(
      extractImage(
        {
          bytes: new Uint8Array(IMAGE_LIMITS.maxBytes + 1),
          mime: 'image/png',
          title: 'Capture',
        },
        visionReader(),
      ),
    ).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
  });

  it('ne fabrique aucune description quand le modèle est indisponible (CL-5)', async () => {
    const unavailable: VisionReader = {
      read: () => Promise.reject(new AppError('AI_UNAVAILABLE', 'Modèle absent.')),
    };
    await expect(
      extractImage({ bytes: PNG, mime: 'image/png', title: 'Capture' }, unavailable),
    ).rejects.toMatchObject({ code: 'IMAGE_VISION_UNAVAILABLE' });
  });
});
