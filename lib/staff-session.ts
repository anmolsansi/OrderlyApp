/** CON-08 preparation: pure, memory-only presentation state; not authorization.
 * No transport, storage, SDK, or runtime fixture fallback is used here.
 */
export type StaffRole = 'owner' | 'order_staff' | 'cashier';
export type StaffMembership = Readonly<{
  restaurant_id: string;
  role: StaffRole;
  version: number;
}>;
export type StaffSession = Readonly<
  | { status: 'loading' | 'signed_out' | 'unavailable'; token: null; restaurantId: null; role: null }
  | { status: 'ready'; token: string; restaurantId: string; role: StaffRole }
>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isRole(value: unknown): value is StaffRole {
  return value === 'owner' || value === 'order_staff' || value === 'cashier';
}

function isRestaurantId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 100 && value.trim().length > 0 &&
    !/[\p{C}\p{Zl}\p{Zp}]/u.test(value);
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 16384 && /^[!-~]+$/u.test(value);
}

/** Decode the accepted CON-06 own-membership response. Invalid is not empty. */
export function decodeOwnMemberships(value: unknown): readonly StaffMembership[] | null {
  if (!record(value) || !exactKeys(value, ['memberships']) || !Array.isArray(value.memberships)) return null;
  const seen = new Set<string>();
  const result: StaffMembership[] = [];
  for (const row of value.memberships as unknown[]) {
    if (!record(row) || !exactKeys(row, ['restaurant_id', 'role', 'version']) ||
      !isRestaurantId(row.restaurant_id) || !isRole(row.role) ||
      typeof row.version !== 'number' || !Number.isSafeInteger(row.version) || row.version < 1 ||
      seen.has(row.restaurant_id)) return null;
    seen.add(row.restaurant_id);
    result.push({ restaurant_id: row.restaurant_id, role: row.role, version: row.version });
  }
  return result;
}

/** Validate the public CON-08 shape without exposing a token in a non-ready state. */
export function decodeStaffSession(value: unknown): StaffSession | null {
  if (!record(value) || !exactKeys(value, ['status', 'token', 'restaurantId', 'role'])) return null;
  if (value.status === 'ready') {
    if (!isToken(value.token) || !isRestaurantId(value.restaurantId) || !isRole(value.role)) return null;
    return { status: 'ready', token: value.token, restaurantId: value.restaurantId, role: value.role };
  }
  if ((value.status === 'loading' || value.status === 'signed_out' || value.status === 'unavailable') &&
    value.token === null && value.restaurantId === null && value.role === null) {
    return { status: value.status, token: null, restaurantId: null, role: null };
  }
  return null;
}

/** Public authority projection. A browser role is never backend authorization. */
export function selectedStaffSession(token: unknown, memberships: readonly StaffMembership[], restaurantId: string | null): StaffSession {
  const selected = restaurantId === null ? undefined : memberships.find((row) => row.restaurant_id === restaurantId);
  if (!selected || !isToken(token)) {
    return { status: 'unavailable', token: null, restaurantId: null, role: null };
  }
  return { status: 'ready', token, restaurantId: selected.restaurant_id, role: selected.role };
}

/** Internal view reasons do not extend the public CON-08 discriminants. */
export type StaffView = 'loading' | 'signed_out' | 'unavailable' | 'denied' | 'empty' | 'choose' | 'workspace';
export type StaffSelectionState = Readonly<{
  generation: number;
  scopeKey: number;
  view: StaffView;
  token: string | null;
  memberships: readonly StaffMembership[];
  restaurantId: string | null;
  dirty: boolean;
}>;

export function initialStaffSelection(): StaffSelectionState {
  return { generation: 0, scopeKey: 0, view: 'loading', token: null, memberships: [], restaurantId: null, dirty: false };
}

/** Call before a new identity/session load or when signing out. Invalidate all old results. */
export function resetStaffSelection(state: StaffSelectionState, view: 'loading' | 'signed_out' | 'unavailable'): StaffSelectionState {
  return { ...initialStaffSelection(), generation: state.generation + 1, scopeKey: state.scopeKey + 1, view };
}

/** Complete a single outstanding load only. No async result can revive an invalidated scope. */
export function resolveStaffMemberships(state: StaffSelectionState, generation: number, token: unknown, payload: unknown): StaffSelectionState {
  if (state.generation !== generation || state.view !== 'loading') return state;
  const memberships = decodeOwnMemberships(payload);
  if (!memberships || !isToken(token)) return { ...state, view: 'unavailable' };
  if (!memberships.length) return { ...state, view: 'empty' };
  return { ...state, view: 'choose', token, memberships };
}

export function failStaffMemberships(state: StaffSelectionState, generation: number, reason: 'signed_out' | 'denied' | 'unavailable'): StaffSelectionState {
  if (state.generation !== generation || state.view !== 'loading') return state;
  return { ...state, view: reason };
}

/** The UI must ask before calling with discardConfirmed=true when dirty. */
export function chooseStaffRestaurant(state: StaffSelectionState, restaurantId: string, discardConfirmed = false): StaffSelectionState {
  if ((state.view !== 'choose' && state.view !== 'workspace') || !state.token ||
      !state.memberships.some((row) => row.restaurant_id === restaurantId) ||
      state.restaurantId === restaurantId || (state.dirty && !discardConfirmed)) return state;
  return { ...state, view: 'workspace', restaurantId, dirty: false, scopeKey: state.scopeKey + 1 };
}

/** Only the current mounted workspace may update draft state. */
export function setStaffDraftDirty(state: StaffSelectionState, scopeKey: number, dirty: boolean): StaffSelectionState {
  if (state.view !== 'workspace' || state.scopeKey !== scopeKey || state.dirty === dirty) return state;
  return { ...state, dirty };
}

export function projectStaffSelection(state: StaffSelectionState): StaffSession {
  if (state.view === 'workspace') return selectedStaffSession(state.token, state.memberships, state.restaurantId);
  const status = state.view === 'loading' || state.view === 'signed_out' ? state.view : 'unavailable';
  return { status, token: null, restaurantId: null, role: null };
}

/** Deliberately omit bearer credentials from presentation props. */
export type StaffSelectionView = Readonly<{
  generation: number;
  scopeKey: number;
  view: StaffView;
  memberships: readonly StaffMembership[];
  restaurantId: string | null;
  activeRole: StaffRole | null;
  dirty: boolean;
}>;

export function staffSelectionView(state: StaffSelectionState): StaffSelectionView {
  const session = projectStaffSelection(state);
  return {
    generation: state.generation,
    scopeKey: state.scopeKey,
    view: state.view,
    memberships: state.view === 'choose' || session.status === 'ready' ? state.memberships : [],
    restaurantId: session.restaurantId,
    activeRole: session.role,
    dirty: session.status === 'ready' && state.dirty,
  };
}
