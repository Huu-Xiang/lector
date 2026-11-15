import { describe, expect, it } from 'vitest';
import { iosAppearance, supportsIPadTopTabs } from './ipad-layout';

describe('iOS navigation appearance', () => {
  it.each([
    ['Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) ReadfoxApp/1', 'classic', false],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) ReadfoxApp/1', 'modern', true],
    ['Mozilla/5.0 (iPad; CPU OS 26_3 like Mac OS X) ReadfoxApp/1', 'glass', true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.6 ReadfoxApp/1', 'modern', true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ReadfoxApp/1 ReadfoxOS/26', 'glass', true],
    ['Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) ReadfoxApp/1 ReadfoxOS/27', 'glass', true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ReadfoxApp/1', 'classic', false],
  ] as const)('matches %s to %s', (agent, expected, topTabs) => {
    const appearance = iosAppearance(agent);
    expect(appearance).toBe(expected);
    expect(supportsIPadTopTabs(appearance)).toBe(topTabs);
  });
});
