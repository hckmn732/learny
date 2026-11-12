// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { renderComponent } from '@learny/testing/render';

import { useZodForm } from '../../forms';
import { Button } from '../Button';
import { TextField } from '../TextField';

import { Form, FormError, FormField } from './Form';

afterEach(cleanup);

const schema = z.object({
  email: z.email('Saisissez une adresse e-mail valide.'),
  password: z.string().min(12, 'Le mot de passe doit faire 12 caractères au moins.'),
});

function Example() {
  const form = useZodForm(schema, { defaultValues: { email: '', password: '' } });
  const [created, setCreated] = useState(false);
  const submit = form.handleSubmit(() => {
    setCreated(true);
  });
  return (
    <Form
      form={form}
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <FormField
        label="E-mail"
        name="email"
        render={(api) => (
          <TextField
            error={api.error}
            id={api.id}
            label={api.label}
            name={api.name}
            onBlur={api.onBlur}
            onChange={api.onChange}
            ref={api.ref}
            value={api.value}
          />
        )}
      />
      <FormField
        label="Mot de passe"
        name="password"
        render={(api) => (
          <TextField
            error={api.error}
            id={api.id}
            label={api.label}
            name={api.name}
            onBlur={api.onBlur}
            onChange={api.onChange}
            ref={api.ref}
            type="password"
            value={api.value}
          />
        )}
      />
      {created ? <FormError>Compte créé.</FormError> : null}
      <Button type="submit">Créer mon compte</Button>
    </Form>
  );
}

describe('[SPEC-302] useZodForm', () => {
  it('affiche les erreurs Zod au blur puis les retire à la frappe (CL-8)', async () => {
    const { user } = renderComponent(<Example />);
    const email = screen.getByLabelText('E-mail');

    await user.type(email, 'pas-un-email');
    await user.tab();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Saisissez une adresse e-mail valide.');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.getAttribute('aria-describedby')).toBeTruthy();

    await user.clear(email);
    await user.type(email, 'alex@exemple.fr');
    await waitFor(() => {
      expect(screen.queryByText('Saisissez une adresse e-mail valide.')).toBeNull();
    });
    expect(email.getAttribute('aria-invalid')).toBeNull();
  });

  it('à la soumission invalide, affiche les deux erreurs et focalise le premier champ (CA-4)', async () => {
    const { user } = renderComponent(<Example />);
    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    await waitFor(() => {
      expect(screen.getAllByRole('alert')).toHaveLength(2);
    });
    expect(screen.getByText('Saisissez une adresse e-mail valide.')).toBeTruthy();
    expect(screen.getByText('Le mot de passe doit faire 12 caractères au moins.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('E-mail'));
  });

  it('soumet une fois les valeurs valides', async () => {
    const { user } = renderComponent(<Example />);
    await user.type(screen.getByLabelText('E-mail'), 'alex@exemple.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'motdepasse123');
    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(await screen.findByText('Compte créé.')).toBeTruthy();
  });
});
