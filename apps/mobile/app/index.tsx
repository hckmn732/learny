// Entry route (SPEC-3001 EF-1). A test build opens the demonstration page directly; a build
// without the SDD pages shows the placeholder of the installed application.
import { Redirect } from 'expo-router';

import { configResult } from '../src/config';
import { HomePlaceholder } from '../src/features/sdd/HomePlaceholder';

export default function IndexRoute() {
  if (configResult.ok && configResult.config.enableSddPages) {
    return <Redirect href="/_dev/sdd/SPEC-3001" />;
  }

  return <HomePlaceholder />;
}
