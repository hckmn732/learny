import type { ComponentType } from 'react';

export interface SddDemo {
  title: string;
  titleTestId?: string;
  load: () => Promise<{ default: ComponentType }>;
}

export const sddDemos: Record<string, SddDemo> = {
  'SPEC-001': {
    title: 'Monorepo, application web minimale et socle de tests',
    load: () => import('../../../components/sdd-demos/spec-001'),
  },
  'SPEC-002': {
    title: 'Hooks Git, conventions de commit et protection des secrets',
    load: () => import('../../../components/sdd-demos/spec-002'),
  },
  'SPEC-004': {
    title: 'Socle de tests et preuves',
    load: () => import('../../../components/sdd-demos/spec-004'),
  },
  'SPEC-005': {
    title: 'Références visuelles',
    load: () => import('../../../components/sdd-demos/spec-005'),
  },
  'SPEC-006': {
    title: 'Application web : configuration de base, santé et pages de démonstration',
    load: () => import('../../../components/sdd-demos/spec-006'),
  },
  'SPEC-007': {
    title: 'Jobs durables',
    load: () => import('../../../components/sdd-demos/spec-007'),
  },
  'SPEC-008': {
    title: 'Environnement local',
    load: () => import('../../../components/sdd-demos/spec-008'),
  },
  'SPEC-101': {
    title: 'SPEC-101 · Paquet db',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-101'),
  },
  'SPEC-102': {
    title: 'SPEC-102 · Identité et préférences',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-102'),
  },
  'SPEC-009': {
    title: 'Configuration',
    load: () => import('../../../components/sdd-demos/spec-009'),
  },
  'SPEC-010': {
    title: 'Observabilité',
    load: () => import('../../../components/sdd-demos/spec-010'),
  },
  'SPEC-011': {
    title: 'Intégration continue',
    load: () => import('../../../components/sdd-demos/spec-011'),
  },
  'SPEC-012': {
    title: 'Auto-hébergement',
    load: () => import('../../../components/sdd-demos/spec-012'),
  },
  'SPEC-013': {
    title: 'Déploiement géré',
    load: () => import('../../../components/sdd-demos/spec-013'),
  },
};
