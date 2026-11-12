// Server actions of the SPEC-102 demonstration page (ADR-0049). They only insert or delete the
// explicitly named demo account; the product itself never calls them.
'use server';

import { revalidatePath } from 'next/cache';

import { ensureDemoUser, removeDemoUser } from './spec-102-data';

const PAGE = '/_dev/sdd/SPEC-102';

export async function createDemoUser(): Promise<void> {
  await ensureDemoUser();
  revalidatePath(PAGE);
}

export async function cleanupDemoUser(): Promise<void> {
  await removeDemoUser();
  revalidatePath(PAGE);
}
