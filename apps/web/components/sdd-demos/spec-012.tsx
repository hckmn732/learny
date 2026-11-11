import { readSelfhostStatus, SELFHOST_CHAINS } from '../../lib/selfhost-status';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec012;
const cell = 'py-2 pr-4 align-top';

export default function Spec012Demo() {
  const stack = readSelfhostStatus();

  return (
    <>
      <DemoSection testId="spec-012-services" title={t.services.title}>
        <p>{t.services.intro}</p>
        {stack.demo ? <p data-testid="spec-012-demo">{t.demo}</p> : null}
        {!stack.demo && !stack.available ? <p>{t.unverified}</p> : null}
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {SELFHOST_CHAINS.map((chain) => (
            <li
              key={chain.source}
              className="rounded-[12px] border border-solid border-[#E7E6E1] px-4 py-2"
            >
              <span className="font-semibold">{chain.source}</span>
              <span aria-hidden="true">{' → '}</span>
              <span>{chain.target}</span>
            </li>
          ))}
        </ul>
        <div
          tabIndex={0}
          role="region"
          aria-label={t.services.title}
          className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full text-left" aria-label={t.services.title}>
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.services.compose}
                </th>
                <th scope="col" className={cell}>
                  {t.services.state}
                </th>
              </tr>
            </thead>
            <tbody>
              {stack.services.map((service) => (
                <tr key={service.name}>
                  <td className={`${cell} font-mono`}>{service.name}</td>
                  <td className={cell}>{service.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stack.volumes.length > 0 ? (
          <p className="mt-3 text-sm">
            {t.volumes} : <span className="break-all font-mono">{stack.volumes.join(', ')}</span>
          </p>
        ) : null}
      </DemoSection>

      <DemoSection testId="spec-012-images" title={t.images.title}>
        <p>{t.images.intro}</p>
        <div
          // Axe (scrollable-region-focusable) : la zone défilante doit être atteignable au clavier.
          tabIndex={0}
          role="region"
          aria-label={t.images.title}
          className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full text-left" aria-label={t.images.title}>
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.images.image}
                </th>
                <th scope="col" className={cell}>
                  {t.images.version}
                </th>
                <th scope="col" className={cell}>
                  {t.images.commit}
                </th>
                <th scope="col" className={cell}>
                  {t.images.state}
                </th>
              </tr>
            </thead>
            <tbody>
              {stack.images.map((image) => (
                <tr key={image.name}>
                  <td className={`${cell} font-mono`}>{image.name}</td>
                  <td className={`${cell} font-mono`}>{image.version}</td>
                  <td className={`${cell} font-mono`}>{image.commit}</td>
                  <td className={cell}>{image.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DemoSection>

      <DemoSection testId="spec-012-health" title={t.health.title}>
        <p>{t.health.intro}</p>
        <div
          tabIndex={0}
          role="region"
          aria-label={t.health.title}
          className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full text-left" aria-label={t.health.title}>
            <thead>
              <tr>
                <th scope="col" className={cell}>
                  {t.health.probe}
                </th>
                <th scope="col" className={cell}>
                  {t.health.target}
                </th>
                <th scope="col" className={cell}>
                  {t.health.state}
                </th>
              </tr>
            </thead>
            <tbody>
              {stack.health.map((probe) => (
                <tr key={probe.name}>
                  <td className={`${cell} font-mono`}>{probe.name}</td>
                  <td className={`${cell} font-mono`}>{probe.target}</td>
                  <td className={cell}>{probe.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DemoSection>

      <DemoSection testId="spec-012-commands" title={t.commands.title}>
        <p>{t.commands.intro}</p>
        <pre
          // Axe (scrollable-region-focusable) : la zone défilante doit être atteignable au clavier.
          tabIndex={0}
          role="region"
          aria-label={t.commands.title}
          className="mt-3 overflow-x-auto rounded-[12px] bg-[#111113] p-4 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <code>{stack.commands.join('\n')}</code>
        </pre>
      </DemoSection>
    </>
  );
}
