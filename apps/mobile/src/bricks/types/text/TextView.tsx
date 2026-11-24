// `text` brick, reading mode of the course (SPEC-3301 EF-7, BR-COU-01, ADR-3009 § 3).
import { Text } from '../../../ui';
import { Markdown } from '../../../ui/Markdown';
import { parsePublicPayload } from '../../public-schemas';
import type { NativeBrickViewProps } from '../../registry';
import { BrickCard, InvalidCharge, Sources } from '../../shared';

/** A Markdown insert of the course: title, body, references. */
export function TextView({ brick, testID }: NativeBrickViewProps) {
  const parsed = parsePublicPayload('text', brick.publicPayload);
  if (!parsed.ok) return <InvalidCharge type="text" testID={testID} />;
  const payload = parsed.payload;
  return (
    <BrickCard type="text" testID={testID}>
      {payload.title === undefined ? null : (
        <Text variant="sectionTitle" testID="brick-text-title">
          {payload.title}
        </Text>
      )}
      <Markdown markdown={payload.bodyMd} testID="brick-text-markdown" />
      <Sources sources={payload.sources} />
    </BrickCard>
  );
}
