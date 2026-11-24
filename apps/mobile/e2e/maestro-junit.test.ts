// Tests du lecteur JUnit de la campagne Maestro (ADR-3015 § 3).
//
// Le rapport est la seule source du statut des flux : ces tests fixent le contrat (nom du cas =
// `name:` du flux, statut porté par l'attribut `status` de Maestro 2.12, rapport vide = échec
// explicite et non « zéro échec »).
import { describe, expect, it } from 'vitest';

import { junitProblem, missingFlows, parseJunit, testcaseNames } from './maestro-junit.mjs';

const MAESTRO_JUNIT = `<?xml version='1.0' encoding='UTF-8'?>
<testsuites>
  <testsuite name="Test Suite" device="agent37" tests="2" failures="1">
    <testcase id="SPEC-3003 session" name="SPEC-3003 session" classname="SPEC-3003 session" time="26.837" timestamp="2026-11-22T20:32:46" status="ERROR">
      <properties>
        <property name="tags" value="SPEC-3003, visual"/>
      </properties>
      <failure>Assertion is false: ".*Hors ligne.*" is visible</failure>
    </testcase>
    <testcase id="SPEC-3001 demo" name="SPEC-3001 demo" classname="SPEC-3001 demo" time="4.5" status="PASSED"/>
  </testsuite>
</testsuites>`;

describe('[SPEC-3001] lecture du rapport JUnit de Maestro', () => {
  it('rend un cas par flux, dans l’ordre du fichier, avec durée et statut', () => {
    const cases = parseJunit(MAESTRO_JUNIT);

    expect(cases.map((entry) => entry.name)).toEqual(['SPEC-3003 session', 'SPEC-3001 demo']);
    expect(cases[0]?.time).toBeCloseTo(26.837, 3);
    expect(cases[0]?.status).toBe('failed');
    expect(cases[1]?.status).toBe('passed');
  });

  it('lit le statut d’échec porté par l’attribut status, même sans <failure>', () => {
    const xml = `<testsuites><testsuite><testcase name="A" time="2" status="FAILED"/></testsuite></testsuites>`;

    expect(parseJunit(xml)[0]?.status).toBe('failed');
  });

  it('déséchappe les entités XML du message d’assertion', () => {
    const xml = `<testsuites><testsuite><testcase name="A"><failure message="&quot;Alex&quot; &amp; 13:20"/></testcase></testsuite></testsuites>`;

    expect(parseJunit(xml)[0]?.message).toBe('"Alex" & 13:20');
  });

  it('apparie les flux sur le name exact, jamais sur le nom de fichier', () => {
    const flows = [{ name: 'SPEC-3003 session', file: 'SPEC-3003-session.yaml' }];

    expect(testcaseNames(MAESTRO_JUNIT)).toEqual(['SPEC-3003 session', 'SPEC-3001 demo']);
    expect(missingFlows(MAESTRO_JUNIT, flows)).toEqual([]);
    expect(
      missingFlows(MAESTRO_JUNIT, [{ name: 'SPEC-3003-session.yaml', file: 'x.yaml' }]),
    ).toEqual(['SPEC-3003-session.yaml']);
  });

  it('signale un rapport absent, vide ou sans cas nommé', () => {
    expect(junitProblem('')).toBe('rapport JUnit absent ou vide');
    expect(junitProblem('   ')).toBe('rapport JUnit absent ou vide');
    expect(junitProblem('<testsuites></testsuites>')).toBe(
      'rapport JUnit sans <testcase> (campagne interrompue ?)',
    );
    expect(
      junitProblem("<testsuites><testsuite><testcase name=''/></testsuite></testsuites>"),
    ).toBe('rapport JUnit sans cas nommé');
    expect(junitProblem(MAESTRO_JUNIT)).toBeNull();
  });

  it('ne fabrique aucun cas : un rapport tronqué ne rend que ce qu’il contient', () => {
    const truncated = `<testsuites><testsuite><testcase name="A" time="1"></testcase>`;

    expect(parseJunit(truncated).map((entry) => entry.name)).toEqual(['A']);
    expect(parseJunit('pas du xml du tout')).toEqual([]);
  });
});
