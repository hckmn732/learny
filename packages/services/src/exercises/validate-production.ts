// Pure validation of a practice production (SPEC-613 EF-1, ET-3, CL-1, CL-4; BR-PRA-01).
//
// The instruction is fixed before the attempt: the table columns, their types and the declared
// `sum_equal` controls are code rules, never model-provided JavaScript (ADR-0027). A table with a
// wrongly typed cell or an unbalanced total is refused before any tutor call, with one issue per
// faulty cell so the interface can move the focus to it.
import { evaluateTableChecks, parseFrenchNumber } from '@learny/bricks';
import {
  ExerciseSubmissionSchema,
  type ExerciseInstruction,
  type ExerciseSubmission,
  type ExerciseTableProduction,
} from '@learny/contracts';
import { err, ok, type Result } from '@learny/core';

export interface ProductionIssue {
  path: string;
  message: string;
}

export type ProductionValidation = Result<ExerciseSubmission, ProductionIssue[]>;

function issue(path: string, message: string): ProductionIssue {
  return { path, message };
}

function hasValue(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== '';
}

function validateColumnValue(
  column: {
    key: string;
    label: string;
    type: 'text' | 'number' | 'select';
    options?: { value: string }[] | undefined;
  },
  value: string | undefined,
  path: string,
): ProductionIssue[] {
  if (!hasValue(value)) return [issue(path, `${column.label} est obligatoire.`)];
  if (column.type === 'number') {
    const parsed = parseFrenchNumber(value ?? '');
    if (parsed === null) return [issue(path, `${column.label} doit être un nombre.`)];
    return [];
  }
  if (column.type === 'select') {
    const allowed = new Set((column.options ?? []).map((option) => option.value));
    if (!allowed.has(value ?? '')) {
      return [issue(path, `${column.label} doit être choisi dans la liste proposée.`)];
    }
  }
  return [];
}

function validateTable(
  production: ExerciseTableProduction,
  submission: Extract<ExerciseSubmission, { kind: 'table' }>,
): ProductionIssue[] {
  const issues: ProductionIssue[] = [];
  for (const field of production.fields) {
    issues.push(...validateColumnValue(field, submission.fields[field.key], `fields.${field.key}`));
  }

  if (submission.rows.length < production.minRows) {
    issues.push(
      issue('rows', `Le tableau doit contenir au moins ${String(production.minRows)} ligne(s).`),
    );
  }
  if (submission.rows.length > production.maxRows) {
    issues.push(
      issue('rows', `Le tableau doit contenir au plus ${String(production.maxRows)} ligne(s).`),
    );
  }

  submission.rows.forEach((row, index) => {
    for (const column of production.columns) {
      issues.push(
        ...validateColumnValue(column, row[column.key], `rows.${String(index)}.${column.key}`),
      );
    }
  });

  if (issues.length === 0 && production.checks.length > 0) {
    const results = evaluateTableChecks(production, {
      fields: submission.fields,
      rows: submission.rows,
    });
    for (const result of results) {
      if (result.state !== 'balanced') {
        issues.push(issue('rows', result.label));
      }
    }
  }
  return issues;
}

function validateExplanation(
  instruction: ExerciseInstruction,
  explanation: string | undefined,
): ProductionIssue[] {
  if (instruction.explanationPrompt === null) return [];
  const text = (explanation ?? '').trim();
  if (text.length < 10) {
    return [issue('explanation', 'Expliquez votre démarche en une ou deux phrases.')];
  }
  return [];
}

/** Validates a parsed submission against the immutable instruction (EF-1, ET-3, CL-4). */
export function validateProduction(
  instruction: ExerciseInstruction,
  input: unknown,
): ProductionValidation {
  const parsed = ExerciseSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      parsed.error.issues.map((entry) =>
        issue(entry.path.length > 0 ? entry.path.join('.') : 'submission', entry.message),
      ),
    );
  }
  const submission = parsed.data;
  if (submission.kind !== instruction.production.kind) {
    return err([issue('kind', 'La production ne correspond pas au type attendu par l’exercice.')]);
  }

  const issues: ProductionIssue[] = [];
  switch (instruction.production.kind) {
    case 'text': {
      const length = submission.kind === 'text' ? submission.text.trim().length : 0;
      if (length < instruction.production.minChars || length > instruction.production.maxChars) {
        issues.push(
          issue(
            'text',
            `La réponse doit contenir entre ${String(instruction.production.minChars)} et ${String(
              instruction.production.maxChars,
            )} caractères.`,
          ),
        );
      }
      break;
    }
    case 'file':
      if (submission.kind !== 'file') issues.push(issue('resourceId', 'Déposez un fichier.'));
      break;
    case 'link':
      if (submission.kind !== 'link') issues.push(issue('url', 'Saisissez un lien HTTPS.'));
      break;
    case 'table':
      if (submission.kind === 'table') {
        issues.push(...validateTable(instruction.production, submission));
      }
      break;
  }

  if (submission.kind !== 'file' && submission.kind !== 'link') {
    issues.push(...validateExplanation(instruction, submission.explanation));
  }

  return issues.length === 0 ? ok(submission) : err(issues);
}
