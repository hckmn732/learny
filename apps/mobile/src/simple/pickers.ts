// Sélecteurs natifs du dépôt (SPEC-4003 EF-2, ET-3, CL-1).
//
// `expo-document-picker` for files (multiple, cache copy so the upload task can read the URI),
// `expo-image-picker` for the pages (camera or library, multiple). A refused permission is
// returned, never thrown: the deposit screen shows the explanation and the link to Settings while
// the other buttons stay usable (CL-1).
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { DOCUMENT_PICKER_TYPES, simpleMimeOf } from './mime';
import type { UploadTask } from './upload-queue';
import { fileTask } from './use-simple';

export type PickOutcome =
  | { readonly kind: 'picked'; readonly tasks: readonly UploadTask[] }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'permission'; readonly source: 'camera' | 'library' };

function pickerName(asset: DocumentPicker.DocumentPickerAsset): string {
  return asset.name.trim() === '' ? 'Document' : asset.name;
}

/** Sélecteur de documents, plusieurs fichiers (PDF, DOCX, texte, images). */
export async function pickDocuments(): Promise<PickOutcome> {
  const result = await DocumentPicker.getDocumentAsync({
    type: DOCUMENT_PICKER_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return { kind: 'cancelled' };
  const tasks = result.assets
    .map((asset) => {
      const name = pickerName(asset);
      const mime = asset.mimeType ?? simpleMimeOf(name);
      if (mime === null) return null;
      return fileTask({
        uri: asset.uri,
        name,
        mime,
        sizeBytes: asset.size ?? 0,
        role: 'course',
      });
    })
    .filter((task): task is UploadTask => task !== null);
  return { kind: 'picked', tasks };
}

/** Photos de pages : appareil photo ou galerie, plusieurs images. */
export async function pickPagePhotos(source: 'camera' | 'library'): Promise<PickOutcome> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { kind: 'permission', source };
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled) return { kind: 'cancelled' };
    return { kind: 'picked', tasks: result.assets.map((asset) => imageTask(asset)) };
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
  return { kind: 'picked', tasks: result.assets.map((asset) => imageTask(asset)) };
}

function imageTask(asset: ImagePicker.ImagePickerAsset): UploadTask {
  const fallback = `page-${asset.assetId ?? asset.uri.split('/').pop() ?? 'image'}.jpg`;
  const name = asset.fileName ?? fallback;
  const mime = asset.mimeType ?? simpleMimeOf(name) ?? 'image/jpeg';
  return fileTask({
    uri: asset.uri,
    name,
    mime,
    sizeBytes: asset.fileSize ?? 0,
    role: 'course',
  });
}
