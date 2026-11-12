import { loadSpec106Demo, type Spec106Data } from '../../app/%5Fdev/sdd/spec-106-data';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec106;

function scoreLabel(value: number | null): string {
  return value === null ? t.missing : String(value);
}

function Types({ data }: Readonly<{ data: Spec106Data }>) {
  return (
    <DemoSection testId="spec-106-types" title={t.types.title}>
      <p className="mb-3 text-sm">{t.types.intro}</p>
      <div
        role="region"
        aria-label={t.types.region}
        tabIndex={0}
        className="overflow-x-auto rounded-[8px] border border-solid border-border"
      >
        <table className="w-full min-w-[32rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.types.type}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.types.purpose}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.types.status}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.types.currentVersion}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.types.map((brick) => (
              <tr key={brick.type} data-testid="type-row" className="border-t border-border">
                <td className="px-3 py-2 font-mono text-sm" data-testid="type-name">
                  {brick.type}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="type-purpose">
                  {brick.purpose}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="type-status">
                  {brick.status}
                </td>
                <td className="px-3 py-2 font-mono text-sm">{brick.currentVersion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoSection>
  );
}

function Activity({ data }: Readonly<{ data: Spec106Data }>) {
  return (
    <DemoSection testId="spec-106-activity" title={t.activity.title}>
      <p className="mb-3 text-sm">{t.activity.intro}</p>
      <dl className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <dt>{t.activity.kind}</dt>
        <dd className="font-mono" data-testid="activity-kind">
          {data.activity.kind}
        </dd>
        <dt>{t.activity.status}</dt>
        <dd className="font-mono" data-testid="activity-status">
          {data.activity.status}
        </dd>
      </dl>
      <div
        role="region"
        aria-label={t.activity.region}
        tabIndex={0}
        className="overflow-x-auto rounded-[8px] border border-solid border-border"
      >
        <table className="w-full min-w-[32rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.activity.position}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.activity.brick}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.activity.version}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.activity.available}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.activity.points}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.activity.items.map((item) => (
              <tr
                key={`item-${String(item.position)}`}
                data-testid="activity-item-row"
                className="border-t border-border"
              >
                <td className="px-3 py-2 font-mono text-sm" data-testid="activity-item-position">
                  {item.position}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="activity-item-type">
                  {item.type}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="activity-item-version">
                  {item.version}
                </td>
                <td className="px-3 py-2 font-mono text-sm">{item.availableVersion}</td>
                <td className="px-3 py-2 font-mono text-sm">{item.points ?? t.missing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoSection>
  );
}

function Attempt({ data }: Readonly<{ data: Spec106Data }>) {
  return (
    <DemoSection testId="spec-106-attempt" title={t.attempt.title}>
      <p className="mb-3 text-sm">{t.attempt.intro}</p>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <dt>{t.attempt.number}</dt>
        <dd className="font-mono" data-testid="attempt-number">
          {data.attempt.attemptNo}
        </dd>
        <dt>{t.attempt.status}</dt>
        <dd className="font-mono" data-testid="attempt-status">
          {data.attempt.status}
        </dd>
        <dt>{t.attempt.score}</dt>
        <dd className="font-mono" data-testid="attempt-score">
          {scoreLabel(data.attempt.score)}
        </dd>
        <dt>{t.attempt.passed}</dt>
        <dd className="font-mono" data-testid="attempt-passed">
          {data.attempt.passed === true ? t.yes : t.no}
        </dd>
        <dt>{t.attempt.answers}</dt>
        <dd className="font-mono" data-testid="attempt-answers">
          {data.attempt.answers}
        </dd>
      </dl>
    </DemoSection>
  );
}

function Answers({ data }: Readonly<{ data: Spec106Data }>) {
  return (
    <DemoSection testId="spec-106-answers" title={t.answers.title}>
      <p className="mb-3 text-sm">{t.answers.intro}</p>
      <div
        role="region"
        aria-label={t.answers.region}
        tabIndex={0}
        className="overflow-x-auto rounded-[8px] border border-solid border-border"
      >
        <table className="w-full min-w-[36rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.answers.position}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.answers.brick}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.answers.version}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.answers.frozen}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.answers.score}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.answers.grader}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.answers.map((answer) => (
              <tr
                key={`answer-${String(answer.position)}`}
                data-testid="answer-row"
                className="border-t border-border"
              >
                <td className="px-3 py-2 font-mono text-sm" data-testid="answer-position">
                  {answer.position}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="answer-type">
                  {answer.type}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="answer-version">
                  {answer.version}
                </td>
                <td className="px-3 py-2 text-sm" data-testid="answer-frozen">
                  {answer.version < answer.currentVersion
                    ? t.answers.frozenOn(answer.version, answer.currentVersion)
                    : t.answers.upToDate}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="answer-score">
                  {`${scoreLabel(answer.score)} / ${scoreLabel(answer.maxScore)}`}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="answer-grader">
                  {answer.gradedBy ?? t.missing}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoSection>
  );
}

export default async function Spec106Demo() {
  let data: Spec106Data;
  try {
    data = await loadSpec106Demo();
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
      <Types data={data} />
      <Activity data={data} />
      <Attempt data={data} />
      <Answers data={data} />
    </>
  );
}
