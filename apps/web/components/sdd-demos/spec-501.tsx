import { loadSpec501Demo } from '../../app/%5Fdev/sdd/spec-501-data';

import Spec501Demo from './spec-501-demo';

export default async function Spec501DemoLoader() {
  const data = await loadSpec501Demo();
  return <Spec501Demo brick={data.brick} error={data.error} />;
}
