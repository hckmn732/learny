// Demonstration of SPEC-511: real rows read under RLS, deterministic mock embeddings, cosine
// ranking, per-task token budgets, data-tag escaping and honest empty/error states (ADR-0049).
import { loadSpec511Demo, type Spec511Data } from '../../app/%5Fdev/sdd/spec-511-data';
import { BaseTokenStyle } from '../sdd/base-tokens';

import { Spec511View } from './spec-511-client';

export default async function Spec511Demo() {
  let data: Spec511Data;
  try {
    data = await loadSpec511Demo();
  } catch {
    return (
      <div className="mt-6">
        <p role="alert">Démonstration indisponible : la base locale n’est pas accessible.</p>
      </div>
    );
  }

  return (
    <>
      <BaseTokenStyle />
      <Spec511View data={data} />
    </>
  );
}
