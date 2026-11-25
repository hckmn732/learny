// Sélecteurs natifs des apports (maquette Apports : « Fichiers », « Photos »).
//
// `expo-document-picker` pour les PDF et les images déjà sur l'appareil, `expo-image-picker` pour
// l'appareil photo et la galerie. Une permission refusée est renvoyée, jamais levée : l'écran
// affiche l'explication et les autres boutons restent utilisables (CL-1).
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

/** A file chosen on the device, ready for the upload route. */
export interface PickedApport {
  readonly uri: string;
  readonly name: string;
  readonly mime: string;
  readonly sizeBytes: number;
}

/** Outcome of a picker: files, a cancellation, or a refused permission. */
export type ApportPick =
  | { readonly kind: 'picked'; readonly files: readonly PickedApport[] }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'permission'; readonly source: 'camera' | 'library' };

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
};

/** Toggles the document selector: PDF and images only (BR-APP-02). */
const DOCUMENT_TYPES: readonly string[] = ['application/pdf', 'image/*'];

/** MIME of a file name, or `null` when the extension is not a document the module accepts. */
export function mimeOf(name: string): string | null {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? null;
}

function nameOf(asset: DocumentPicker.DocumentPickerAsset): string {
  return asset.name.trim() === '' ? 'Document' : asset.name;
}

/** Files and images of the device, several at once. */
export async function pickApportFiles(): Promise<ApportPick> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...DOCUMENT_TYPES],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return { kind: 'cancelled' };
  const files = result.assets
    .map((asset) => {
      const name = nameOf(asset);
      const mime = asset.mimeType ?? mimeOf(name);
      if (mime === null) return null;
      return { uri: asset.uri, name, mime, sizeBytes: asset.size ?? 0 };
    })
    .filter((file): file is PickedApport => file !== null);
  return { kind: 'picked', files };
}

/** Photos from the camera or the gallery (several pages at once from the gallery). */
export async function pickApportPhotos(source: 'camera' | 'library'): Promise<ApportPick> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { kind: 'permission', source };
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled) return { kind: 'cancelled' };
    return { kind: 'picked', files: result.assets.map((asset) => photoOf(asset)) };
  }
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { kind: 'permission', source };
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 10,
    quality: 0.9,
  });
  if (result.canceled) return { kind: 'cancelled' };
  return { kind: 'picked', files: result.assets.map((asset) => photoOf(asset)) };
}

function photoOf(asset: ImagePicker.ImagePickerAsset): PickedApport {
  const fallback = `page-${asset.assetId ?? asset.uri.split('/').pop() ?? 'image'}.jpg`;
  const name = asset.fileName ?? fallback;
  const mime = asset.mimeType ?? mimeOf(name) ?? 'image/jpeg';
  return { uri: asset.uri, name, mime, sizeBytes: asset.fileSize ?? 0 };
}