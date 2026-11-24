// SPEC-4003 — native document selector stub.
module.exports = {
  getDocumentAsync: () => Promise.resolve({ canceled: true, assets: null }),
};
