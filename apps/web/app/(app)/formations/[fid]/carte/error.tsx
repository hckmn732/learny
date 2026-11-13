'use client';

import { NotionGraphError } from '../../../../../components/notion-graph/NotionGraphError';

/** Error boundary of SCR-14 (SPEC-616 §10): same distinct error state as a failed server read. */
export default function CarteError() {
  return (
    <main className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40">
      <NotionGraphError />
    </main>
  );
}
