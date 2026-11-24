// `BrickView` — the single entry point of a brick (SPEC-3301 EF-1).
//
// `{ brick, mode, correction, response, onResponse, disabled }`: the type of the charge selects the
// component of the registry; `read` is the course, `play` the validation quiz, the global quiz and
// the warm-up. The views themselves never accept a good answer before the server sends the
// correction back (ET-2, CA-3), and each of them validates the public charge with the mirror of
// its type (BR-BRI-02, CL-2).
import { KeyboardAvoidingView } from 'react-native';

import { BRICK_TYPES } from '@learny/bricks';

import { platform } from '../theme';

import type { NativeBrickViewProps } from './registry';
import { WebHandOff } from './shared';
import { nativeBrickViews } from './views';

const TEXT_ENTRY_TYPES: readonly string[] = ['cloze', 'open_question'];

/** Renders one brick, in reading or playing mode. */
export function BrickView(props: NativeBrickViewProps) {
  const type = props.brick.type;
  if (!(BRICK_TYPES as readonly string[]).includes(type)) {
    // A type the server knows and this version does not (CL-1): never a crash.
    return <WebHandOff onOpenWeb={props.onOpenWeb} testID={props.testID} type={type} />;
  }
  const View = nativeBrickViews[type];
  const content = <View {...props} />;
  if (props.mode === 'play' && TEXT_ENTRY_TYPES.includes(type)) {
    return (
      <KeyboardAvoidingView behavior={platform === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    );
  }
  return content;
}
