// Pont de partage (SPEC-4003 EF-3, ET-3, ADR-4009).
//
// Le pont natif (ACTION_SEND, ACTION_SEND_MULTIPLE, « Ouvrir avec Learny ») remet l'URI du document
// à cette route interne. Elle conserve le fichier puis ouvre le dépôt si la session est ouverte,
// sinon la connexion : le fichier n'est jamais perdu (CA-2).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { useSession } from '../src/auth/session';
import { parseSharedUri } from '../src/simple/share';
import { keepSharedFile } from '../src/simple/share-intake';

/** Route sans rendu : elle redirige vers le dépôt ou la connexion. */
export default function PartageRoute() {
  const router = useRouter();
  const session = useSession();
  const params = useLocalSearchParams<{
    uri?: string;
    name?: string;
    type?: string;
    size?: string;
  }>();
  const file = useMemo(() => {
    if (typeof params.uri !== 'string' || params.uri === '') return null;
    const query = new URLSearchParams({
      uri: params.uri,
      ...(typeof params.name === 'string' ? { name: params.name } : {}),
      ...(typeof params.type === 'string' ? { type: params.type } : {}),
      ...(typeof params.size === 'string' ? { size: params.size } : {}),
    });
    return parseSharedUri(`learny://partage?${query.toString()}`);
  }, [params.name, params.size, params.type, params.uri]);

  useEffect(() => {
    let cancelled = false;
    const open = async (): Promise<void> => {
      if (file !== null) await keepSharedFile(file);
      if (cancelled) return;
      router.replace(session.status === 'signedIn' ? '/formations/depot' : '/(auth)/connexion');
    };
    void open();
    return () => {
      cancelled = true;
    };
  }, [file, router, session.status]);

  return null;
}
