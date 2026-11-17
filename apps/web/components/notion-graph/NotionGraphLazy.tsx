'use client';

// SPEC-804 ET-5 — la carte des notions (SVG, filtres, recherche) est chargée à la demande.
import dynamic from 'next/dynamic';

export const NotionGraphLazy = dynamic(
  () => import('./NotionGraphExperience').then((module) => module.NotionGraphExperience),
  { ssr: false },
);
