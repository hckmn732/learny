'use client';

import { useState } from 'react';
import { z } from 'zod';

import { Button, Form, FormError, FormField, TextField, useZodForm } from '@learny/ui';

import { fr } from '../../../../messages/fr';

const t = fr.ui.gallery.saisie.form;

const schema = z.object({
  email: z.email('Saisissez une adresse e-mail valide.'),
  password: z.string().min(12, 'Le mot de passe doit faire 12 caractères au moins.'),
});

type ExampleValues = z.infer<typeof schema>;

export function ExampleForm() {
  const form = useZodForm(schema, { defaultValues: { email: '', password: '' } });
  const [created, setCreated] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const submit = form.handleSubmit(
    () => {
      setGlobalError(null);
      setCreated(true);
    },
    () => {
      setGlobalError(null);
    },
  );

  return (
    <Form
      aria-label={t.title}
      className="max-w-[30rem]"
      data-testid="ui-example-form"
      form={form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event);
      }}
    >
      <FormField
        label={t.email}
        name="email"
        render={(api) => (
          <TextField
            aria-describedby={api['aria-describedby']}
            aria-invalid={api['aria-invalid']}
            autoComplete="email"
            error={api.error}
            id={api.id}
            label={api.label}
            name={api.name}
            onBlur={api.onBlur}
            onChange={api.onChange}
            placeholder={t.emailPlaceholder}
            ref={api.ref}
            type="email"
            value={api.value}
          />
        )}
      />
      <FormField
        label={t.password}
        name="password"
        render={(api) => (
          <TextField
            aria-describedby={api['aria-describedby']}
            aria-invalid={api['aria-invalid']}
            autoComplete="new-password"
            error={api.error}
            id={api.id}
            label={api.label}
            name={api.name}
            onBlur={api.onBlur}
            onChange={api.onChange}
            placeholder={t.passwordPlaceholder}
            ref={api.ref}
            type="password"
            value={api.value}
          />
        )}
      />
      {globalError ? <FormError>{globalError}</FormError> : null}
      {created ? (
        <p className="text-13 font-600 text-green-ink" role="status">
          {t.success}
        </p>
      ) : null}
      <Button fullWidth size="xl" type="submit" variant="dark">
        {t.submit}
      </Button>
    </Form>
  );
}

export type { ExampleValues };
