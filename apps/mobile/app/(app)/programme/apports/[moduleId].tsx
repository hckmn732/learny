// /programme/apports/:moduleId — Apports et import du programme (maquette Apports.dc.html).
//
// Thin route: the screen lives in `src/features/mr/programme` so that its states are tested
// without the router. The chapter opened from the Programme tab travels in `?chapitre=`.
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ApportsScreen } from '../../../../src/features/mr/programme/ApportsScreen';

export default function ApportsRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ moduleId?: string; chapitre?: string }>();

  return (
    <ApportsScreen
      moduleId={typeof params.moduleId === 'string' ? params.moduleId : ''}
      initialChapterId={typeof params.chapitre === 'string' ? params.chapitre : null}
      onBack={() => {
        router.back();
      }}
    />
  );
}