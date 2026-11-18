import { buildTutorDemo } from '@learny/tutor/demo';

import { Spec508Client } from './spec-508-client';

/** Server-rendered demonstration of SPEC-508: no database, no network, no provider key. */
export default async function Spec508Demo() {
  const demo = await buildTutorDemo();
  return (
    <>
      <Spec508Client demo={demo} />
    </>
  );
}
