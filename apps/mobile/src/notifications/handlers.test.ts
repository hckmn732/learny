// Vitest [SPEC-3501] — toucher d'une notification : destination interne, garde d'authentification
// et bannière de premier plan (EF-2 ; BR-NOT-02 ; CA-3).
//
// The three states of the application are driven here: a tap while signed in opens at once, a tap
// before the session is confirmed waits for the guard, and a payload that is not one of ours opens
// nothing. The banner store is the one the component renders.
import { describe, expect, it, vi } from 'vitest';

import {
  PushBannerStore,
  PushRouter,
  destinationOf,
  pushContentOf,
  pushDataOf,
} from './handlers';

function contentOfPayload() {
  const parsed = pushContentOf(PAYLOAD);
  if (parsed === null) throw new Error('charge de test invalide');
  return parsed;
}

const PAYLOAD = {
  title: 'Quiz de validation',
  body: 'Il vous reste 40 minutes.',
  url: '/quiz/3f000000-0000-4000-8000-000000003501',
  tag: 'notification-1',
  icon: 'clock',
};

describe('[SPEC-3501] toucher d’une notification', () => {
  it('n’ouvre qu’une destination interne (BR-NOT-02, ET-3)', () => {
    expect(destinationOf('/quiz/abc')).toBe('/quiz/abc');
    expect(destinationOf('/agenda?jour=1')).toBe('/agenda?jour=1');
  });

  it('refuse une destination externe ou malformée (CL-4)', () => {
    expect(destinationOf('https://example.test/quiz')).toBeNull();
    expect(destinationOf('//example.test/quiz')).toBeNull();
    expect(destinationOf('/quiz/abc def')).toBeNull();
    expect(destinationOf('/quiz/a\\b')).toBeNull();
    expect(destinationOf('')).toBeNull();
    expect(destinationOf(null)).toBeNull();
    expect(destinationOf(42)).toBeNull();
  });

  it('lit la charge d’une notification native (EF-2)', () => {
    expect(pushContentOf(PAYLOAD)).toEqual({
      title: PAYLOAD.title,
      body: PAYLOAD.body,
      href: PAYLOAD.url,
      tag: PAYLOAD.tag,
    });
  });

  it('refuse une charge sans texte ou sans destination (CL-4)', () => {
    expect(pushContentOf({ ...PAYLOAD, title: '   ' })).toBeNull();
    expect(pushContentOf({ ...PAYLOAD, body: '' })).toBeNull();
    expect(pushContentOf({ ...PAYLOAD, url: 'https://example.test' })).toBeNull();
    expect(pushContentOf(null)).toBeNull();
  });

  it('complète la charge par le titre et le texte affichés par le système (APNs, FCM)', () => {
    const data = pushDataOf({
      content: { title: 'Quiz de validation', body: '40 minutes', data: { url: '/quiz/abc' } },
    });

    expect(data).toEqual({ url: '/quiz/abc', title: 'Quiz de validation', body: '40 minutes' });
    expect(pushContentOf(data)?.href).toBe('/quiz/abc');
  });

  it('ouvre la destination dès que la session est ouverte (CA-3)', () => {
    const navigate = vi.fn();
    const router = new PushRouter(navigate);
    router.setSession(true);

    expect(router.receive(PAYLOAD)).toBe('opened');
    expect(navigate).toHaveBeenCalledWith(PAYLOAD.url);
  });

  it('retient la destination tant que la garde n’a pas confirmé la session (EF-2)', () => {
    const navigate = vi.fn();
    const router = new PushRouter(navigate);

    expect(router.receive(PAYLOAD)).toBe('deferred');
    expect(navigate).not.toHaveBeenCalled();
    expect(router.pendingHref()).toBe(PAYLOAD.url);

    router.setSession(true);

    expect(navigate).toHaveBeenCalledWith(PAYLOAD.url);
    expect(router.pendingHref()).toBeNull();
  });

  it('n’ouvre rien pour une charge inconnue (CL-4)', () => {
    const navigate = vi.fn();
    const router = new PushRouter(navigate);
    router.setSession(true);

    expect(router.receive({ tag: 'notification-1' })).toBe('ignored');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('affiche puis masque la bannière du premier plan (EF-2)', () => {
    const banner = new PushBannerStore();
    const seen: (string | null)[] = [];
    const unsubscribe = banner.subscribe((content) => seen.push(content === null ? null : content.title));

    banner.show(contentOfPayload());
    expect(banner.get()?.title).toBe('Quiz de validation');

    banner.hide();
    unsubscribe();
    banner.show(contentOfPayload());

    expect(seen).toEqual(['Quiz de validation', null]);
    expect(banner.get()?.href).toBe(PAYLOAD.url);
  });
});
