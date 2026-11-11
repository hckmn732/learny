// The single registry of Inngest functions, served by apps/web and apps/worker (EF-1).
import type { InngestFunction } from 'inngest';

export const functions: InngestFunction.Any[] = [];
