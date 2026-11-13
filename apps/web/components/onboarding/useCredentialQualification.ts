'use client';

import { useCallback, useRef, useState } from 'react';

import { AI_TASKS } from '@learny/config';
import type { AiCredentialProvider, QualificationReport, TaskModelDto } from '@learny/contracts';

import { api } from '../../lib/api-client';

export const QUALIFICATION_TIMEOUT_MS = 120_000;

export type QualificationStatus =
  'untested' | 'testing' | 'qualified' | 'refused' | 'bricks' | 'timeout';

export interface CredentialQualificationOptions {
  provider: AiCredentialProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  recommendedModels: readonly string[];
  onKeyAccepted: () => void;
}

function statusOf(report: QualificationReport): QualificationStatus {
  if (report.status === 'qualified') return 'qualified';
  const failed = report.steps.find((step) => step.status === 'failed');
  return failed?.step === 'connection' ? 'refused' : 'bricks';
}

/**
 * SPEC-602 EF-6, EF-8, ET-8 — creates the key once, qualifies the tested model and assigns it to
 * the five tasks. The key only travels to `POST /me/ai/credentials`; it is cleared from the field as
 * soon as the identifier exists. A second click while a test runs is ignored.
 */
export function useCredentialQualification(options: CredentialQualificationOptions) {
  const [status, setStatus] = useState<QualificationStatus>('untested');
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);
  const running = useRef(false);

  const reset = useCallback(() => {
    epoch.current += 1;
    running.current = false;
    setStatus('untested');
    setCredentialId(null);
    setModelId(null);
    setError(null);
  }, []);

  const model = options.model.trim() || options.recommendedModels[0] || '';

  const assignAll = useCallback(async (credential: string, testedModel: string): Promise<void> => {
    for (const task of AI_TASKS) {
      await api.meAiTaskModelsUpdate({
        body: { task, credentialId: credential, modelId: testedModel },
      });
    }
  }, []);

  const test = useCallback(async (): Promise<void> => {
    if (running.current) return;
    running.current = true;
    const current = ++epoch.current;
    setError(null);
    setStatus('testing');

    const key = options.apiKey.trim();
    if (key === '') {
      running.current = false;
      setStatus('refused');
      return;
    }
    if (model === '') {
      running.current = false;
      setStatus('bricks');
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let id = credentialId;
      let tested = modelId;
      if (id === null || tested === null) {
        const created = await api.meAiCredentialsCreate({
          body: {
            provider: options.provider,
            modelIds: [model],
            apiKey: key,
            ...(options.baseUrl.trim() === '' ? {} : { baseUrl: options.baseUrl.trim() }),
          },
        });
        id = created.id;
        tested = model;
        setCredentialId(id);
        setModelId(tested);
        options.onKeyAccepted();
      } else if (status === 'timeout') {
        // CL-5 — a new click reads the stored status instead of starting a second battery.
        const list = await api.meAiCredentialsList({});
        const stored = list.items.find((item) => item.id === id);
        if (stored?.status === 'qualified') {
          setStatus('qualified');
          return;
        }
      }

      const report = await Promise.race([
        api.meAiCredentialsQualify({ params: { id }, body: { modelId: tested } }),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => {
            resolve(null);
          }, QUALIFICATION_TIMEOUT_MS);
        }),
      ]);
      if (current !== epoch.current) return;
      if (report === null) {
        setStatus('timeout');
        return;
      }
      setStatus(statusOf(report));
    } catch {
      if (current === epoch.current) setStatus('refused');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      running.current = false;
    }
  }, [credentialId, model, modelId, options, status]);

  return { status, error, credentialId, modelId, test, assignAll, reset, setError };
}

export type TaskModelAssignment = TaskModelDto;
