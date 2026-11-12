import { Search } from 'lucide-react';
import type { Metadata } from 'next';

import {
  Checkbox,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  TextField,
} from '@learny/ui';

import { GalleryCard } from '../../../../components/dev-ui/GalleryCard';
import { fr } from '../../../../messages/fr';

import { ExampleForm } from './ExampleForm';
import { SegmentedControls, Switches } from './SaisieControls';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const t = fr.ui.gallery.saisie;

export default function SaisieGalleryPage() {
  return (
    <div data-testid="ui-saisie-gallery">
      <header>
        <p className="text-14 text-ink-muted">{fr.ui.gallery.surtitle}</p>
        <h1 className="mt-4 font-display text-34 font-semibold tracking-title">{t.title}</h1>
        <p className="mt-8 max-w-[42rem] text-15 text-ink-secondary">{t.intro}</p>
      </header>

      <GalleryCard
        intro={t.textFields.intro}
        testId="ui-saisie-textfields"
        title={t.textFields.title}
      >
        <div className="grid grid-cols-1 gap-16 shell:grid-cols-2">
          <TextField
            data-testid="ui-textfield-form"
            hint={t.textFields.formHint}
            label={t.textFields.formLabel}
            placeholder="vous@exemple.fr"
            type="email"
          />
          <TextField
            data-testid="ui-textfield-search"
            label={t.textFields.searchLabel}
            leadingIcon={Search}
            placeholder={t.textFields.searchPlaceholder}
            type="search"
            variant="search"
          />
          <TextField
            data-testid="ui-textfield-error"
            defaultValue="court"
            error={t.textFields.error}
            label={t.textFields.errorLabel}
            type="password"
          />
          <TextField
            defaultValue="Libellé masqué"
            hideLabel
            label={t.textFields.formLabel}
            variant="form"
          />
        </div>
      </GalleryCard>

      <GalleryCard intro={t.textarea.intro} testId="ui-saisie-textarea" title={t.textarea.title}>
        <Textarea
          data-testid="ui-textarea"
          defaultValue="Les écritures de régularisation se font en fin de période."
          hint={t.textarea.hint}
          label={t.textarea.label}
          maxLength={200}
          placeholder={t.textarea.placeholder}
          rows={4}
        />
      </GalleryCard>

      <GalleryCard intro={t.select.intro} testId="ui-saisie-select" title={t.select.title}>
        <Select
          data-testid="ui-select"
          defaultValue="anthropic"
          hint={t.select.hint}
          label={t.select.label}
          options={[
            { value: 'anthropic', label: 'Anthropic · ma clé' },
            { value: 'openai', label: 'OpenAI · ma clé' },
            { value: 'deepseek', label: t.select.disabledOption, disabled: true },
          ]}
        />
      </GalleryCard>

      <GalleryCard intro={t.checkbox.intro} testId="ui-saisie-checkbox" title={t.checkbox.title}>
        <div className="flex flex-col gap-12">
          <Checkbox defaultChecked label={t.checkbox.label} />
          <Checkbox indeterminate label={t.checkbox.indeterminate} />
          <Checkbox error={t.checkbox.error} label={t.checkbox.errorLabel} />
          <Checkbox disabled label={t.checkbox.label} />
        </div>
      </GalleryCard>

      <GalleryCard intro={t.tabs.intro} testId="ui-saisie-tabs" title={t.tabs.title}>
        <div className="flex flex-col gap-20">
          <Tabs defaultValue="en-cours">
            <TabsList aria-label={t.tabs.softLabel} data-testid="ui-tabs-soft">
              <TabsTrigger value="en-cours">{t.tabs.softA}</TabsTrigger>
              <TabsTrigger value="terminees">{t.tabs.softB}</TabsTrigger>
              <TabsTrigger value="archivees">{t.tabs.softC}</TabsTrigger>
            </TabsList>
            <TabsContent value="en-cours">{t.tabs.softA}</TabsContent>
            <TabsContent value="terminees">{t.tabs.softB}</TabsContent>
            <TabsContent value="archivees">{t.tabs.softC}</TabsContent>
          </Tabs>

          <Tabs defaultValue="profil">
            <TabsList aria-label={t.tabs.solidLabel} data-testid="ui-tabs-solid" variant="solid">
              <TabsTrigger value="profil">{t.tabs.solidA}</TabsTrigger>
              <TabsTrigger value="notifications">{t.tabs.solidB}</TabsTrigger>
              <TabsTrigger value="apprentissage">{t.tabs.solidC}</TabsTrigger>
            </TabsList>
            <TabsContent value="profil">{t.tabs.panelA}</TabsContent>
            <TabsContent value="notifications">{t.tabs.panelB}</TabsContent>
            <TabsContent value="apprentissage">{t.tabs.panelC}</TabsContent>
          </Tabs>
        </div>
      </GalleryCard>

      <GalleryCard intro={t.switches.intro} testId="ui-saisie-switches" title={t.switches.title}>
        <Switches />
      </GalleryCard>

      <GalleryCard intro={t.segmented.intro} testId="ui-saisie-segmented" title={t.segmented.title}>
        <SegmentedControls />
      </GalleryCard>

      <GalleryCard intro={t.form.intro} testId="ui-saisie-form" title={t.form.title}>
        <ExampleForm />
      </GalleryCard>
    </div>
  );
}
