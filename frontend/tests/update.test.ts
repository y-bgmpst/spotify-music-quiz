import { describe, expect, it } from 'vitest';
import { isNewerVersion, normalizeVersion } from '../src/update';

describe('update version checks', () => {
  it('normalizes release tags', () => {
    expect(normalizeVersion(' v0.2.0 ')).toBe('0.2.0');
  });

  it('detects newer releases without treating equal versions as updates', () => {
    expect(isNewerVersion('0.1.0', 'v0.2.0')).toBe(true);
    expect(isNewerVersion('0.2.0', 'v0.2.0')).toBe(false);
    expect(isNewerVersion('0.3.0', 'v0.2.0')).toBe(false);
  });
});
