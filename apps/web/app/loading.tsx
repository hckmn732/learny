import { SystemLoadingView } from '../components/system/system-page-view';

// Root loading state (SPEC-308 EF-1): a French heading, a skeleton and a way out. It is a server
// component so the text and the home link stay visible without JavaScript (CL-1).
export default function Loading() {
  return <SystemLoadingView />;
}
