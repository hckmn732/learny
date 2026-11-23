// Course route, stacked above the tabs (SPEC-3302 EF-1, BR-NAV-04; ADR-3002 § 3).
//
// `cours/<courseId>?chapitre=<cid>`: the segment is the module whose course is read (the identifier
// the Programme tab already holds in `chapter.courseHref`), the query parameter selects the chapter.
// The route owns the three things a screen must not know: the back of the tab stack, the neighbour
// chapters (one entry of the stack, replaced instead of pushed) and the web hand-offs of the two
// destinations delivered by SPEC-3303 and SPEC-3304.
import { useLocalSearchParams, useRouter } from 'expo-router';

import { CourseScreen } from '../../src/features/cours/CourseScreen';
import { openOnWeb } from '../../src/lib/web';

/** Reading screen of one chapter, opened from the Programme tab. */
export default function CourseRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ courseId?: string; chapitre?: string }>();
  const moduleId = typeof params.courseId === 'string' ? params.courseId : '';
  const chapterId = typeof params.chapitre === 'string' ? params.chapitre : null;

  return (
    <CourseScreen
      chapterId={chapterId}
      moduleId={moduleId}
      onBack={() => {
        // BR-NAV-04 - the course is stacked above the tabs: back returns to the Programme tab.
        if (router.canGoBack()) router.back();
        else router.replace('/programme');
      }}
      onOpenChapter={(next) => {
        // One entry of the stack for the course: a neighbour chapter replaces the current one, so the
        // back gesture always returns to the Programme tab (BR-NAV-04).
        router.replace({
          pathname: '/cours/[courseId]',
          params: { courseId: moduleId, chapitre: next },
        });
      }}
      onOpenWeb={(path) => {
        void openOnWeb(path);
      }}
    />
  );
}
