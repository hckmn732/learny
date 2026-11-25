// Browser of the web hand-offs (SPEC-3102 EF-5): the only module that imports `expo-web-browser`.
//
// Imported once by `app/_layout.tsx`, like `src/api/instance.ts` for the API client: the screens
// call `openOnWeb()` of `src/lib/web.ts`, which stays free of native code and testable in Node.
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { setNativeNavigator, setWebOpener } from './web';

setWebOpener((url) => WebBrowser.openBrowserAsync(url));
setNativeNavigator((route) => {
  router.push(route);
});
