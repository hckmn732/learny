// Saisie de la production d'un exercice (zone C) : texte, lien, apport ou tableau structuré.
//
// Les quatre formes du contrat `ExerciseProduction` (SPEC-613 EF-1) sont rendues avec les jetons du
// thème. Le tableau reste éditable ligne à ligne (une ligne = une carte, lisible sur 390 pt) ; les
// contrôles de sommes (`sum_equal`) sont appliqués par le serveur, jamais recalculés ici.
import { Pressable, StyleSheet, View } from 'react-native';

import type { ExerciseInstruction, ExerciseSubmission } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { Chip } from '../../../ui/Chip';
import { Icon } from '../../../ui/Icon';
import { Text } from '../../../ui/Text';

import { Field } from './Field';

const t = fr.mr.evaluation.exercice;
const ex = fr.exercises;

export interface ProductionInputProps {
  readonly instruction: ExerciseInstruction;
  readonly submission: ExerciseSubmission;
  readonly onChange: (next: ExerciseSubmission) => void;
  readonly disabled: boolean;
}

/** Éditeur de la production, discriminé par le type du contrat. */
export function ProductionInput({
  instruction,
  submission,
  onChange,
  disabled,
}: ProductionInputProps) {
  const production = instruction.production;

  function setExplanation(value: string): void {
    onChange({ ...submission, explanation: value });
  }

  function setText(text: string): void {
    if (submission.kind !== 'text') return;
    onChange({ ...submission, text });
  }

  function setUrl(url: string): void {
    if (submission.kind !== 'link') return;
    onChange({ ...submission, url });
  }

  function setResource(resourceId: string): void {
    if (submission.kind !== 'file') return;
    onChange({ ...submission, resourceId });
  }

  function setField(key: string, value: string): void {
    if (submission.kind !== 'table') return;
    onChange({ ...submission, fields: { ...submission.fields, [key]: value } });
  }

  function setCell(index: number, key: string, value: string): void {
    if (submission.kind !== 'table') return;
    onChange({
      ...submission,
      rows: submission.rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    });
  }

  function addRow(): void {
    if (submission.kind !== 'table') return;
    onChange({ ...submission, rows: [...submission.rows, {}] });
  }

  function removeRow(index: number): void {
    if (submission.kind !== 'table') return;
    onChange({
      ...submission,
      rows: submission.rows.filter((_row, rowIndex) => rowIndex !== index),
    });
  }

  return (
    <View style={styles.container}>
      {production.kind === 'text' && submission.kind === 'text' ? (
        <View style={styles.block}>
          <Field
            label={t.entry}
            value={submission.text}
            onChangeText={setText}
            multiline
            maxLength={production.maxChars}
            editable={!disabled}
            testID="qf-exercice-text"
          />
          <Text variant="caption" tone="muted">
            {`${String(submission.text.length)} / ${String(production.maxChars)}`}
          </Text>
        </View>
      ) : null}

      {production.kind === 'link' && submission.kind === 'link' ? (
        <Field
          label={t.linkLabel}
          value={submission.url}
          onChangeText={setUrl}
          placeholder={t.linkPlaceholder}
          keyboardType="url"
          autoCapitalize="none"
          editable={!disabled}
          testID="qf-exercice-link"
        />
      ) : null}

      {production.kind === 'file' && submission.kind === 'file' ? (
        <Field
          label={t.fileLabel}
          value={submission.resourceId}
          onChangeText={setResource}
          hint={t.fileHint}
          autoCapitalize="none"
          editable={!disabled}
          testID="qf-exercice-file"
        />
      ) : null}

      {production.kind === 'table' && submission.kind === 'table' ? (
        <View style={styles.block}>
          {production.fields.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              value={submission.fields[field.key] ?? ''}
              onChangeText={(value) => {
                setField(field.key, value);
              }}
              editable={!disabled}
              testID={`qf-exercice-field-${field.key}`}
            />
          ))}

          {submission.rows.map((row, index) => (
            <View key={index} style={styles.rowCard} testID={`qf-exercice-row-${String(index)}`}>
              <View style={styles.rowHead}>
                <Text variant="label" tone="secondary">
                  {t.tableRow(index + 1)}
                </Text>
                {disabled || submission.rows.length <= production.minRows ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t.tableRemove} ${String(index + 1)}`}
                    onPress={() => {
                      removeRow(index);
                    }}
                    testID={`qf-exercice-remove-row-${String(index)}`}
                    style={styles.remove}
                  >
                    <Icon name="close" size={18} color={theme.colors.inkMuted} />
                  </Pressable>
                )}
              </View>
              {production.columns.map((column) =>
                column.type === 'select' ? (
                  <View key={column.key} style={styles.selectBlock}>
                    <Text variant="label" tone="secondary">
                      {column.label}
                    </Text>
                    <View style={styles.chips}>
                      {(column.options ?? []).map((option) => (
                        <Chip
                          key={option.value}
                          label={option.label}
                          tone={row[column.key] === option.value ? 'ink' : 'outline'}
                          {...(disabled
                            ? {}
                            : {
                                onPress: () => {
                                  setCell(index, column.key, option.value);
                                },
                              })}
                          testID={`qf-exercice-cell-${String(index)}-${column.key}-${option.value}`}
                        />
                      ))}
                    </View>
                  </View>
                ) : (
                  <Field
                    key={column.key}
                    label={`${column.label} · ${t.tableRow(index + 1)}`}
                    value={row[column.key] ?? ''}
                    onChangeText={(value) => {
                      setCell(index, column.key, value);
                    }}
                    {...(column.type === 'number' ? { keyboardType: 'decimal-pad' as const } : {})}
                    editable={!disabled}
                    testID={`qf-exercice-cell-${String(index)}-${column.key}`}
                  />
                ),
              )}
            </View>
          ))}

          {disabled || submission.rows.length >= production.maxRows ? null : (
            <Button
              label={t.tableAdd}
              variant="outline"
              size="sm"
              onPress={addRow}
              testID="qf-exercice-add-row"
            />
          )}
        </View>
      ) : null}

      {instruction.explanationPrompt === null ? null : (
        <Field
          label={instruction.explanationPrompt}
          value={submission.explanation ?? ''}
          onChangeText={setExplanation}
          multiline
          editable={!disabled}
          testID="qf-exercice-explanation"
        />
      )}

      <Text variant="caption" tone="muted">
        {ex.scaleHint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.md },
  block: { gap: theme.spacing.md },
  rowCard: {
    gap: theme.spacing.sm,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.md,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  remove: {
    width: theme.minTouchTarget.width,
    height: theme.minTouchTarget.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBlock: { gap: theme.spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
});