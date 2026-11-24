// Téléversement d'un document du mode simple (SPEC-4002 ET-2).
// Le client de SPEC-607 est réutilisé tel quel : URL signée, `PUT` direct sur Storage, puis
// `resources.finalize`. Seule la progression par fichier est ajoutée, via XMLHttpRequest.

/** Envoie les octets du fichier sur l'URL signée, en annonçant la progression (0 à 100). */
export function putFile(
  url: string,
  file: File,
  mime: string,
  anonKey: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('apikey', anonKey);
    request.setRequestHeader('content-type', mime);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    });
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      // Le corps de Storage nomme le refus (taille, type, quota) : il est affiché tel quel (CL-1).
      const detail = request.responseText.trim();
      reject(new Error(detail === '' ? `PUT ${String(request.status)}` : detail));
    });
    request.addEventListener('error', () => {
      reject(new Error('PUT failed'));
    });
    request.addEventListener('abort', () => {
      reject(new Error('PUT aborted'));
    });
    request.send(file);
  });
}

/**
 * Exécute une tâche sur chaque élément avec au plus `limit` exécutions simultanées (ET-2 : trois
 * téléversements à la fois). Une erreur d'un élément n'interrompt jamais les autres (CL-1).
 */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) return;
      try {
        await task(item);
      } catch {
        // L'erreur est portée par la ligne de l'élément ; les autres continuent.
      }
    }
  });
  await Promise.all(workers);
}

/** Rôle deviné côté client avant la réponse de l'API (elle fait foi dès le premier appel). */
export function guessRole(name: string): 'course' | 'exercises' | 'exam_papers' | 'other' {
  const lower = name.toLowerCase();
  if (/(annale|examen|sujet)/u.test(lower)) return 'exam_papers';
  if (/(td|exercice|corrig)/u.test(lower)) return 'exercises';
  if (/\.(pdf|docx?|txt|md|markdown)$/u.test(lower)) return 'course';
  return 'other';
}

/** Taille lisible d'un fichier, comme la maquette (« 38 Mo »). */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mo = bytes / (1024 * 1024);
    return `${String(mo >= 10 ? Math.round(mo) : Math.round(mo * 10) / 10)} Mo`;
  }
  if (bytes >= 1024) return `${String(Math.round(bytes / 1024))} Ko`;
  return `${String(bytes)} o`;
}
