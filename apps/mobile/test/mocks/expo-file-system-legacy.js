// SPEC-4003 — the upload queue calls the legacy FileSystem API; Jest has no native engine.
module.exports = {
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  FileSystemSessionType: { BACKGROUND: 0, FOREGROUND: 1 },
  createUploadTask: () => ({
    uploadAsync: () => Promise.resolve({ status: 200, body: '' }),
  }),
  uploadAsync: () => Promise.resolve({ status: 200, body: '' }),
  cacheDirectory: 'file:///cache/',
};
