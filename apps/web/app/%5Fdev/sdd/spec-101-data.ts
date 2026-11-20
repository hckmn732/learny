import 'server-only';

import type { Spec101Data } from '@learny/contracts';

import { serverApi } from '../../../lib/api/server-client';

export {
  Spec101EnumNames as ENUM_NAMES,
  Spec101Enums as ENUMS,
  Spec101Extensions as EXTENSIONS,
  Spec101UnaccentExpected as UNACCENT_EXPECTED,
  type Identity,
  type Spec101Data,
} from '@learny/contracts';

export async function loadSpec101Demo(): Promise<Spec101Data> {
  return (await serverApi()).api.devSddSpec101Demo({}) as Promise<Spec101Data>;
}
