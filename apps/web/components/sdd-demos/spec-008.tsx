import { readStackStatus } from '../../lib/stack-status';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec008;

export default function Spec008Demo() {
  const stack = readStackStatus();

  if (stack.dockerUnavailable) {
    return (
      <DemoSection testId="spec-008-services" title={t.services.title}>
        <p>{t.unavailable}</p>
      </DemoSection>
    );
  }

  return (
    <>
      <DemoSection testId="spec-008-services" title={t.services.title}>
        {stack.demo ? <p data-testid="spec-008-demo">{t.demo}</p> : null}
        <table className="mt-4 w-full text-left">
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-4">
                {t.services.service}
              </th>
              <th scope="col" className="py-2 pr-4">
                {t.services.state}
              </th>
              <th scope="col" className="py-2">
                {t.services.detail}
              </th>
            </tr>
          </thead>
          <tbody>
            {stack.services.map((service) => (
              <tr key={service.name}>
                <td className="py-2 pr-4 font-mono">{service.name}</td>
                <td className="py-2 pr-4">{service.ok ? t.services.ok : t.services.failed}</td>
                <td className="py-2 font-mono text-sm">{service.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DemoSection>

      <DemoSection testId="spec-008-extensions" title={t.extensions.title}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {stack.extensions.map((extension) => (
            <li
              key={extension.name}
              className="flex items-center justify-between gap-4 rounded-[12px] border border-solid border-[#E7E6E1] px-4 py-2"
            >
              <span className="font-mono">{extension.name}</span>
              <span className="text-sm">
                {extension.ok ? `✅ ${t.extensions.ok}` : `❌ ${t.extensions.missing}`}
                {` · ${t.extensions.required}`}
              </span>
            </li>
          ))}
        </ul>
      </DemoSection>

      <DemoSection testId="spec-008-commands" title={t.commands.title}>
        <p>{t.commands.intro}</p>
        <pre className="mt-3 overflow-x-auto rounded-[12px] bg-[#111113] p-4 text-sm text-white">
          <code>
            {[
              t.commands.start,
              t.commands.check,
              t.commands.stop,
              t.commands.reset,
              t.commands.seed,
            ].join('\n')}
          </code>
        </pre>
      </DemoSection>
    </>
  );
}
