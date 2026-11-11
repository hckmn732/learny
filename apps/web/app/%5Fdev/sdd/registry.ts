import type { ComponentType } from 'react';

export interface SddDemo {
  title: string;
  load: () => Promise<{ default: ComponentType }>;
}

export const sddDemos: Record<string, SddDemo> = {
  'SPEC-001': {
    title: 'Monorepo, application web minimale et socle de tests',
    load: () => import('../../../components/sdd-demos/spec-001'),
  },
};
