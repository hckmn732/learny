import { serverApi } from '../../lib/api/server-client';

import Spec507Client, { type Spec507BudgetData } from './spec-507-client';

export default async function Spec507Demo() {
  const initial = (await (
    await serverApi()
  ).api.devSddSpec507Budget({
    body: { spend: '0', task: 'tutor' },
  })) as Spec507BudgetData;
  return <Spec507Client initial={initial} />;
}
