import { getPublicEnv } from '../../lib/server-env';

import Spec205Client from './spec-205-client';

// SPEC-205 demonstration (EF-7): the server component only passes the public VAPID key, read from
// the validated public configuration (never the private one); the simulation runs client-side.
export default function Spec205Demo() {
  const publicKey = getPublicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return <Spec205Client publicKey={publicKey} />;
}
