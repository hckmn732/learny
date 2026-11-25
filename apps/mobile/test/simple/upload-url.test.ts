// [SPEC-4003] URL d'envoi binaire du dépôt : seule une URL signée locale prend l'hôte de l'API.
import { rewriteUploadHost } from '../../src/simple/upload-transport';

const SIGNED_PATH = '/storage/v1/object/upload/sign/resources/u/r/cours.pdf?token=abc';

describe('[SPEC-4003] URL d’envoi du dépôt', () => {
  it('garde l’URL publique du stockage d’un environnement déployé', () => {
    const signed = `https://api-qa.example.test${SIGNED_PATH}`;
    expect(rewriteUploadHost(signed, 'https://qa.example.test')).toBe(signed);
  });

  it('remplace l’hôte local par celui de l’API sur l’émulateur', () => {
    expect(rewriteUploadHost(`http://127.0.0.1:54321${SIGNED_PATH}`, 'http://10.0.2.2:3001')).toBe(
      `http://10.0.2.2:54321${SIGNED_PATH}`,
    );
  });

  it('ne touche à rien quand l’API elle-même est locale', () => {
    const signed = `http://127.0.0.1:54321${SIGNED_PATH}`;
    expect(rewriteUploadHost(signed, 'http://localhost:3001')).toBe(signed);
  });
});
