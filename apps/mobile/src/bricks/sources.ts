// Reference of a cited passage (SPEC-3301 BR-COU-02, EF-7).
//
// A `resource_excerpt` carries the place of its quote in the source: a page, a time range, an
// anchor or a character range. The label is built here, once, so that the course and the brick
// say the same thing; the wording lives in `fr.mobile.bricks` (BR-ACC-06).
import { fr } from '@learny/i18n';

const t = fr.mobile.bricks;

/** Location of a quote in its resource, as the public projection of `resource_excerpt` sends it. */
export interface ResourceLocation {
  readonly page?: number | undefined;
  readonly startSec?: number | undefined;
  readonly endSec?: number | undefined;
  readonly anchor?: string | undefined;
  readonly charStart?: number | undefined;
  readonly charEnd?: number | undefined;
}

/** `mm:ss` of a time range of an audio or video resource. */
export function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes)}:${String(rest).padStart(2, '0')}`;
}

/**
 * Human label of a location, in the order of precision of the sources: page, then time, then
 * anchor, then character range. An empty location falls back to « extrait ».
 */
export function locationLabel(location: ResourceLocation): string {
  if (location.page !== undefined) return t.sourcePage(location.page);
  if (location.startSec !== undefined) {
    const start = formatSeconds(location.startSec);
    const end = location.endSec === undefined ? '' : `–${formatSeconds(location.endSec)}`;
    return `${t.sourceMinute(location.startSec)} ${start}${end}`;
  }
  if (location.anchor !== undefined && location.anchor !== '') {
    return t.sourceAnchor(location.anchor);
  }
  if (location.charStart !== undefined) {
    const end = location.charEnd === undefined ? '' : `–${String(location.charEnd)}`;
    return `${t.sourceExcerpt} ${String(location.charStart)}${end}`;
  }
  return t.sourceExcerpt;
}
