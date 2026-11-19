// Pure domain logic shared by every client of the API (SPEC-1002 EF-3, ADR-1007): home
// derivations and review game responses. Nothing here reads the clock, the network or Node:
// every function receives its instant, its zone and its identifiers from the caller.
export * from './home/derive';
export * from './review/game-response';
