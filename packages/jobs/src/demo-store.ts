// Storage port of the SDD demonstration job. The memory adapter is a test/demo adapter only:
// it is not a product store (SPEC-007 §15); a database adapter can replace it after SPEC-101.
export interface DemoRecord {
  runId: string;
  value: number;
  doubledValue: number;
  persistedAt: string;
}

export interface DemoResultStore {
  find(runId: string): Promise<DemoRecord | undefined>;
  insert(record: DemoRecord): Promise<void>;
}

export interface MemoryDemoStore extends DemoResultStore {
  readonly writes: number;
  clear(): void;
}

export function createMemoryDemoStore(): MemoryDemoStore {
  const records = new Map<string, DemoRecord>();
  let writes = 0;
  return {
    get writes() {
      return writes;
    },
    find(runId) {
      return Promise.resolve(records.get(runId));
    },
    insert(record) {
      writes += 1;
      records.set(record.runId, { ...record });
      return Promise.resolve();
    },
    clear() {
      records.clear();
      writes = 0;
    },
  };
}
