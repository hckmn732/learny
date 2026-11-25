// /profil/cles-ia — Clés d'IA personnelles (maquette ClesIA.dc.html, zone C).
//
// Le formulaire quitte la coquille du scaffold : l'ajout, le test et la suppression d'une clé se
// font désormais dans l'application (ADR-4002 §3, rang 10), avec les routes `me.ai.credentials.*`.
import { useRouter } from 'expo-router';

import { ClesIaScreen } from '../../../src/features/mr/evaluation/ClesIaScreen';

export default function ClesIaRoute() {
  const router = useRouter();
  return (
    <ClesIaScreen
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/profil');
      }}
      onOpenModels={() => {
        router.push('/profil/modeles');
      }}
    />
  );
}