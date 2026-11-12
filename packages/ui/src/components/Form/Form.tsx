'use client';

import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import {
  FormProvider,
  useController,
  useFormContext,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';

import { cn } from '../../cn';

/** Props handed to the render function of `FormField` (EF-14). */
export interface FormFieldApi {
  id: string;
  name: string;
  label: string;
  hint?: string | undefined;
  hideLabel: boolean;
  value: string | number | readonly string[] | undefined;
  onChange: (...event: unknown[]) => void;
  onBlur: () => void;
  ref: (instance: unknown) => void;
  error?: string | undefined;
  'aria-invalid'?: true | undefined;
  'aria-describedby'?: string | undefined;
}

export interface FormFieldProps {
  name: string;
  label: string;
  hint?: string;
  hideLabel?: boolean;
  render: (api: FormFieldApi) => ReactNode;
}

/**
 * Binds one react-hook-form field to any control: id, label, `aria-invalid`,
 * `aria-describedby` and the Zod error all come from the surrounding `Form`.
 */
export function FormField({ name, label, hint, hideLabel = false, render }: FormFieldProps) {
  const { control } = useFormContext();
  const { field, fieldState } = useController({ control, name });
  const generatedId = useId();
  const id = `field-${name}-${generatedId}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = `${id}-error`;
  const rawError: unknown = fieldState.error?.message;
  const error = typeof rawError === 'string' ? rawError : undefined;
  const describedBy = [hintId, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  return render({
    id,
    name: field.name,
    label,
    hint,
    hideLabel,
    value: field.value as string | number | readonly string[] | undefined,
    onChange: field.onChange,
    onBlur: field.onBlur,
    ref: field.ref,
    error,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  });
}

export interface FormProps<T extends FieldValues> extends ComponentPropsWithoutRef<'form'> {
  form: UseFormReturn<T>;
}

/** `FormProvider` plus an always-`noValidate` form element (EF-14). */
export function Form<T extends FieldValues>({ form, className, children, ...props }: FormProps<T>) {
  return (
    <FormProvider {...form}>
      <form className={cn('flex flex-col gap-16', className)} noValidate {...props}>
        {children}
      </form>
    </FormProvider>
  );
}

export type FormErrorProps = ComponentPropsWithoutRef<'p'>;

/** Global form error, announced immediately (EF-14). */
export function FormError({ className, children, ...props }: FormErrorProps) {
  return (
    <p
      className={cn(
        'rounded-12 bg-orange-soft px-12 py-10 text-13 font-600 text-orange-ink',
        className,
      )}
      role="alert"
      {...props}
    >
      {children}
    </p>
  );
}
