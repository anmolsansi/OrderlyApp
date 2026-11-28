import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StaffSelectionPanel } from '../app/staff/_components/StaffSelectionPanel';
import { chooseStaffRestaurant, failStaffMemberships, initialStaffSelection, resetStaffSelection, resolveStaffMemberships, staffSelectionView, type StaffSelectionState } from '../lib/staff-session';

const token = 'synthetic-token-not-valid-for-auth';
const payload = { memberships: [
  { restaurant_id: 'r-one', role: 'owner', version: 1 },
  { restaurant_id: 'r-two', role: 'order_staff', version: 1 },
  { restaurant_id: 'r-three', role: 'cashier', version: 1 },
] };

function render(state: StaffSelectionState) {
  return renderToStaticMarkup(createElement(StaffSelectionPanel, {
    state: staffSelectionView(state),
    onChoose: () => undefined,
    onRetry: () => undefined,
    onSignOut: () => undefined,
    signIn: createElement('div', null, 'Isolated sign-in slot'),
    workspace: createElement('div', null, 'Selected workspace content'),
  }));
}

describe('RS-08 isolated staff panel markup', () => {
  const loading = resetStaffSelection(initialStaffSelection(), 'loading');
  const choosing = resolveStaffMemberships(loading, loading.generation, token, payload);

  it.each([
    { state: loading, text: 'Loading staff access' },
    { state: resetStaffSelection(loading, 'signed_out'), text: 'Isolated sign-in slot' },
    { state: failStaffMemberships(loading, loading.generation, 'denied'), text: 'Access denied' },
    { state: failStaffMemberships(loading, loading.generation, 'unavailable'), text: 'Retry' },
    { state: resolveStaffMemberships(loading, loading.generation, token, { memberships: [] }), text: 'no active restaurant memberships' },
  ])('shows the correct non-workspace state ($text)', ({ state, text }) => {
    const markup = render(state);
    expect(markup).toContain(text);
    expect(markup).not.toContain('Selected workspace content');
    expect(markup).not.toContain(token);
    expect(markup).not.toContain('r-one');
  });

  it('renders only allowed restaurant choices and no workspace before selection', () => {
    const markup = render(choosing);
    expect(markup).toContain('Allowed restaurants');
    expect(markup).toContain('r-one (Owner)');
    expect(markup).toContain('r-two (Order staff)');
    expect(markup).toContain('r-three (Cashier)');
    expect(markup).not.toContain('Selected workspace content');
    expect(markup).not.toContain(token);
  });

  it.each(['r-one', 'r-two', 'r-three'])('shows the selected workspace without serializing a token (%s)', (rid) => {
    const markup = render(chooseStaffRestaurant(choosing, rid));
    expect(markup).toContain('Selected workspace content');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain(rid);
    expect(markup).not.toContain(token);
    expect(markup).not.toContain('Isolated sign-in slot');
  });
});
