// Deterministic public-caption fixtures of the YouTube extractor (SPEC-510 EF-2, ET-5).
//
// The mock provider selects these fixtures by video identifier; no test or demonstration ever
// calls YouTube. `NO_CAPTIONS_VIDEO_ID` is the stable source of the readable `NO_CAPTIONS` case.
import type { YoutubeSegment } from '@learny/contracts';

export interface YoutubeFixture {
  videoId: string;
  title: string;
  language: string;
  durationSec: number;
  segments: YoutubeSegment[];
}

export const NO_CAPTIONS_VIDEO_ID = 'noCaptions1';

export const YOUTUBE_FIXTURES: Readonly<Record<string, YoutubeFixture>> = {
  dQw4w9WgXcQ: {
    videoId: 'dQw4w9WgXcQ',
    title: 'Comptabilité de gestion : le compte de résultat',
    language: 'fr',
    durationSec: 96,
    segments: [
      {
        startSec: 0,
        endSec: 9,
        text: 'Bienvenue dans cette séance consacrée au compte de résultat.',
      },
      {
        startSec: 9,
        endSec: 24,
        text: 'Le compte de résultat présente les charges et les produits d’un exercice.',
      },
      {
        startSec: 24,
        endSec: 41,
        text: 'La marge brute mesure la différence entre le chiffre d’affaires et le coût des marchandises vendues.',
      },
      {
        startSec: 41,
        endSec: 58,
        text: 'Le résultat d’exploitation ajoute les charges externes et les amortissements.',
      },
      {
        startSec: 58,
        endSec: 76,
        text: 'Le résultat net tient compte du résultat financier et de l’impôt sur les sociétés.',
      },
      {
        startSec: 76,
        endSec: 96,
        text: 'Retenez que le compte de résultat se lit toujours sur un exercice comptable.',
      },
    ],
  },
};

/** Mock provider: unknown videos behave like a video without public captions. */
export function youtubeFixture(videoId: string): YoutubeFixture | null {
  return YOUTUBE_FIXTURES[videoId] ?? null;
}
