// Réception du partage avant ou après la connexion (SPEC-4003 EF-3, CA-2).
//
// A share received while signed out is written to the encrypted store and only then sent to the
// sign-in screen; the deposit screen reads it back after the session opens. The component renders
// nothing: it lives once in the root layout, next to the push bridge.
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { secureSessionStorage } from '../auth/secure-backend';
import { useSession } from '../auth/session';

import { parseSharedUri, type SharedFile } from './share';

/** Clé de la pièce jointe en attente. */
export const PENDING_SHARE_KEY = 'learny.simple.pending-share.v1';

/** Écrit un partage en attente. */
export async function keepSharedFile(file: SharedFile): Promise<void> {
  await secureSessionStorage.setItem(PENDING_SHARE_KEY, JSON.stringify(file));
}

/** Lit le partage en attente, s'il existe. */
export async function readPendingShare(): Promise<SharedFile | null> {
  try {
    const raw = await secureSessionStorage.getItem(PENDING_SHARE_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as Partial<SharedFile>;
    if (
      typeof value.uri !== 'string' ||
      typeof value.name !== 'string' ||
      typeof value.mime !== 'string'
    ) {
      return null;
    }
    return {
      uri: value.uri,
      name: value.name,
      mime: value.mime,
      sizeBytes: typeof value.sizeBytes === 'number' ? value.sizeBytes : 0,
    };
  } catch {
    return null;
  }
}

/** Efface la pièce jointe une fois ajoutée au dépôt. */
export async function clearPendingShare(): Promise<void> {
  await secureSessionStorage.removeItem(PENDING_SHARE_KEY);
}

/** Câblage du partage entrant. */
export function ShareIntake(): null {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    let cancelled = false;
    const receive = (url: string | null): void => {
      const file = parseSharedUri(url);
      if (file === null) return;
      void keepSharedFile(file).then(() => {
        if (cancelled) return;
        if (session.status === 'signedIn') router.replace('/formations/depot');
        else router.replace('/(auth)/connexion');
      });
    };
    void Linking.getInitialURL()
      .then(receive)
      .catch(() => undefined);
    const subscription = Linking.addEventListener('url', (event) => {
      receive(event.url);
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [router, session.status]);

  return null;
}
