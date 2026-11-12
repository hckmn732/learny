// Server rendering and class snapshots (SPEC-302 ET-2, CA-6).
import { Bell, Search } from 'lucide-react';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  Badge,
  Button,
  Checkbox,
  Chip,
  CountBadge,
  Form,
  FormError,
  FormField,
  IconButton,
  Link,
  SegmentedControl,
  Select,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  TextField,
  useZodForm,
} from '../../src';
import { buttonVariants } from '../../src/components/Button';

const VARIANTS = ['lime', 'dark', 'outline', 'ghost', 'danger', 'outline-on-dark'] as const;
const SIZES = ['sm', 'md', 'lg', 'xl'] as const;
const TONES = [
  'neutral',
  'lime',
  'lime-soft',
  'indigo',
  'green',
  'orange',
  'violet',
  'on-dark',
  'default-model',
] as const;

const schema = z.object({ email: z.string() });

function ServerForm() {
  const form = useZodForm(schema, { defaultValues: { email: '' } });
  const submit = form.handleSubmit(() => {});
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
            onChange={api.onChange}
            ref={api.ref}
            value={api.value}
          />
        )}
      />
      <FormError>Erreur globale.</FormError>
      <Button type="submit">Envoyer</Button>
    </Form>
  );
}

const ELEMENTS: Array<[string, ReactElement]> = [
  ['Button', <Button>Continuer</Button>],
  ['IconButton', <IconButton icon={Bell} label="Notifications" />],
  ['Link', <Link href="/_dev/ui">Programme</Link>],
  ['TextField', <TextField label="E-mail" />],
  ['TextField search', <TextField label="Rechercher" leadingIcon={Search} variant="search" />],
  ['Textarea', <Textarea label="Notes" maxLength={200} />],
  [
    'Select',
    <Select
      label="Modèle"
      options={[
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B', disabled: true },
      ]}
    />,
  ],
  ['Checkbox', <Checkbox label="Recevoir le programme" />],
  ['Switch', <Switch checked label="Rappels" onCheckedChange={() => {}} />],
  [
    'SegmentedControl',
    <SegmentedControl
      aria-label="Filtre"
      onValueChange={() => {}}
      options={[
        { value: 'a', label: 'Toutes', count: 8 },
        { value: 'b', label: 'Non lues' },
      ]}
      value="a"
    />,
  ],
  [
    'Tabs',
    <Tabs defaultValue="a">
      <TabsList aria-label="Mes formations">
        <TabsTrigger value="a">En cours</TabsTrigger>
        <TabsTrigger value="b">Terminées</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Panneau A</TabsContent>
      <TabsContent value="b">Panneau B</TabsContent>
    </Tabs>,
  ],
  ['Chip', <Chip onPressedChange={() => {}} pressed shape="pill" />],
  ['Badge', <Badge tone="lime">Nouveau</Badge>],
  ['CountBadge', <CountBadge value={120} />],
  ['Form', <ServerForm />],
];

function classesOf(markup: string): string[] {
  return [...markup.matchAll(/class="([^"]*)"/g)].map((match) => match[1] ?? '');
}

function tagClass(markup: string, tag: 'input' | 'button'): string | undefined {
  return new RegExp(`<${tag}[^>]*class="([^"]*)"`).exec(markup)?.[1];
}

describe('[SPEC-302] rendu serveur', () => {
  it('rend chaque composant sans erreur (ET-2)', () => {
    for (const [name, element] of ELEMENTS) {
      expect(() => renderToString(element), name).not.toThrow();
    }
  });

  it('transmet data-testid et les attributs aria des composants', () => {
    const markup = renderToString(
      <div>
        <Button data-testid="bouton" aria-describedby="aide">
          Continuer
        </Button>
        <TextField data-testid="champ" label="E-mail" />
        <IconButton data-testid="icone" icon={Bell} label="Notifications" />
      </div>,
    );
    expect(markup).toContain('data-testid="bouton"');
    expect(markup).toContain('aria-describedby="aide"');
    expect(markup).toContain('data-testid="champ"');
    expect(markup).toContain('data-testid="icone"');
  });

  it('fige les classes générées pour chaque variante (CA-6)', () => {
    const snapshot = {
      buttons: Object.fromEntries(
        VARIANTS.flatMap((variant) =>
          SIZES.map((size) => [
            `${variant}-${size}`,
            classesOf(
              renderToString(
                <Button variant={variant} size={size}>
                  Continuer
                </Button>,
              ),
            )[0],
          ]),
        ),
      ),
      badges: Object.fromEntries(
        TONES.map((tone) => [tone, classesOf(renderToString(<Badge tone={tone}>État</Badge>))[0]]),
      ),
      badgeSmall: classesOf(
        renderToString(
          <Badge size="sm" tone="lime">
            État
          </Badge>,
        ),
      )[0],
      chips: Object.fromEntries(
        (['rounded', 'pill'] as const).map((shape) => [
          shape,
          classesOf(
            renderToString(
              <Chip onPressedChange={() => {}} pressed={shape === 'rounded'} shape={shape}>
                Choix
              </Chip>,
            ),
          )[0],
        ]),
      ),
      iconButtons: Object.fromEntries(
        (['light', 'dark'] as const).map((tone) => [
          tone,
          classesOf(
            renderToString(<IconButton icon={Bell} label="Notifications" tone={tone} />),
          )[0],
        ]),
      ),
      textFields: {
        form: tagClass(renderToString(<TextField label="E-mail" />), 'input'),
        search: tagClass(
          renderToString(<TextField label="Rechercher" leadingIcon={Search} variant="search" />),
          'input',
        ),
        error: tagClass(renderToString(<TextField error="Invalide." label="E-mail" />), 'input'),
      },
      switch: tagClass(
        renderToString(<Switch checked label="Rappels" onCheckedChange={() => {}} />),
        'button',
      ),
      segmented: classesOf(
        renderToString(
          <SegmentedControl
            aria-label="Filtre"
            onValueChange={() => {}}
            options={[
              { value: 'a', label: 'Toutes', count: 8 },
              { value: 'b', label: 'Non lues' },
            ]}
            value="a"
          />,
        ),
      )[0],
      tabs: classesOf(
        renderToString(
          <Tabs defaultValue="a">
            <TabsList aria-label="Mes formations">
              <TabsTrigger value="a">En cours</TabsTrigger>
            </TabsList>
          </Tabs>,
        ),
      ).slice(0, 2),
      buttonVariants: {
        base: buttonVariants(),
        lime: buttonVariants({ variant: 'lime', size: 'sm' }),
        xl: buttonVariants({ variant: 'dark', size: 'xl', fullWidth: true }),
      },
    };

    expect(snapshot).toMatchSnapshot();
  });
});
