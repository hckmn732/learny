// Demonstration of SPEC-509: real note and PDF ingestion in a rolled-back transaction, mock
// embeddings and a failure followed by a successful retry (ADR-0048, ADR-0049).
import { loadSpec509Demo, type Spec509Data } from '../../app/%5Fdev/sdd/spec-509-data';

import { Spec509View } from './spec-509-client';

export default async function Spec509Demo() {
  let data: Spec509Data;
  try {
    data = await loadSpec509Demo();
  } catch {
    return (
      <div className="mt-6">
        <p role="alert">Démonstration indisponible : la base locale n’est pas accessible.</p>
      </div>
    );
  }

  return (
    <>
      <Spec509View data={data} />
    </>
  );
}
