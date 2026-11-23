import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mockup references of `design/references` (SPEC-005), read from disk and inlined as a data URL:
// the visual conformity tests compare a real screen with its mockup without any /_dev route
// (ADR-2041 retires the demonstration pages and their reference route).
const REFERENCES = fileURLToPath(new URL('../../../../design/references/', import.meta.url));
const PNG_NAME = /^SCR-\d{2}-[a-z0-9-]+-(?:desktop|mobile)\.png$/u;

export function mockupReference(file: string): string {
  if (!PNG_NAME.test(file)) throw new Error(`référence de maquette invalide : ${file}`);
  const body = fs.readFileSync(path.join(REFERENCES, file));
  return `data:image/png;base64,${body.toString('base64')}`;
}
