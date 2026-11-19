// Transition (SPEC-1002 EF-2, ADR-1007): the typed client of /api/v1 now lives in
// @learny/api-client; this module only re-exports it and will be removed by SPEC-1302. The
// default client IS the web configuration: relative base `/api/v1`, session cookie through
// `credentials: 'same-origin'`, no extra header, no 401 replay (CL-3 note: unused by the web).
export * from '@learny/api-client';
