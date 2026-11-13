// Deterministic selection of the model context (SPEC-511 EF-2, EF-3, ET-2; ADR-0056, ADR-0300).
//
// The candidates are first ordered by decreasing cosine score, then by source, position and chunk
// identifier. Duplicates and strongly overlapping passages are removed in that order, so the best
// passage is always the one kept and the result is independent of the input order. Each remaining
// passage is formatted as a `<document>` tag and its complete cost (tags, attributes and separator)
// is reserved before it is added: a passage never fits partially and the budget is never exceeded.
import {
  ContextSelection,
  RETRIEVAL_OVERLAP_THRESHOLD,
  RETRIEVAL_TOKEN_BUDGETS,
  SelectContextInput,
  type RetrievalChunk,
  type RetrievalTask,
} from '@learny/contracts';
import { AppError } from '@learny/core';
import { estimateTokens } from '@learny/llm';

import { formatDocumentChunk } from './format-document';

/** NFKC, lower case and collapsed whitespace: two equivalent passages normalise the same way. */
export function normalizeDocumentText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function shingles(text: string): Set<string> {
  const size = 5;
  if (text.length <= size) return new Set([text]);
  const set = new Set<string>();
  for (let index = 0; index + size <= text.length; index += 1) {
    set.add(text.slice(index, index + size));
  }
  return set;
}

/**
 * EF-2 — share of the smaller passage found in the larger one, measured on normalised 5-grams.
 * 1 means identical (or fully contained), 0 means no common sequence. Used with the 0.8 threshold
 * of ADR-0300: two passages that tell the same thing are kept once.
 */
export function textOverlapRatio(left: string, right: string): number {
  const leftText = normalizeDocumentText(left);
  const rightText = normalizeDocumentText(right);
  if (leftText.length === 0 || rightText.length === 0) return 0;
  if (leftText === rightText) return 1;
  const leftShingles = shingles(leftText);
  const rightShingles = shingles(rightText);
  const [small, large] =
    leftShingles.size <= rightShingles.size
      ? [leftShingles, rightShingles]
      : [rightShingles, leftShingles];
  if (small.size === 0) return 0;
  let common = 0;
  for (const shingle of small) {
    if (large.has(shingle)) common += 1;
  }
  return common / small.size;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** EF-2 — total order: score descending, then source, position and chunk identifier ascending. */
export function compareRetrievalChunks(left: RetrievalChunk, right: RetrievalChunk): number {
  if (left.score !== right.score) return right.score - left.score;
  const source = compareText(left.source, right.source);
  if (source !== 0) return source;
  if (left.position !== right.position) return left.position - right.position;
  return compareText(left.chunkId, right.chunkId);
}

export interface DeduplicatedChunks {
  kept: RetrievalChunk[];
  duplicates: number;
}

/**
 * EF-2, CL-4 — removes a passage when an already kept passage is identical or overlaps it by at
 * least `RETRIEVAL_OVERLAP_THRESHOLD`. The input is not assumed sorted.
 */
export function deduplicateChunks(
  chunks: readonly RetrievalChunk[],
  threshold = RETRIEVAL_OVERLAP_THRESHOLD,
): DeduplicatedChunks {
  const ordered = [...chunks].sort(compareRetrievalChunks);
  const kept: RetrievalChunk[] = [];
  let duplicates = 0;
  for (const candidate of ordered) {
    const duplicate = kept.some(
      (existing) => textOverlapRatio(existing.text, candidate.text) >= threshold,
    );
    if (duplicate) {
      duplicates += 1;
    } else {
      kept.push(candidate);
    }
  }
  return { kept, duplicates };
}

function invalidInput(error: { issues: { path: PropertyKey[]; message: string }[] }): AppError {
  return new AppError('VALIDATION_FAILED', 'Les données de sélection du contexte sont invalides.', {
    errors: error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  });
}

/**
 * ET-2 — sorts, deduplicates and cuts the candidates to `tokenBudget`. When `tokenBudget` is
 * omitted the task budget of docs/architecture/ai.md §3 is used. A passage and its attribution are
 * added together or not at all (CL-3): the returned text is always a concatenation of complete
 * `<document>` tags.
 */
export function selectContext(
  chunks: readonly RetrievalChunk[],
  task: RetrievalTask,
  tokenBudget?: number,
): ContextSelection {
  const parsed = SelectContextInput.safeParse({ chunks: [...chunks], task, tokenBudget });
  if (!parsed.success) throw invalidInput(parsed.error);
  const data = parsed.data;
  const budget = data.tokenBudget ?? RETRIEVAL_TOKEN_BUDGETS[data.task];
  const { kept, duplicates } = deduplicateChunks(data.chunks);

  const selected: RetrievalChunk[] = [];
  const documents: string[] = [];
  let estimatedTokens = 0;
  let omitted = 0;

  for (const chunk of kept) {
    const document = formatDocumentChunk(chunk);
    // The newline between two documents is part of the model context and is reserved too.
    const cost = estimateTokens(document) + (selected.length === 0 ? 0 : 1);
    if (estimatedTokens + cost > budget) {
      omitted += 1;
      continue;
    }
    selected.push(chunk);
    documents.push(document);
    estimatedTokens += cost;
  }

  const reason =
    selected.length > 0 ? null : data.chunks.length === 0 ? 'no_matches' : 'budget_exhausted';
  return ContextSelection.parse({
    task: data.task,
    tokenBudget: budget,
    estimatedTokens,
    reason,
    chunks: selected,
    documents,
    text: documents.join('\n'),
    duplicates,
    omitted,
  });
}
