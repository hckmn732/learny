// Public surface of the ZIP layout used by SPEC-211. The pure helpers live in `@learny/jobs` so that
// the export job (which cannot import the service package) and this package share one implementation.
export {
  ARCHIVE_CONVERSATIONS,
  ARCHIVE_README,
  ARCHIVE_RESULTS,
  ARCHIVE_SETTINGS,
  archiveSlug,
  buildArchiveEntries,
  buildSettingsJson,
  formatLongDate,
  formatSizeLabel,
  moduleFolder,
  normalizeArchiveName,
  reserveEntryName,
  reserveFolderName,
} from '@learny/jobs';
export type {
  ArchiveApport,
  ArchiveEntry,
  ArchiveFormation,
  ArchiveModel,
  ArchiveModule,
  SettingsInput,
} from '@learny/jobs';
