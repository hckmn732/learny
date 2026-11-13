// Demonstration of SPEC-512: the two simulated provider routes, the refusal for the course task,
// the validated contract and the learner's explicit import of a suggestion.
import { loadSearchWebDemo } from '../../app/%5Fdev/sdd/spec-512-data';
import { BaseTokenStyle } from '../sdd/base-tokens';

import { Spec512Client } from './spec-512-client';

export default async function Spec512Demo() {
  const data = await loadSearchWebDemo();
  return (
    <>
      <BaseTokenStyle />
      <Spec512Client data={data} />
    </>
  );
}
