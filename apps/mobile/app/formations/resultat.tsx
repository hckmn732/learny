// Alias statique de l'écran de résultat (SPEC-4003). La route dynamique
// `/formations/[fid]/resultat` reste servie par le deep link ; ce point d'entrée stable est utilisé
// par la navigation interne après « Passer », pour ne dépendre d'aucun paramètre de segment.
export { default } from './[fid]/resultat';
