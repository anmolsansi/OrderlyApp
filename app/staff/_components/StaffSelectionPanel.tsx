'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { projectStaffSelection, type StaffRole, type StaffSelectionState } from '@/lib/staff-session';

const roleLabel: Record<StaffRole, string> = {
  owner: 'Owner',
  order_staff: 'Order staff',
  cashier: 'Cashier',
};

type Props = {
  state: StaffSelectionState;
  onChoose: (restaurantId: string, discardConfirmed: boolean) => void;
  onRetry: () => void;
  onSignOut: () => void;
  signIn: ReactNode;
  workspace: ReactNode;
};

/**
 * Isolated presentation preparation. This component has no provider or fetch
 * binding. Only the eventual Clerk/CON-06 controller may supply its state.
 */
export function StaffSelectionPanel({ state, onChoose, onRetry, onSignOut, signIn, workspace }: Props) {
  const [pending, setPending] = useState<{ restaurantId: string; scopeKey: number } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const session = projectStaffSelection(state);
  const pendingSelection = state.view === 'workspace' && pending?.scopeKey === state.scopeKey &&
    state.memberships.some((row) => row.restaurant_id === pending.restaurantId) ? pending : null;

  useEffect(() => {
    if (pendingSelection) cancelRef.current?.focus();
  }, [pendingSelection]);

  function choose(restaurantId: string, trigger: HTMLButtonElement) {
    if (restaurantId === state.restaurantId) return;
    if (state.dirty) {
      triggerRef.current = trigger;
      setPending({ restaurantId, scopeKey: state.scopeKey });
      return;
    }
    onChoose(restaurantId, false);
  }

  function cancelSwitch() {
    setPending(null);
    triggerRef.current?.focus();
  }

  function confirmSwitch() {
    if (!pendingSelection) return;
    const restaurantId = pendingSelection.restaurantId;
    setPending(null);
    onChoose(restaurantId, true);
  }

  const selecting = state.view === 'choose' || state.view === 'workspace';

  return (
    <section className="live-task-screen" aria-label="Staff workspace" style={{ padding: '1rem' }}>
      <div className="live-panel" style={{ maxWidth: '48rem', margin: '0 auto', padding: '1rem', borderRadius: '0.75rem' }}>
        <h1>Restaurant staff</h1>
        {state.view === 'loading' && <p role="status">Loading staff access…</p>}
        {state.view === 'signed_out' && <div><p>Sign in with your staff account.</p>{signIn}</div>}
        {state.view === 'unavailable' && (
          <div>
            <p role="status" className="live-status-error">Staff access is unavailable. Please try again.</p>
            <button className="live-primary-action" type="button" onClick={onRetry}>Retry</button>
          </div>
        )}
        {state.view === 'denied' && <p role="status">Access denied. Contact your restaurant owner.</p>}
        {state.view === 'empty' && <p role="status">You have no active restaurant memberships. Contact your restaurant owner.</p>}
        {selecting && (
          <>
            <h2>Choose a restaurant</h2>
            <div role="group" aria-label="Allowed restaurants" style={{ display: 'grid', gap: '0.5rem' }}>
              {state.memberships.map((membership) => (
                <button key={membership.restaurant_id} type="button" className="live-primary-action"
                  aria-pressed={state.restaurantId === membership.restaurant_id}
                  disabled={Boolean(pendingSelection)}
                  onClick={(event) => choose(membership.restaurant_id, event.currentTarget)}>
                  {membership.restaurant_id} ({roleLabel[membership.role]})
                </button>
              ))}
            </div>
          </>
        )}
        {pendingSelection && (
          <div role="group" aria-label="Unsaved changes warning" style={{ padding: '0.75rem', marginBlock: '1rem' }}>
            <p className="live-status-warning">Switching restaurants will discard unsaved changes in this workspace.</p>
            <button ref={cancelRef} type="button" className="live-primary-action" onClick={cancelSwitch}>Keep editing</button>
            <button type="button" className="live-primary-action" onClick={confirmSwitch}>Discard changes and switch</button>
          </div>
        )}
        {state.view !== 'signed_out' && state.view !== 'loading' && (
          <button type="button" className="live-primary-action" style={{ marginBlockStart: '1rem' }} onClick={onSignOut}>Sign out</button>
        )}
      </div>
      {session.status === 'ready' && (
        <div key={state.scopeKey} aria-label="Selected restaurant workspace">
          <p role="status">{session.restaurantId} · {roleLabel[session.role]}</p>
          {workspace}
        </div>
      )}
    </section>
  );
}
