'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  useForm,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import { type z } from 'zod';

/**
 * `useForm` with the Zod resolver and blur-then-change validation (ADR-0064, EF-14).
 * The cast only bridges Zod's input/output inference to react-hook-form's single form type.
 */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  options?: Omit<UseFormProps<z.infer<S>>, 'resolver' | 'mode' | 'reValidateMode'>,
): UseFormReturn<z.infer<S>> {
  return useForm<z.infer<S>>({
    resolver: zodResolver(schema) as unknown as Resolver<z.infer<S>>,
    mode: 'onBlur',
    reValidateMode: 'onChange',
    ...options,
  });
}
