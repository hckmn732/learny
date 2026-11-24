// [SPEC-4003] File de téléversement : deux envois au plus, reprise et réessai.
import { describe, expect, it } from 'vitest';

import {
  UploadRunner,
  allUploaded,
  nextTask,
  parseQueue,
  pendingTasks,
  serializeQueue,
  type UploadTask,
} from './upload-queue';

function task(index: number, overrides: Partial<UploadTask> = {}): UploadTask {
  return {
    id: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
    kind: 'file',
    name: `document-${String(index)}.pdf`,
    mime: 'application/pdf',
    sizeBytes: 100,
    uri: `file:///document-${String(index)}.pdf`,
    role: 'course',
    status: 'pending',
    sentBytes: 0,
    ...overrides,
  };
}

describe('[SPEC-4003] file de téléversement reprenable', () => {
  it('ne lance jamais plus de deux envois à la fois', async () => {
    let active = 0;
    let maxActive = 0;
    const done: string[] = [];
    const runner = new UploadRunner([task(1), task(2), task(3), task(4)], {
      transport: async (item, onProgress) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        onProgress(item.sizeBytes);
        active -= 1;
        done.push(item.id);
        return { resourceId: `resource-${item.id}` };
      },
      onChange: () => undefined,
    });
    await runner.start();
    expect(maxActive).toBe(2);
    expect(done).toHaveLength(4);
    expect(allUploaded(runner.snapshot())).toBe(true);
  });

  it('ne renvoie pas un fichier déjà confirmé après une reprise', async () => {
    const uploaded = task(1, { status: 'uploaded', sentBytes: 100, resourceId: 'resource-1' });
    const pending = task(2);
    const sent: string[] = [];
    const runner = new UploadRunner([uploaded, pending], {
      transport: (item) => {
        sent.push(item.id);
        return Promise.resolve({ resourceId: `resource-${item.id}` });
      },
      onChange: () => undefined,
    });
    await runner.start();
    expect(sent).toEqual([pending.id]);
    expect(allUploaded(runner.snapshot())).toBe(true);
  });

  it('reprend un envoi interrompu et propose un réessai après échec', async () => {
    const restored = parseQueue(
      serializeQueue([task(1, { status: 'uploading', sentBytes: 50 }), task(2)]),
    );
    expect(restored.map((item) => item.status)).toEqual(['pending', 'pending']);
    expect(pendingTasks(restored)).toHaveLength(2);

    let attempts = 0;
    const runner = new UploadRunner([task(1)], {
      transport: () => {
        attempts += 1;
        if (attempts === 1) return Promise.reject(new Error('coupure'));
        return Promise.resolve({ resourceId: 'resource-1' });
      },
      onChange: () => undefined,
    });
    await runner.start();
    expect(runner.snapshot()[0]?.status).toBe('failed');
    runner.retry();
    await runner.start();
    expect(runner.snapshot()[0]?.status).toBe('uploaded');
    expect(attempts).toBe(2);
  });

  it('respecte la limite de parallélisme dans nextTask', () => {
    const items = [task(1, { status: 'uploading' }), task(2, { status: 'uploading' }), task(3)];
    expect(nextTask(items)).toBeNull();
    expect(nextTask(items, 3)?.id).toBe(items[2]?.id);
  });

  it('ignore une file stockée illisible', () => {
    expect(parseQueue('{')).toEqual([]);
    expect(parseQueue(JSON.stringify({ version: 2, items: [task(1)] }))).toEqual([]);
  });
});
