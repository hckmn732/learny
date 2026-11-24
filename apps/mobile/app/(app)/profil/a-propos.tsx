// À propos (SPEC-3502 EF-6) : version, build et licences générées, écran empilé du Profil.
import { useRouter } from 'expo-router';

import { AboutScreen } from '../../../src/features/profil/AboutScreen';

export default function AProposRoute() {
  const router = useRouter();
  return (
    <AboutScreen
      onBack={() => {
        router.back();
      }}
    />
  );
}
