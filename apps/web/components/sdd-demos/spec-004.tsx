import { clock } from '@learny/core';
import { colors } from '@learny/ui/tokens';

import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec004;
const TIME_ZONE = 'Europe/Paris';

// "2026-11-11 13:20": the sv-SE locale formats dates as ISO-like year-month-day.
const formatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const PROJECTS = [
  { name: 'desktop', viewport: '1440 × 900', usage: t.projects.desktop },
  { name: 'mobile', viewport: '390 × 844', usage: t.projects.mobile },
  { name: 'cross-browser', viewport: '1440 × 900', usage: t.projects.crossBrowser },
] as const;

// Static 8×4 illustration: the reference, a capture with three altered cells, and their diff.
const GRID = Array.from({ length: 32 }, (_, i) => i);
const ALTERED = new Set([9, 10, 18]);

function Grid({ kind }: Readonly<{ kind: 'reference' | 'actual' | 'diff' }>) {
  return (
    <div className="grid w-[160px] grid-cols-8 gap-px border border-solid border-border bg-surface-muted">
      {GRID.map((i) => {
        const altered = ALTERED.has(i);
        let color = 'bg-white';
        if (kind === 'actual' && altered) color = 'bg-ink';
        if (kind === 'diff') color = altered ? 'bg-danger' : 'bg-canvas';
        return <span key={i} className={`block h-[19px] ${color}`} />;
      })}
    </div>
  );
}

export default function Spec004Demo() {
  const now = clock.now();
  return (
    <>
      <DemoSection testId="spec-004-clock" title={t.clock.title}>
        <p>
          {`${t.clock.label} : `}
          <time
            data-testid="spec-004-server-now"
            dateTime={now.toISOString()}
            className="font-mono"
          >{`${formatter.format(now)} ${TIME_ZONE}`}</time>
        </p>
        <p className="mt-2 font-mono text-sm">{`${t.clock.server} = ${process.env.CLOCK_FIXED_AT ?? ''}`}</p>
      </DemoSection>

      <DemoSection testId="spec-004-projects" title={t.projects.title}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-4">
                {t.projects.project}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t.projects.viewport}
              </th>
              <th scope="col" className="py-2">
                {t.projects.usage}
              </th>
            </tr>
          </thead>
          <tbody>
            {PROJECTS.map((p) => (
              <tr key={p.name}>
                <td className="py-2 pr-4 font-mono">{p.name}</td>
                <td className="py-2 pr-4">{p.viewport}</td>
                <td className="py-2">{p.usage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DemoSection>

      <DemoSection testId="spec-004-tokens" title={t.tokens.title}>
        <div
          data-testid="spec-004-token-sample"
          className="rounded-[16px] border border-solid border-border bg-white p-4 text-ink"
        >
          <p className="font-semibold">{t.tokens.sample}</p>
          <ul className="mt-2 text-sm">
            <li>{`${t.tokens.text} : ${colors.ink}`}</li>
            <li>{`${t.tokens.border} : ${colors.border}`}</li>
            <li>{`${t.tokens.radius} : 16px`}</li>
          </ul>
        </div>
      </DemoSection>

      <DemoSection testId="spec-004-diff" title={t.diff.title}>
        <p className="text-sm font-semibold">{t.diff.example}</p>
        <div className="mt-4 flex flex-wrap gap-6">
          {(['reference', 'actual', 'diff'] as const).map((kind) => (
            <figure key={kind}>
              <Grid kind={kind} />
              <figcaption className="mt-2 text-sm">{t.diff[kind]}</figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-4 text-sm">{t.diff.thresholds}</p>
      </DemoSection>

      <DemoSection testId="spec-004-artifacts" title={t.artifacts.title}>
        <p>{t.artifacts.intro}</p>
        <ul className="mt-2 list-disc pl-6 font-mono text-sm">
          {t.artifacts.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </DemoSection>
    </>
  );
}
