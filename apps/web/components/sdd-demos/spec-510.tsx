// Demonstration of SPEC-510: web page, YouTube captions and image reading (ADR-0048/0049).
import { loadSpec510Demo, type Spec510Data } from '../../app/%5Fdev/sdd/spec-510-data';
import { BaseTokenStyle } from '../sdd/base-tokens';

import { Spec510View } from './spec-510-client';

export default async function Spec510Demo() {
  let data: Spec510Data;
  try {
    data = await loadSpec510Demo();
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
      <Spec510View data={data} />
    </>
  );
}
