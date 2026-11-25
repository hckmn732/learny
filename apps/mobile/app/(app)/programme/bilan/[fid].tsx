// /programme/bilan/:fid — Bilan final et entretien de mémoire (maquette Bilan.dc.html).
//
// Thin route: the screen lives in `src/features/mr/programme`. The notion map is the route of the
// exploration zone; this one only asks for it.
import { useLocalSearchParams, useRouter } from 'expo-router';

import { BilanScreen } from '../../../../src/features/mr/programme/BilanScreen';

export default function BilanRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fid?: string }>();
  const formationId = typeof params.fid === 'string' ? params.fid : '';

  return (
    <BilanScreen
      formationId={formationId}
      onBack={() => {
        router.back();
      }}
      onOpenMap={() => {
        router.push({ pathname: '/programme/carte/[fid]', params: { fid: formationId } });
      }}
    />
  );
}