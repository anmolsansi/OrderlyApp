import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeOwnMemberships, decodeStaffSession, selectedStaffSession } from '../lib/staff-session';

const fixture = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'restaurant-service', 'v1.json'), 'utf8')) as {
  contracts: Record<string, { positive: { payload: Record<string, unknown> }; negative: { path: string; value: unknown }[] }>;
  wire_cases: { id: string; response: unknown }[];
};
const con08 = fixture.contracts['CON-08'];
const membershipWire = fixture.wire_cases.find((entry) => entry.id === 'CON-06-1');
const row = { restaurant_id: 'r-demo', role: 'owner', version: 1 } as const;
const token = 'synthetic-token-not-valid-for-auth';
const unavailable = { status: 'unavailable', token: null, restaurantId: null, role: null };

describe('CON-08 isolated session preparation', () => {
  it('accepts the frozen positive session and rejects each recorded negative mutation', () => {
    expect(decodeStaffSession(con08.positive.payload)).toEqual(con08.positive.payload);
    expect(con08.negative.length).toBeGreaterThan(0);
    for (const negative of con08.negative) {
      expect(decodeStaffSession({ ...con08.positive.payload, [negative.path]: negative.value })).toBeNull();
    }
  });

  it('accepts the CON-06 own-memberships wire fixture and treats empty as valid', () => {
    expect(membershipWire).toBeDefined();
    expect(decodeOwnMemberships(membershipWire?.response)).toEqual([row]);
    expect(decodeOwnMemberships({ memberships: [] })).toEqual([]);
  });

  it.each([
    null, [], {}, { memberships: 'bad' }, { memberships: [row, row] },
    { memberships: [{ ...row, role: 'admin' }] },
    { memberships: [{ ...row, version: true }] },
    { memberships: [{ ...row, version: 0 }] },
    { memberships: [{ ...row, version: Number.MAX_SAFE_INTEGER + 1 }] },
    { memberships: [{ ...row, restaurant_id: '' }] },
    { memberships: [{ ...row, extra: true }] },
  ].map((value) => ({ value })))('rejects malformed or duplicate memberships ($value)', ({ value }) => {
    expect(decodeOwnMemberships(value)).toBeNull();
  });

  it.each(['owner', 'order_staff', 'cashier'] as const)('projects only the selected verified membership (%s)', (role) => {
    const memberships = decodeOwnMemberships({ memberships: [row, { restaurant_id: 'r-second', role, version: 1 }] });
    expect(memberships).not.toBeNull();
    expect(selectedStaffSession(token, memberships ?? [], 'r-second')).toEqual({
      status: 'ready', token, restaurantId: 'r-second', role,
    });
  });

  it.each(['loading', 'signed_out', 'unavailable'] as const)('never exposes authority while %s', (status) => {
    const clean = { status, token: null, restaurantId: null, role: null };
    expect(decodeStaffSession(clean)).toEqual(clean);
    expect(decodeStaffSession({ ...clean, token })).toBeNull();
  });

  it('fails closed on an empty list, unknown selection, no selection or missing token', () => {
    expect(selectedStaffSession(token, [], 'r-demo')).toEqual(unavailable);
    expect(selectedStaffSession(token, [row], 'foreign')).toEqual(unavailable);
    expect(selectedStaffSession(token, [row], null)).toEqual(unavailable);
    expect(selectedStaffSession(null, [row], 'r-demo')).toEqual(unavailable);
    expect(selectedStaffSession('', [row], 'r-demo')).toEqual(unavailable);
  });
});
