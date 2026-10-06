import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type ContractFixture = {
  contract: string;
  schema_version: number;
  synthetic: boolean;
  positive: Record<string, unknown>;
  negative: Array<{
    name: string;
    error: {
      code: string;
      message: string;
      request_id: string;
      fields: unknown[];
    };
  }>;
};

function loadFixture(index: number): ContractFixture {
  const filename = join(process.cwd(), 'tests', 'fixtures', 'contracts', `c${index}.json`);
  return JSON.parse(readFileSync(filename, 'utf8')) as ContractFixture;
}

describe('ST-01 contract fixtures', () => {
  it('loads C0 through C8 with the shared executable envelope', () => {
    for (let index = 0; index <= 8; index += 1) {
      const fixture = loadFixture(index);
      expect(fixture.contract).toBe(`C${index}`);
      expect(fixture.schema_version).toBe(1);
      expect(fixture.synthetic).toBe(true);
      expect(fixture.positive).toBeTruthy();
      expect(fixture.negative.length).toBeGreaterThan(0);

      for (const negative of fixture.negative) {
        expect(negative.name.length).toBeGreaterThan(0);
        expect(negative.error.code.length).toBeGreaterThan(0);
        expect(negative.error.message.length).toBeGreaterThan(0);
        expect(negative.error.request_id).toMatch(/^synthetic-request-/);
        expect(Array.isArray(negative.error.fields)).toBe(true);
      }
    }
  });

  it('preserves the cross-language C5 and C6 invariants', () => {
    const c5 = loadFixture(5) as ContractFixture & {
      positive: { quote: { totals: { total_cents: number } }; receipt: unknown };
    };
    const c6 = loadFixture(6) as ContractFixture & {
      positive: {
        first_response: { receipt: unknown };
        replay_response: { receipt: unknown };
      };
    };

    expect(c5.positive.quote.totals.total_cents).toBe(1192);
    expect(c6.positive.replay_response.receipt).toEqual(c6.positive.first_response.receipt);
    expect(c6.positive.first_response.receipt).toEqual(c5.positive.receipt);
  });
});
