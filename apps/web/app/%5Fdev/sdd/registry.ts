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
  'SPEC-103': {
    title: 'SPEC-103 · Formations, programme et notions',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-103'),
  },
  'SPEC-104': {
    title: 'SPEC-104 · Ressources et passages',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-104'),
  },
  'SPEC-105': {
    title: 'SPEC-105 · Cours et discussions',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-105'),
  },
  'SPEC-106': {
    title: 'SPEC-106 · Briques, activités et tentatives',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-106'),
  },
  'SPEC-107': {
    title: 'SPEC-107 · Mémorisation et lacunes',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-107'),
  },
  'SPEC-108': {
    title: 'SPEC-108 · Agenda, automatismes et série',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-108'),
  },
  'SPEC-109': {
    title: 'SPEC-109 · Schéma notifications',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-109'),
  },
  'SPEC-110': {
    title: 'SPEC-110 · Schéma IA et facturation',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-110'),
  },
  'SPEC-112': {
    title: 'SPEC-112 · Données personnelles, idempotence et recherche',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-112'),
  },
  'SPEC-111': {
    title: 'SPEC-111 · Schéma formations à plusieurs',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-111'),
  },
  'SPEC-113': {
    title: 'SPEC-113 · Politiques RLS et tests d’isolation',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-113'),
  },
  'SPEC-114': {
    title: 'SPEC-114 · Stockage des fichiers',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-114'),
  },
  'SPEC-115': {
    title: 'SPEC-115 · Jeu de données de démonstration et fabriques',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-115'),
  },
  'SPEC-202': {
    title: 'SPEC-202 — Authentification et sessions',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-202'),
  },
  'SPEC-201': {
    title: 'SPEC-201 — Socle API v1 et contrats',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-201'),
  },
  'SPEC-206': {
    title: 'SPEC-206 — Envois privés',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-206'),
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
  'SPEC-207': {
    title: 'Temps et fuseaux',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-207'),
  },
  'SPEC-203': {
    title: 'SPEC-203 — Événements, jobs et crons',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-203'),
  },
  'SPEC-212': {
    title: 'SPEC-212 — Recherche globale (service et API)',
    titleTestId: 'sdd-title',
    load: () => import('../../../components/sdd-demos/spec-212'),
  },
};
