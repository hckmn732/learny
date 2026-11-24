// Types out of the mobile scope, and types this version does not know (SPEC-3301 CL-1,
// ADR-3009 § 2): the card « Cette activité se fait sur le web » with its hand-off.
import type { NativeBrickViewProps } from '../../registry';
import { WebHandOff } from '../../shared';

/** Hand-off card of `instruction`, `scripted_dialogue`, `timer`, `scoring` and of an unknown type. */
export function WebOnlyView({ brick, onOpenWeb, testID }: NativeBrickViewProps) {
  return <WebHandOff onOpenWeb={onOpenWeb} testID={testID} type={brick.type} />;
}
