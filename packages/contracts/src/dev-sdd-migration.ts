import { z } from 'zod';

import { defineRoute } from './define-route';

const payload = z.unknown();
const actionBody = z.object({
  action: z.string().optional(),
  id: z.string().optional(),
  task: z.string().optional(),
  scenario: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  reason: z.string().optional(),
  decision: z.string().optional(),
  spend: z.string().optional(),
  brickId: z.string().optional(),
});

function demo(name: string, spec: string) {
  return defineRoute({
    id: `dev.sdd.${spec.toLowerCase()}.demo`,
    method: 'GET',
    path: `/api/v1/dev/sdd/${spec}/demo`,
    auth: 'public',
    output: payload,
    successStatus: 200,
    rateLimit: 'none',
    summary: `Démonstration ${spec} (${name}).`,
    errors: ['NOT_FOUND'],
  });
}

function action(name: string, spec: string, idempotent = true) {
  return defineRoute({
    id: `dev.sdd.${spec.toLowerCase()}.${name}`,
    method: 'POST',
    path: `/api/v1/dev/sdd/${spec}/${name}`,
    auth: 'public',
    body: actionBody,
    output: payload,
    successStatus: 200,
    rateLimit: 'none',
    ...(idempotent ? { requiresIdempotencyKey: true as const } : {}),
    summary: `Action ${name} de la démonstration ${spec}.`,
    errors: ['NOT_FOUND', 'VALIDATION_FAILED', 'IDEMPOTENCY_IN_PROGRESS'],
  });
}

export const devSddSpec007Demo = demo('jobs durables', 'SPEC-007');
export const devSddSpec009Demo = demo('configuration', 'SPEC-009');
export const devSddSpec1004Demo = demo('couverture des routes', 'SPEC-1004');
export const devSddSpec101Demo = demo('schéma de base', 'SPEC-101');
export const devSddSpec102Demo = demo('identité', 'SPEC-102');
export const devSddSpec103Demo = demo('formations', 'SPEC-103');
export const devSddSpec104Demo = demo('ressources', 'SPEC-104');
export const devSddSpec105Demo = demo('cours', 'SPEC-105');
export const devSddSpec106Demo = demo('briques et activités', 'SPEC-106');
export const devSddSpec107Demo = demo('mémorisation', 'SPEC-107');
export const devSddSpec108Demo = demo('agenda', 'SPEC-108');
export const devSddSpec109Demo = demo('notifications', 'SPEC-109');
export const devSddSpec110Demo = demo('IA et facturation', 'SPEC-110');
export const devSddSpec111Demo = demo('formations partagées', 'SPEC-111');
export const devSddSpec112Demo = demo('recherche et droits', 'SPEC-112');
export const devSddSpec113Demo = demo('RLS', 'SPEC-113');
export const devSddSpec114Demo = demo('stockage', 'SPEC-114');
export const devSddSpec115Demo = demo('données de démonstration', 'SPEC-115');
export const devSddSpec202Demo = demo('authentification', 'SPEC-202');
export const devSddSpec411Demo = demo('moteur pédagogique', 'SPEC-411');
export const devSddSpec501Demo = demo('briques', 'SPEC-501');
export const devSddSpec504Demo = demo('modèles IA', 'SPEC-504');
export const devSddSpec505Demo = demo('clés personnelles', 'SPEC-505');
export const devSddSpec508Demo = demo('tuteur', 'SPEC-508');
export const devSddSpec509Demo = demo('ingestion documents', 'SPEC-509');
export const devSddSpec510Demo = demo('ingestion web', 'SPEC-510');
export const devSddSpec511Demo = demo('retrieval', 'SPEC-511');
export const devSddSpec512Demo = demo('recherche web', 'SPEC-512');
export const devSddSpec711Demo = demo('automatismes', 'SPEC-711');
export const devSddSpec1203Demo = demo('frontière web', 'SPEC-1203');
export const devSddSpec1301Demo = demo('client natif', 'SPEC-1301');

export const devSddSpec102Create = action('create', 'SPEC-102');
export const devSddSpec102Remove = action('remove', 'SPEC-102');
export const devSddSpec501Create = action('create', 'SPEC-501');
export const devSddSpec501Report = action('report', 'SPEC-501');
export const devSddSpec501Correct = action('correct', 'SPEC-501');
export const devSddSpec504Call = action('call', 'SPEC-504');
export const devSddSpec505Create = action('create', 'SPEC-505');
export const devSddSpec505Delete = action('delete', 'SPEC-505');
export const devSddSpec506Run = action('run', 'SPEC-506');
export const devSddSpec512Suggest = action('suggest', 'SPEC-512');
export const devSddSpec512Decide = action('decide', 'SPEC-512');
export const devSddStripeCheckout = action('session', 'stripe');

export const devSddMigrationRoutes = {
  devSddSpec007Demo,
  devSddSpec009Demo,
  devSddSpec1004Demo,
  devSddSpec101Demo,
  devSddSpec102Demo,
  devSddSpec103Demo,
  devSddSpec104Demo,
  devSddSpec105Demo,
  devSddSpec106Demo,
  devSddSpec107Demo,
  devSddSpec108Demo,
  devSddSpec109Demo,
  devSddSpec110Demo,
  devSddSpec111Demo,
  devSddSpec112Demo,
  devSddSpec113Demo,
  devSddSpec114Demo,
  devSddSpec115Demo,
  devSddSpec202Demo,
  devSddSpec411Demo,
  devSddSpec501Demo,
  devSddSpec504Demo,
  devSddSpec505Demo,
  devSddSpec508Demo,
  devSddSpec509Demo,
  devSddSpec510Demo,
  devSddSpec511Demo,
  devSddSpec512Demo,
  devSddSpec711Demo,
  devSddSpec1203Demo,
  devSddSpec1301Demo,
  devSddSpec102Create,
  devSddSpec102Remove,
  devSddSpec501Create,
  devSddSpec501Report,
  devSddSpec501Correct,
  devSddSpec504Call,
  devSddSpec505Create,
  devSddSpec505Delete,
  devSddSpec506Run,
  devSddSpec512Suggest,
  devSddSpec512Decide,
  devSddStripeCheckout,
} as const;
