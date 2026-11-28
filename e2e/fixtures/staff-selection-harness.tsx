/** Playwright-only browser entry. Never imported by the Next application. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StaffSelectionPanel } from '../../app/staff/_components/StaffSelectionPanel';
import {
  chooseStaffRestaurant, failStaffMemberships, initialStaffSelection, resetStaffSelection,
  resolveStaffMemberships, setStaffDraftDirty, type StaffSelectionState,
} from '../../lib/staff-session';

const token = 'synthetic-token-not-valid-for-auth';
const memberships = { memberships: [
  { restaurant_id: 'r-one', role: 'owner', version: 1 },
  { restaurant_id: 'r-two', role: 'order_staff', version: 1 },
  { restaurant_id: 'r-three', role: 'cashier', version: 1 },
] };

function fresh(mode: string): StaffSelectionState {
  const loading = resetStaffSelection(initialStaffSelection(), 'loading');
  if (mode === '#loading') return loading;
  if (mode === '#signed-out') return resetStaffSelection(loading, 'signed_out');
  if (mode === '#denied') return failStaffMemberships(loading, loading.generation, 'denied');
  if (mode === '#unavailable') return failStaffMemberships(loading, loading.generation, 'unavailable');
  return resolveStaffMemberships(loading, loading.generation, token, mode === '#empty' ? { memberships: [] } : memberships);
}

function Draft({ onDirty }: { onDirty: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState('');
  return <label>Draft notes
    <input value={draft} onChange={(event) => {
      setDraft(event.target.value);
      onDirty(event.target.value.length > 0);
    }} />
  </label>;
}

function Harness() {
  const [state, setState] = useState(() => fresh(window.location.hash));
  return <StaffSelectionPanel state={state}
    onChoose={(rid, confirmed) => setState((previous) => chooseStaffRestaurant(previous, rid, confirmed))}
    onRetry={() => setState((previous) => {
      const loading = resetStaffSelection(previous, 'loading');
      return resolveStaffMemberships(loading, loading.generation, token, memberships);
    })}
    onSignOut={() => setState((previous) => resetStaffSelection(previous, 'signed_out'))}
    signIn={<p>Isolated sign-in slot</p>}
    workspace={<Draft onDirty={(dirty) => setState((previous) => setStaffDraftDirty(previous, state.scopeKey, dirty))} />}
  />;
}

const root = document.getElementById('staff-harness');
if (!root) throw new Error('Missing isolated test mount');
createRoot(root).render(<Harness />);
