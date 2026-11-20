'use client';

import { useCallback, useRef, useState } from 'react';

import { api } from '@learny/api-client';
import { AI_TASKS } from '@learny/config';
import type { AiConnectionReport, AiCredentialProvider, TaskModelDto } from '@learny/contracts';

export const QUALIFICATION_TIMEOUT_MS = 120_000;

export type QualificationStatus =
  'untested' | 'testing' | 'qualified' | 'refused' | 'bricks' | 'timeout';

export interface CredentialQualificationOptions {
  provider: AiCredentialProvider;
  apiKey: string;
  baseUrl: string;
  model?: string;
  recommendedModels?: readonly string[];
  onKeyAccepted: () => void;
}

/**
 * SPEC-602 EF-6, EF-8, ET-8 — creates the key once, verifies one chat connection and assigns it to
 * the five tasks. The key only travels to `POST /me/ai/credentials`; it is cleared from the field as
 * soon as the identifier exists. A second click while a test runs is ignored.
 */
export function useCredentialQualification(options: CredentialQualificationOptions) {
  const [status, setStatus] = useState<QualificationStatus>('untested');
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [report, setReport] = useState<AiConnectionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);
  const running = useRef(false);

  const reset = useCallback(() => {
    epoch.current += 1;
    running.current = false;
    setStatus('untested');
    setCredentialId(null);
    setModelId(null);
    setReport(null);
    setError(null);
  }, []);

  const model = options.model?.trim() || options.recommendedModels?.[0] || '';

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
        if (created.connectionStatus !== 'connected') {
          setStatus('refused');
          return;
        }
        setStatus('qualified');
        return;
      } else if (status === 'timeout') {
        // A retry can reuse a connection already persisted by the server.
        const list = await api.meAiCredentialsList({});
        const stored = list.items.find((item) => item.id === id);
        if (stored?.connectionStatus === 'connected') {
          setStatus('qualified');
          return;
        }
      }
    } catch {
      if (current === epoch.current) setStatus('refused');
    } finally {
      running.current = false;
    }
  }, [credentialId, model, modelId, options, status]);

  return { status, error, credentialId, modelId, report, test, assignAll, reset, setError };
}

export type TaskModelAssignment = TaskModelDto;
