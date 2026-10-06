import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

test('CI browser gate rejects empty, skipped, failed, flaky and invalid reports', () => {
  const directory = mkdtempSync(join(tmpdir(), 'orderly-report-'));
  const path = join(directory, 'report.json');
  const valid = { expected: 2, skipped: 0, unexpected: 0, flaky: 0 };
  try {
    for (const [stats, errors, passes] of [
      [valid, [], true],
      [{ ...valid, expected: 0 }, [], false],
      [{ ...valid, skipped: 1 }, [], false],
      [{ ...valid, unexpected: 1 }, [], false],
      [{ ...valid, flaky: 1 }, [], false],
      [valid, [{ message: 'runtime failed' }], false],
      [undefined, [], false],
    ] as const) {
      writeFileSync(path, JSON.stringify({ stats, errors }));
      expect(spawnSync(process.execPath, ['scripts/verify-e2e-report.mjs', path]).status === 0).toBe(passes);
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});
