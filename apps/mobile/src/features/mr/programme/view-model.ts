// Affichage des apports et des membres (zone A du rattrapage mobile).
//
// Pure functions: the screen formats what the API returned — the kind, the size, the processing
// status, the link kind and the public facts of a member — and never invents a value (ADR-3002).
import type { GroupDto, GroupMemberView, ResourceKind, ResourceListItem } from '@learny/contracts';
import { fr } from '@learny/i18n';

import type { ChipTone } from '../../../ui/Chip';

const t = fr.mr.programme;
const m = fr.module;

/** Statuses for which the API is still working on the apport (ADR-0065 polling). */
const PENDING_STATUSES: readonly ResourceListItem['status'][] = ['queued', 'processing'];

/** True while the processing of an apport is not settled. */
export function isPendingResource(resource: ResourceListItem): boolean {
  return PENDING_STATUSES.includes(resource.status);
}

/** Short badge of the tile of an apport (PDF, IMG, URL). */
export function kindBadge(kind: ResourceKind): string {
  if (kind === 'pdf' || kind === 'exam_guide') return 'PDF';
  if (kind === 'image' || kind === 'audio' || kind === 'video') return 'IMG';
  if (kind === 'web' || kind === 'youtube') return 'URL';
  return 'NOTE';
}

/** Readable kind of an apport, from the web vocabulary. */
export function kindLabel(kind: ResourceKind): string {
  const labels: Record<ResourceKind, string> = {
    ...m.types,
    audio: 'Audio',
    video: 'Vidéo',
  };
  return labels[kind];
}

/** Size in the words of the interface, or `null` when the API does not know it yet. */
export function formatBytes(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024 * 1024) return `${String(Math.max(1, Math.round(bytes / 1024)))} ko`;
  return `${String(Math.round(bytes / (1024 * 1024)))} Mo`;
}

/** Second line of an apport: kind, pages and size, separated by middle dots. */
export function resourceMeta(resource: ResourceListItem): string {
  const parts: string[] = [kindLabel(resource.kind)];
  if (resource.pages !== null) parts.push(`${String(resource.pages)} pages`);
  const size = formatBytes(resource.sizeBytes);
  if (size !== null) parts.push(size);
  return parts.join(' · ');
}

/** Status of the processing, in words (BR-APP-07). */
export function statusLabel(status: ResourceListItem['status']): string {
  return t.apports.status[status];
}

/** Tone of the status chip: neutral queued, indigo processing, green ready, orange failed. */
export function statusTone(status: ResourceListItem['status']): ChipTone {
  if (status === 'ready') return 'green';
  if (status === 'processing') return 'indigo';
  if (status === 'failed') return 'orange';
  return 'neutral';
}

const YOUTUBE_HOSTS: readonly string[] = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];

/** Kind of the link the learner pasted: a YouTube video or a plain web page. */
export function linkKindOf(url: string): 'youtube' | 'web' {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return YOUTUBE_HOSTS.includes(host) ? 'youtube' : 'web';
  } catch {
    return 'web';
  }
}

/** True when the value is an absolute HTTPS URL the API accepts (the contract requires HTTPS). */
export function isHttpsUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https:\/\//i.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    return url.hostname !== '';
  } catch {
    return false;
  }
}

/** Title of an apport created from a file name: its base name, trimmed to the contract bound. */
export function apportTitleFromName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim();
  return (base === '' ? name : base).slice(0, 200);
}

/** Hours of effective work, from the minutes the API counted. */
export function hoursLabel(minutes: number): string {
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.round(minutes / 60);
  return `${String(hours)} h`;
}

/** Initials shown in an avatar, at most two letters. */
export function initialsOf(name: string): string {
  const letters = name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return (letters === '' ? '?' : letters.slice(0, 2));
}

/** First name of a member, or the neutral fallback the API allows (BR-GRP-03). */
export function memberName(member: GroupMemberView): string {
  const name = member.firstName?.trim() ?? '';
  return name === '' ? t.groupe.memberFallback : name;
}

/** The four public facts of a member, in one line. */
export function memberMeta(member: GroupMemberView): string {
  return t.groupe.memberMeta(member.currentModulePosition, member.streakDays);
}

/** Seats still free in the group (BR-GRP-01). */
export function placesLeft(group: GroupDto): number {
  return Math.max(0, group.maxMembers - group.memberCount);
}