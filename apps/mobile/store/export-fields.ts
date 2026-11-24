// Artefacts texte des fiches de stores (SPEC-3502 EF-4).
//
// `store/metadata.ts` est la source unique ; ce module projette ses champs dans les fichiers que
// les consoles importent (App Store Connect et Google Play acceptent un texte par champ). Il est
// partagé par le générateur (`store/export-metadata.mjs`, exécutable avec Node 22) et par le test
// `store/metadata.test.ts`, qui compare le disque à cette projection : un fichier ne peut donc pas
// dériver de la source sans faire échouer la validation.
import { APP_STORE, PLAY } from './metadata.ts';

/** Un fichier de fiche : chemin relatif au répertoire `store/` et contenu exact. */
export interface StoreFile {
  readonly path: string;
  readonly content: string;
}

/**
 * Fichiers de la fiche française. Un fichier se termine par un saut de ligne : les consoles
 * n'ajoutent pas d'espace et un diff Git reste lisible.
 */
export function storeFiles(): readonly StoreFile[] {
  const appStore = 'app-store/fr-FR';
  const play = 'play/fr-FR';
  return [
    { path: `${appStore}/name.txt`, content: `${APP_STORE.name}\n` },
    { path: `${appStore}/subtitle.txt`, content: `${APP_STORE.subtitle}\n` },
    { path: `${appStore}/promotional-text.txt`, content: `${APP_STORE.promotionalText}\n` },
    { path: `${appStore}/description.txt`, content: `${APP_STORE.description}\n` },
    { path: `${appStore}/keywords.txt`, content: `${APP_STORE.keywords}\n` },
    { path: `${appStore}/support-url.txt`, content: `${APP_STORE.supportUrl}\n` },
    { path: `${appStore}/marketing-url.txt`, content: `${APP_STORE.marketingUrl}\n` },
    { path: `${appStore}/privacy-url.txt`, content: `${APP_STORE.privacyUrl}\n` },
    { path: `${play}/title.txt`, content: `${PLAY.title}\n` },
    { path: `${play}/short-description.txt`, content: `${PLAY.shortDescription}\n` },
    { path: `${play}/full-description.txt`, content: `${PLAY.fullDescription}\n` },
    { path: `${play}/privacy-url.txt`, content: `${PLAY.privacyUrl}\n` },
  ];
}
