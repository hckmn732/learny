// /programme/groupe/:fid — Formations à plusieurs (maquette Groupe.dc.html).
//
// Thin route: the screen lives in `src/features/mr/programme`.
import { useLocalSearchParams, useRouter } from 'expo-router';

import { GroupeScreen } from '../../../../src/features/mr/programme/GroupeScreen';

export default function GroupeRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fid?: string }>();

  return (
    <GroupeScreen
      formationId={typeof params.fid === 'string' ? params.fid : ''}
      onBack={() => {
        router.back();
      }}
    />
  );
}