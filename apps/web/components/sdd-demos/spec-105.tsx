import { loadSpec105Demo, type Spec105Data } from '../../app/%5Fdev/sdd/spec-105-data';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec105;

function Badge({ testId, ok, label }: Readonly<{ testId: string; ok: boolean; label: string }>) {
  return (
    <span
      data-testid={testId}
      className={`inline-block rounded-full px-2 py-0.5 text-sm whitespace-nowrap ${
        ok ? 'bg-green-soft text-green-ink' : 'bg-surface-subtle text-ink'
      }`}
    >
      {label}
    </span>
  );
}

function Versions({ data }: Readonly<{ data: Spec105Data }>) {
  return (
    <DemoSection testId="course-versions" title={t.versions.title}>
      <p className="mb-3 text-sm">{t.versions.intro}</p>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th scope="col" className="py-2 pr-4">
              {t.versions.version}
            </th>
            <th scope="col" className="py-2 pr-4">
              {t.versions.status}
            </th>
            <th scope="col" className="py-2">
              {t.versions.current}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.versions.map((version) => (
            <tr key={`version-${String(version.version)}`} data-testid="version-row">
              <td className="py-2 pr-4 font-mono" data-testid="version-number">
                {version.version}
              </td>
              <td className="py-2 pr-4 font-mono" data-testid="version-status">
                {version.status}
              </td>
              <td className="py-2">
                <Badge
                  testId="version-current"
                  ok={version.isCurrent}
                  label={version.isCurrent ? t.yes : t.no}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DemoSection>
  );
}

function Revision({ data }: Readonly<{ data: Spec105Data }>) {
  const section = data.section;
  return (
    <DemoSection testId="section-revisions" title={t.revisions.title}>
      <p className="mb-3 text-sm">{t.revisions.intro}</p>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <dt>{t.revisions.section}</dt>
        <dd data-testid="revision-section-title" className="font-medium">
          {section.title}
        </dd>
        <dt>{t.revisions.currentVersion}</dt>
        <dd data-testid="section-current-version" className="font-mono">
          {section.currentVersion}
        </dd>
      </dl>
      <table className="mt-4 w-full text-left">
        <thead>
          <tr>
            <th scope="col" className="py-2 pr-4">
              {t.revisions.version}
            </th>
            <th scope="col" className="py-2 pr-4">
              {t.revisions.titleColumn}
            </th>
            <th scope="col" className="py-2">
              {t.revisions.editedBy}
            </th>
          </tr>
        </thead>
        <tbody>
          {section.revisions.map((revision) => (
            <tr key={`revision-${String(revision.version)}`} data-testid="revision-row">
              <td className="py-2 pr-4 font-mono" data-testid="revision-version">
                {revision.version}
              </td>
              <td className="py-2 pr-4">{revision.title}</td>
              <td className="py-2 font-mono" data-testid="revision-edited-by">
                {revision.editedBy}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DemoSection>
  );
}

function Citation({ data }: Readonly<{ data: Spec105Data }>) {
  const citation = data.citation;
  return (
    <DemoSection testId="citation-orphan" title={t.citation.title}>
      <p className="mb-3 text-sm">{t.citation.intro}</p>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <dt>{t.citation.label}</dt>
        <dd data-testid="citation-label">{citation.label}</dd>
        <dt>{t.citation.displayed}</dt>
        <dd data-testid="citation-displayed">{citation.displayed}</dd>
        <dt>{t.citation.chunk}</dt>
        <dd data-testid="citation-chunk" className="font-mono">
          {citation.chunkId === null ? t.citation.nullChunk : citation.chunkId}
        </dd>
        <dt>{t.citation.resource}</dt>
        <dd data-testid="citation-resource" className="font-mono">
          {citation.resourceId === null ? t.citation.nullResource : t.citation.resourceKept}
        </dd>
      </dl>
    </DemoSection>
  );
}

function Conversation({ data }: Readonly<{ data: Spec105Data }>) {
  return (
    <DemoSection testId="conversation" title={t.conversation.title}>
      <p className="mb-3 text-sm">{t.conversation.intro}</p>
      <ol className="space-y-3">
        {data.messages.map((message, index) => (
          <li
            key={`message-${String(index)}`}
            data-testid="message-row"
            className="rounded-[8px] bg-surface-subtle p-3"
          >
            <p className="font-mono text-sm" data-testid="message-role">
              {message.role === 'learner' ? t.conversation.learner : t.conversation.tutor}
            </p>
            <p className="mt-1" data-testid="message-content">
              {message.content}
            </p>
            <p className="mt-2 text-sm" data-testid="message-sources">
              {t.conversation.sources(message.sources)}
            </p>
          </li>
        ))}
      </ol>
    </DemoSection>
  );
}

export default async function Spec105Demo() {
  let data: Spec105Data;
  try {
    data = await loadSpec105Demo();
  } catch {
    return (
      <div className="mt-6">
        <p role="alert">{fr.sdd.spec101.unavailable}</p>
      </div>
    );
  }

  return (
    <>
      <p className="mt-6 text-sm">{t.intro}</p>
      <Versions data={data} />
      <Revision data={data} />
      <Citation data={data} />
      <Conversation data={data} />
    </>
  );
}
