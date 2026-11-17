'use client';

import { useState } from 'react';

import { BottomActionBar, BottomSheet, Button, ResponsivePanel, ScrollableTable } from '@learny/ui';

export function ResponsiveGalleryDemo() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex flex-col gap-16">
      <div className="flex flex-wrap gap-8">
        <Button
          data-testid="ui-responsive-panel-open"
          onClick={() => {
            setPanelOpen(true);
          }}
        >
          Ouvrir le panneau
        </Button>
        <Button
          data-testid="ui-bottom-sheet-open"
          variant="outline"
          onClick={() => {
            setSheetOpen(true);
          }}
        >
          Ouvrir la feuille
        </Button>
      </div>
      <ResponsivePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title="Panneau responsive"
        testId="ui-responsive-panel"
      >
        <p className="m-0 p-16 text-14 text-ink-secondary">
          Plein écran sous 768 px, panneau latéral au-delà.
        </p>
      </ResponsivePanel>
      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Feuille basse"
        testId="ui-bottom-sheet"
      >
        <p className="m-0 text-14 text-ink-secondary">Feuille plein largeur en bas de l’écran.</p>
      </BottomSheet>
      <ScrollableTable label="Tableau défilant de démonstration" testId="ui-scrollable-table">
        <table className="w-full min-w-[720px] border-collapse text-left text-14">
          <thead>
            <tr>
              <th scope="col">Colonne</th>
              <th scope="col">Valeur</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Largeur minimale</td>
              <td>720 px, défilement horizontal au clavier</td>
            </tr>
          </tbody>
        </table>
      </ScrollableTable>
      <BottomActionBar>
        <span className="text-13 text-ink-muted">Barre d’actions fixe sur mobile</span>
        <Button size="sm">Action principale</Button>
      </BottomActionBar>
    </div>
  );
}
