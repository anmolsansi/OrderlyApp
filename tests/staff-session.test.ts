import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeOwnMemberships, decodeStaffSession, selectedStaffSession, initialStaffSelection,
  resetStaffSelection, resolveStaffMemberships, failStaffMemberships, chooseStaffRestaurant,
  setStaffDraftDirty, projectStaffSelection,
} from '../lib/staff-session';

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

describe('CON-08 isolated tenant transition model', () => {
  const payload = {
    memberships: [row, { restaurant_id: 'r-second', role: 'cashier', version: 1 }],
  };
  function loaded() {
    const loading = resetStaffSelection(initialStaffSelection(), 'loading');
    return resolveStaffMemberships(loading, loading.generation, token, payload);
  }

  it('requires selection and refuses unknown restaurants', () => {
    const choosing = loaded();
    expect(choosing.view).toBe('choose');
    expect(projectStaffSelection(choosing)).toEqual(unavailable);
    expect(chooseStaffRestaurant(choosing, 'foreign')).toBe(choosing);
    expect(projectStaffSelection(chooseStaffRestaurant(choosing, 'r-demo'))).toEqual({
      status: 'ready', token, restaurantId: 'r-demo', role: 'owner',
    });
  });

  it('preserves the current draft scope on cancellation; discards it only on confirmation', () => {
    const owner = chooseStaffRestaurant(loaded(), 'r-demo');
    const dirty = setStaffDraftDirty(owner, owner.scopeKey, true);
    expect(chooseStaffRestaurant(dirty, 'r-second')).toBe(dirty);
    const cashier = chooseStaffRestaurant(dirty, 'r-second', true);
    expect(cashier.scopeKey).toBe(owner.scopeKey + 1);
    expect(cashier.dirty).toBe(false);
    expect(projectStaffSelection(cashier)).toEqual({
      status: 'ready', token, restaurantId: 'r-second', role: 'cashier',
    });
    expect(setStaffDraftDirty(cashier, owner.scopeKey, true)).toBe(cashier);
    expect(chooseStaffRestaurant(cashier, 'foreign', true)).toBe(cashier);
  });

  it('clears all memory-only authority and rejects late results on sign-out and new identity', () => {
    const oldLoad = resetStaffSelection(initialStaffSelection(), 'loading');
    const workspace = chooseStaffRestaurant(resolveStaffMemberships(oldLoad, oldLoad.generation, token, payload), 'r-demo');
    const signedOut = resetStaffSelection(workspace, 'signed_out');
    expect(signedOut.token).toBeNull();
    expect(signedOut.memberships).toEqual([]);
    expect(signedOut.restaurantId).toBeNull();
    expect(signedOut.scopeKey).toBeGreaterThan(workspace.scopeKey);
    expect(projectStaffSelection(signedOut)).toEqual({ ...unavailable, status: 'signed_out' });
    expect(resolveStaffMemberships(signedOut, oldLoad.generation, token, payload)).toBe(signedOut);
    const newLoad = resetStaffSelection(signedOut, 'loading');
    expect(resolveStaffMemberships(newLoad, oldLoad.generation, token, payload)).toBe(newLoad);
    expect(failStaffMemberships(newLoad, oldLoad.generation, 'denied')).toBe(newLoad);
  });

  it('distinguishes empty, denied, unavailable and signed out without new public discriminants', () => {
    const loading = resetStaffSelection(initialStaffSelection(), 'loading');
    const empty = resolveStaffMemberships(loading, loading.generation, token, { memberships: [] });
    const denied = failStaffMemberships(loading, loading.generation, 'denied');
    const invalid = resolveStaffMemberships(loading, loading.generation, token, {});
    expect([empty.view, denied.view, invalid.view]).toEqual(['empty', 'denied', 'unavailable']);
    for (const state of [empty, denied, invalid]) {
      expect(state.token).toBeNull();
      expect(state.memberships).toEqual([]);
      expect(projectStaffSelection(state)).toEqual(unavailable);
    }
    const choosing = resolveStaffMemberships(loading, loading.generation, token, payload);
    expect(resolveStaffMemberships(choosing, loading.generation, token, payload)).toBe(choosing);
  });
});
