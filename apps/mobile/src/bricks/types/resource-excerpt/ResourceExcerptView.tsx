// `resource_excerpt` brick (SPEC-3301 EF-7, BR-COU-02): a cited passage and the link to its resource.
import { Text } from '../../../ui';
import { Markdown } from '../../../ui/Markdown';
import { parsePublicPayload } from '../../public-schemas';
import type { NativeBrickViewProps } from '../../registry';
import { BrickCard, InvalidCharge, QuestionHeader, Sources } from '../../shared';
import { locationLabel } from '../../sources';

/** One quote of a resource, with its page, minute, anchor or excerpt and its link. */
export function ResourceExcerptView({ brick, onOpenResource, testID }: NativeBrickViewProps) {
  const parsed = parsePublicPayload('resource_excerpt', brick.publicPayload);
  if (!parsed.ok) return <InvalidCharge type="resource_excerpt" testID={testID} />;
  const payload = parsed.payload;
  return (
    <BrickCard type="resource_excerpt" testID={testID}>
      <QuestionHeader instruction={payload.label} type="resource_excerpt" />
      <Markdown markdown={payload.quote} testID="brick-excerpt-quote" />
      <Text variant="caption" tone="muted" testID="brick-excerpt-location">
        {locationLabel(payload.location)}
      </Text>
      <Sources
        onOpenResource={onOpenResource}
        resourceId={payload.resourceId}
        resourceLabel={payload.label}
        sources={payload.sources}
      />
    </BrickCard>
  );
}
