import { serverApi } from '../../lib/api/server-client';

import { Spec508Client, type TutorDemo } from './spec-508-client';

/** Server-rendered demonstration of SPEC-508: no database, no network, no provider key. */
export default async function Spec508Demo() {
  const demo = (await (await serverApi()).api.devSddSpec508Demo({})) as TutorDemo;
  return (
    <>
      <Spec508Client demo={demo} />
    </>
  );
}
