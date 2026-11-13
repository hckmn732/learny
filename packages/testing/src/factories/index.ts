// Factories of the P1 domains (SPEC-115 EF-6). Every factory runs on a `DbTx`, returned IDs are
// the created rows, and a caller normally wraps it in `withRollback` from `@learny/db/testing`.
export * from './attempt';
export * from './brick';
export * from './course';
export * from './formation';
export * from './group';
export * from './helpers';
export * from './module';
export * from './notion';
export * from './notion-state';
export * from './notification';
export * from './quiz';
export * from './resource';
export * from './schedule-slot';
export * from './user';
