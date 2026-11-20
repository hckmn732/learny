import { Card } from '@learny/ui';

const LOADERS = [
  ['Accueil', 'GET /home'],
  ['Agenda', 'GET /agenda'],
  ['Cadrage', 'GET /formations/:fid/cadrage'],
  ['Exercice', 'GET /formations/:fid/modules/:mid/exercises/:aid'],
  ['Bilan final', 'GET /formations/:fid/final-review'],
  ['Lacunes', 'GET /formations/:fid/gaps'],
  ['Quiz global', 'GET /formations/:fid/global-quiz/today'],
  ['Groupe', 'GET /formations/:fid/group'],
  ['Notifications', 'GET /me/notification-settings'],
  ['Carte des notions', 'GET /formations/:fid/notion-graph'],
  ['Programme', 'GET /formations/:fid/programme'],
  ['Recherche', 'GET /search'],
  ['Paramètres', 'GET /me/profile'],
  ['Modèles d’IA', 'GET /me/ai/models'],
  ['Coquille', 'GET /me/sidebar · GET /me/header'],
] as const;

function metric(value: string | null): string {
  return value ?? 'Indisponible';
}

export default function Spec1202Demo() {
  return (
    <div className="flex flex-col gap-16">
      <p data-testid="spec-1202-budget">
        Budget ≤ 25 ms : mesure environnementale non disponible, aucun résultat synthétique.
      </p>
      <Card className="overflow-x-auto">
        <table data-testid="spec-1202-loaders" className="w-full border-collapse text-13">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="p-12">Écran</th>
              <th className="p-12">Route</th>
              <th className="p-12">Médiane avant</th>
              <th className="p-12">Médiane après</th>
              <th className="p-12">Budget</th>
            </tr>
          </thead>
          <tbody>
            {LOADERS.map(([screen, route]) => (
              <tr key={screen} className="border-b border-border last:border-b-0">
                <th className="p-12 text-left font-600" scope="row">
                  {screen}
                </th>
                <td className="p-12 font-mono">{route}</td>
                <td className="p-12 tabular-nums">{metric(null)}</td>
                <td className="p-12 tabular-nums">{metric(null)}</td>
                <td className="p-12 tabular-nums">Non mesuré</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
