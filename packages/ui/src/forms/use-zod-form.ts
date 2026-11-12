'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  useForm,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import { type core, type z } from 'zod';

/**
 * `useForm` with the Zod resolver. `onTouched` validates on the first blur and then re-validates
 * on every keystroke, which is the CL-8 behaviour; `reValidateMode` keeps that behaviour after a
 * submission (ADR-0269). The cast only bridges Zod's input/output inference to
 * react-hook-form's single form type.
 */
export function useZodForm<S extends core.$ZodType<FieldValues, FieldValues>>(
  schema: S,
  options?: Omit<UseFormProps<z.infer<S>>, 'resolver' | 'mode' | 'reValidateMode'>,
): UseFormReturn<z.infer<S>> {
  return useForm<z.infer<S>>({
    resolver: zodResolver(schema) as unknown as Resolver<z.infer<S>>,
    mode: 'onTouched',
    reValidateMode: 'onChange',
    ...options,
  });
}
