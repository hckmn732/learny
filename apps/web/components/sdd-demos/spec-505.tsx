import { loadSpec505Demo } from '../../app/%5Fdev/sdd/spec-505-data';

import Spec505DemoView from './spec-505-demo';

export default async function Spec505Demo() {
  const data = await loadSpec505Demo();
  return (
    <Spec505DemoView
      credentials={data.credentials}
      providers={data.providers}
      storage={data.storage}
      rawJson={data.rawJson}
      error={data.error}
    />
  );
}
