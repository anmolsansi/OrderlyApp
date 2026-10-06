import { readFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

const report = JSON.parse(readFileSync(process.argv[2] ?? 'test-results/report.json', 'utf8'));
if (!report.stats || report.stats.expected < 1 || report.stats.skipped !== 0 ||
    report.stats.unexpected !== 0 || report.stats.flaky !== 0 || report.errors?.length) {
  throw new Error('Mandatory browser acceptance requires non-empty, passing tests with no skips, failures or flaky retries');
}
console.log(`Verified ${report.stats.expected} mandatory browser tests without skips`);
