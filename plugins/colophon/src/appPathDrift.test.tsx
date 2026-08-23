import { configApiRef } from '@backstage/frontend-plugin-api';
import {
  mockApis,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { useAppPathDriftWarning } from './appPathDrift';
import { colophonRouteRef } from './plugin';

function Probe() {
  useAppPathDriftWarning();
  return <div>mounted</div>;
}

async function render(options: { mountPath: string; appPath?: string }) {
  const config = mockApis.config({
    data: options.appPath ? { colophon: { appPath: options.appPath } } : {},
  });
  return renderInTestApp(
    <TestApiProvider apis={[[configApiRef, config]]}>
      <Probe />
    </TestApiProvider>,
    { mountedRoutes: { [options.mountPath]: colophonRouteRef } },
  );
}

/**
 * `colophon.appPath` is a second copy of a value the router already knows, and
 * the whole reason it exists is that the backend cannot ask the router. A
 * second copy that can silently disagree with the first is the failure mode
 * this plugin has already shipped once, so the disagreement has to announce
 * itself — these tests are what keep it doing so.
 */
describe('the app path drift warning', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  /**
   * Only our own warnings. The test app shell warns about its own things —
   * two toast landmarks with the same label, once more than one app is
   * rendered in a test — and counting those would make this file fail for
   * reasons that have nothing to do with drift.
   */
  const drift = () =>
    warn.mock.calls
      .map(call => String(call[0]))
      .filter(message => message.startsWith('Colophon:'));

  it('says nothing at the default mount with no configuration', async () => {
    // The overwhelmingly common case. A warning here would be noise every
    // adopter learns to ignore, which costs the warning its only power.
    await render({ mountPath: '/colophon' });
    expect(drift()).toEqual([]);
  });

  it('says nothing when the configured path matches the mount', async () => {
    await render({ mountPath: '/handbook', appPath: '/handbook' });
    expect(drift()).toEqual([]);
  });

  it('names both paths and what breaks when they disagree', async () => {
    await render({ mountPath: '/handbook' });
    expect(drift()).toHaveLength(1);
    const [message] = drift();
    expect(message).toContain('"/handbook"');
    expect(message).toContain('"/colophon"');
    expect(message).toContain('colophon.appPath');
    expect(message).toMatch(/404/);
  });

  it('does not mistake a spelling difference for drift', async () => {
    // An operator writes the same mount three ways; none of them is a bug.
    for (const written of ['handbook', '/handbook/', '//handbook']) {
      await render({ mountPath: '/handbook', appPath: written });
    }
    expect(drift()).toEqual([]);
  });
});
