/** RS-01: synthetic contract consumer reader. This is NOT a live provider. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Spec = string | { [key: string]: Spec } | Spec[];
type JsonRecord = Record<string, unknown>;
type Mutation = {
  name: string;
  action: 'add' | 'remove' | 'replace';
  path: string;
  value?: unknown;
  expected_field: string;
  code: string;
};
type ContractCase = {
  contract: string;
  schema_version: number;
  synthetic: boolean;
  kind: string;
  source_summary: string;
  positive: { payload: unknown };
  negative: Mutation[];
  live_provider_verified: boolean;
};
type Bundle = {
  schema_version: number;
  synthetic: boolean;
  money_unit: string;
  live_activation: boolean;
  ids: JsonRecord;
  core: JsonRecord;
  contracts: Record<string, ContractCase>;
  canonical_command: {
    key: string;
    envelope: JsonRecord;
    canonical_json: string;
    sha256: string;
    conflicts: Array<{ name: string; path: string; value: unknown; expected_status: number }>;
    security_cases: Array<{ name: string; expected_status: number }>;
    same_key_replay: { expected_status: number };
  };
  mock_fixture_blob_sha: Record<string, string>;
  external_evidence_gates: Record<string, string>;
};
const root = process.cwd();
function readBundle(): Bundle {
  return JSON.parse(readFileSync(join(root, 'tests/fixtures/restaurant-service/v1.json'), 'utf8')) as Bundle;
}
function object(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const previewFields: Record<string, Spec> = {
  fulfillment: 'enum:dine_in|takeaway',
  table_id: 'uuid?',
  restaurant_id: 'rid',
  restaurant_name: 'str',
  table_label: 'str?',
  items: ['@line'],
  totals: '@totals',
  pricing_version: 'positive_int',
  promotion_code: 'str?',
  offer_version: 'positive_int?',
  business_identity: 'string_map',
  synthetic: 'bool',
};
const schemas: Record<string, Spec> = {
  reference: { contract_id: 'contract_id', restaurant_id: 'rid', state: 'enum:proposed', source: 'str' },
  restaurant: {
    id: 'rid', name: 'str', brand_label: 'str', is_open: 'bool',
    ordering_enabled: 'bool', timezone: 'enum:Asia/Kolkata',
  },
  settings: {
    id: 'rid', name: 'str', brand_label: 'str', is_open: 'bool',
    ordering_enabled: 'bool', timezone: 'enum:Asia/Kolkata',
    version: 'positive_int', hours: ['@hour'],
  },
  hour: { day: 'weekday', opens_minute: 'minute', closes_minute: 'minute' },
  table: { id: 'uuid', restaurant_id: 'rid', label: 'str', active: 'bool', version: 'positive_int', url: 'str' },
  principal: { sub: 'str' },
  membership: { restaurant_id: 'rid', clerk_user_id: 'str', role: 'enum:owner|order_staff|cashier', active: 'bool', version: 'positive_int' },
  staff_session: { status: 'enum:loading|signed_out|ready|unavailable', token: 'str', restaurantId: 'rid', role: 'enum:owner|order_staff|cashier' },
  modifier_selection: { group_id: 'str', option_ids: ['str'] },
  modifier_option: { id: 'str', name: 'str', price_delta_cents: 'int', available: 'bool' },
  modifier_group: {
    id: 'str', name: 'str', type: 'enum:single|multiple', required: 'bool',
    min_selected: 'int', max_selected: 'int', default_option_id: 'str?', options: ['@modifier_option'],
  },
  menu_item: {
    id: 'str', name: 'str', description: 'str', price_cents: 'money',
    image_emoji: 'str', popular: 'bool', available: 'bool', modifier_groups: ['@modifier_group'],
  },
  menu: { restaurant_id: 'rid', catalog_version: 'positive_int', items: ['@menu_item'] },
  catalog: { schema_version: 'one', restaurant: '@restaurant', catalog_version: 'positive_int', items: ['@menu_item'] },
  line: {
    id: 'str', restaurant_id: 'rid', menu_item_id: 'str', quantity: 'quantity',
    modifiers: ['@modifier_selection'], special_instructions: 'str?',
    name: 'str', unit_minor: 'money', line_minor: 'money',
  },
  initial_cart: { schema_version: 'one', restaurant_id: 'rid', revision: 'revision', items: ['@line'] },
  cart: { schema_version: 'one', restaurant_id: 'rid', revision: 'revision', items: ['@line'] },
  totals: {
    currency: 'enum:INR', subtotal_minor: 'money', discount_minor: 'money',
    tax_minor: 'money', charges_minor: 'money', total_minor: 'money',
  },
  receipt_preview: previewFields,
  quote: {
    schema_version: 'one', cart_revision: 'revision', catalog_version: 'positive_int',
    pricing_version: 'positive_int', offer_version: 'positive_int?',
    quote_digest: 'digest', receipt_preview: '@receipt_preview', totals: '@totals',
  },
  receipt: {
    ...previewFields, schema_version: 'one', kind: 'enum:live-v1',
    id: 'uuid', created_at: 'utc', payment_instruction: 'enum:Pay at restaurant',
  },
  operation: {
    status: 'enum:Submitted|Accepted|Preparing|Ready|Completed|Rejected|Cancelled',
    version: 'positive_int', reason: 'str?', updated_at: 'utc',
  },
  payment: {
    status: 'enum:Unpaid|Paid', amount_minor: 'money', currency: 'enum:INR',
    active_payment_event_id: 'uuid?', settlement_required: 'bool',
  },
  event: { id: 'uuid', kind: 'str', at: 'utc', actor: 'str', reason: 'str?' },
  detail: { receipt: '@receipt', operation: '@operation', payment: '@payment', events: ['@event'] },
  order_summary: {
    id: 'uuid', created_at: 'utc', fulfillment: 'enum:dine_in|takeaway',
    table_label: 'str?', total_minor: 'money', currency: 'enum:INR',
    operation: '@operation', payment: '@payment',
  },
  offer: {
    id: 'uuid', restaurant_id: 'rid', version: 'positive_int', code: 'str',
    starts_at: 'utc', ends_at: 'utc', min_subtotal_minor: 'money',
    percent_bps: 'positive_int', max_discount_minor: 'money',
    max_redemptions: 'positive_int', consumed: 'int', active: 'bool',
  },
  campaign: {
    id: 'uuid', restaurant_id: 'rid', version: 'positive_int',
    channel: 'enum:sms|email', offer_id: 'uuid', message: 'str', subject: 'str?',
    status: 'enum:draft|approved|dispatching|paused|finished', approval_id: 'uuid?',
  },
  campaign_preview: {
    preview_id: 'uuid', expires_at: 'utc', recipient_count: 'int',
    estimated_cost_minor: 'money', currency: 'enum:INR', content_digest: 'digest',
    offer_version: 'positive_int', setup_ready: 'bool',
  },
  approval: {
    id: 'uuid', campaign_id: 'uuid', version: 'positive_int',
    recipient_count: 'int', max_cost_minor: 'money', currency: 'enum:INR', approved_at: 'utc',
  },
  setup: { configured: 'bool', verified: 'bool', reason_codes: ['str'], cost_version: 'positive_int?' },
  delivery_input: {
    id: 'uuid', restaurant_id: 'rid', approval_id: 'uuid', claim_token: 'uuid',
    channel: 'enum:sms|email', destination: 'str', message: 'str', subject: 'str?',
    unsubscribe_url: 'str', reserved_cost_minor: 'money', config_version: 'positive_int',
  },
  delivery_result: {
    state: 'enum:accepted|delivered|failed|uncertain|safely_not_sent',
    provider_id: 'str?', safe_code: 'str', actual_cost_minor: 'money?',
  },
  campaign_counts: { accepted: 'int', delivered: 'int', uncertain: 'int', cost_reserved_minor: 'money' },
  summary: {
    from: 'date', to: 'date', currency: 'enum:INR',
    submitted: 'int', completed: 'int', cancelled: 'int',
    recorded_paid_minor: 'money', reversed_minor: 'money', unpaid_minor: 'money',
    settlement_required: 'int', promotion_submissions: 'int', campaigns: '@campaign_counts',
  },
  consent: {
    order_id: 'uuid', channel: 'enum:sms|email', destination: 'str',
    notice_version: 'str', consent: 'bool',
  },
  unsubscribe: { unsubscribed: 'bool' },
  theme: { theme: 'enum:light|dark', source: 'str' },
  form_error: { field_id: 'str', message: 'str' },
  form_errors: { errors: ['@form_error'], submitted: 'bool' },
  api_result: { ok: 'bool', data: '@receipt' },
  queue: { orders: ['@order_summary'], next_cursor: 'str?', as_of: 'utc' },
  transcript: { transcript: 'str', locale: 'str', verified_device: 'bool' },
  proposal: {
    kind: 'enum:add|clarify|navigate', restaurantId: 'rid', catalogVersion: 'positive_int',
    itemId: 'str?', quantity: 'quantity?', modifiers: ['@modifier_selection'],
    missingFields: ['str'], transcript: 'str',
  },
  demo_session: { schema_version: 'one', restaurant_id: 'rid', expires_at: 'utc' },
  readiness: {
    ready: 'bool', source_sha: 'str', schema_ready: 'bool', worker_ready: 'bool',
    identity_ready: 'bool', live_enabled: 'bool', reason_codes: ['str'],
  },
  worker: { command: 'str', live_enabled: 'bool', marketing_send_enabled: 'bool' },
  error_payload: { code: 'str', message: 'str', fields: ['str'], request_id: 'str' },
  error: { error: '@error_payload' },
};

function scalarValid(type: string, value: unknown): boolean {
  if (type.endsWith('?')) return value === null || scalarValid(type.slice(0, -1), value);
  if (type.startsWith('@')) return validate(schemas[type.slice(1)], value).length === 0;
  if (type.startsWith('enum:')) return type.slice(5).split('|').includes(String(value));
  if (type === 'str') return typeof value === 'string';
  if (type === 'bool') return typeof value === 'boolean';
  if (type === 'one') return value === 1 && typeof value === 'number';
  if (type === 'int' || type === 'revision') return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (type === 'positive_int') return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  if (type === 'money') return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2147483647;
  if (type === 'quantity') return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10;
  if (type === 'weekday') return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7;
  if (type === 'minute') return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1440;
  if (type === 'rid') return value === 'r-demo';
  if (type === 'contract_id') return typeof value === 'string' && /^CON-\d{2}$/.test(value);
  if (type === 'uuid') return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (type === 'digest') return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (type === 'utc') return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && !Number.isNaN(Date.parse(value));
  if (type === 'date') return typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value);
  if (type === 'string_map') return object(value) && Object.values(value).every(v => typeof v === 'string');
  throw new Error('Unknown schema scalar ' + type);
}
function validate(spec: Spec, value: unknown, path = ''): string[] {
  if (typeof spec === 'string') {
    if (spec.endsWith('?') && value === null) return [];
    if (spec.startsWith('@')) return validate(schemas[spec.slice(1)], value, path);
    return scalarValid(spec, value) ? [] : [path || '$'];
  }
  if (Array.isArray(spec)) {
    if (!Array.isArray(value) || spec.length !== 1) return [path || '$'];
    return value.flatMap((part, index) => validate(spec[0], part, path ? path + '.' + index : String(index)));
  }
  if (!object(value)) return [path || '$'];
  const violations: string[] = [];
  for (const field of Object.keys(spec)) {
    const name = path ? path + '.' + field : field;
    if (!Object.hasOwn(value, field)) violations.push(name);
    else violations.push(...validate(spec[field], value[field], name));
  }
  for (const field of Object.keys(value)) {
    if (!Object.hasOwn(spec, field)) violations.push(path ? path + '.' + field : field);
  }
  return violations;
}
function clone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}
function mutated(payload: unknown, change: Mutation): unknown {
  const copy = clone(payload);
  const parts = change.path.split('.');
  let cursor: unknown = copy;
  for (const name of parts.slice(0, -1)) {
    if (!object(cursor) && !Array.isArray(cursor)) throw new Error('Invalid fixture path ' + change.path);
    cursor = (cursor as JsonRecord)[name];
  }
  if (!object(cursor) && !Array.isArray(cursor)) throw new Error('Invalid fixture path ' + change.path);
  const last = parts[parts.length - 1];
  if (change.action === 'remove') delete (cursor as JsonRecord)[last];
  else (cursor as JsonRecord)[last] = change.value;
  return copy;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

describe('RS-01 live-v1 synthetic contract readers', () => {
  const bundle = readBundle();

  it('preserves the approved registry and all three amendments verbatim', () => {
    const development = readFileSync(join(root, 'development.md'), 'utf8');
    const published = readFileSync(join(root, 'docs/contracts/restaurant-service-v1.md'), 'utf8');
    const begin = development.indexOf('#### Shared wire, authorization and failure semantics');
    const end = development.indexOf('### 18.7 Dependency DAG', begin);
    const a = development.indexOf('#### 18.17.1 Contract corrections required before fixture freeze');
    const b = development.indexOf('#### 18.17.2 Follow-up index', a);
    expect(begin).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(begin);
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(published).toContain(development.slice(begin, end).trimEnd());
    expect(published).toContain(development.slice(a, b).trimEnd());
  });

  it('accepts exactly 67 independently defined synthetic example kinds', () => {
    expect(bundle.schema_version).toBe(1);
    expect(bundle.synthetic).toBe(true);
    expect(bundle.live_activation).toBe(false);
    expect(bundle.money_unit).toBe('INR paise');
    expect(bundle.ids.restaurant_id).toBe('r-demo');
    expect(bundle.ids.guest_id).toBe('g-one');
    expect(bundle.ids.menu_item_id).toBe('i-one');
    expect(Object.keys(bundle.contracts)).toHaveLength(67);
    for (let index = 1; index <= 67; index += 1) {
      const id = 'CON-' + String(index).padStart(2, '0');
      const entry = bundle.contracts[id];
      expect(entry, id).toBeDefined();
      expect(entry.contract).toBe(id);
      expect(entry.schema_version).toBe(1);
      expect(entry.synthetic).toBe(true);
      expect(entry.live_provider_verified).toBe(false);
      expect(entry.source_summary.startsWith(id + ':')).toBe(true);
      expect(schemas[entry.kind], id).toBeDefined();
      expect(validate(schemas[entry.kind], entry.positive.payload), id).toEqual([]);
      expect(entry.negative.length).toBeGreaterThan(0);
      if (entry.kind === 'reference') {
        expect((entry.positive.payload as JsonRecord).contract_id).toBe(id);
      }
    }
    expect(bundle.external_evidence_gates).toHaveProperty('U1');
    expect(bundle.external_evidence_gates).toHaveProperty('U2');
    expect(bundle.external_evidence_gates).toHaveProperty('U3');
    expect(bundle.external_evidence_gates).toHaveProperty('U4');
  });

  it('rejects every negative case by the independent schema, including money and tenant mutations', () => {
    let count = 0;
    for (const [id, entry] of Object.entries(bundle.contracts)) {
      for (const change of entry.negative) {
        const fields = validate(schemas[entry.kind], mutated(entry.positive.payload, change));
        expect(fields, id + '/' + change.name).toContain(change.expected_field);
        expect(['invalid_input', 'not_found']).toContain(change.code);
        count += 1;
      }
    }
    expect(count).toBeGreaterThan(200);
  });

  it('pins integer paise, required nullability, cart revision and deterministic receipt', () => {
    const quote = bundle.core.quote as JsonRecord;
    const receipt = bundle.core.receipt as JsonRecord;
    const totals = (quote.totals as JsonRecord);
    const receiptTotals = receipt.totals as JsonRecord;
    expect(validate(schemas.quote, quote)).toEqual([]);
    expect(validate(schemas.receipt, receipt)).toEqual([]);
    expect(totals.total_minor).toBe(1200);
    expect(receiptTotals).toEqual(totals);
    expect((bundle.core.initial_cart as JsonRecord).revision).toBe(0);
    expect((bundle.core.cart as JsonRecord).revision).toBe(1);
    expect((bundle.core.cart as JsonRecord).items).toHaveLength(1);
    expect((quote.receipt_preview as JsonRecord).offer_version).toBeNull();
    expect(receipt.payment_instruction).toBe('Pay at restaurant');
    expect((receipt.business_identity as JsonRecord)).toEqual({});
  });

  it('canonicalizes command identity over operation + target + validated body', () => {
    const record = bundle.canonical_command;
    const bytes = JSON.stringify(canonical(record.envelope));
    const digest = createHash('sha256').update(bytes, 'utf8').digest('hex');
    expect(bytes).toBe(record.canonical_json);
    expect(digest).toBe(record.sha256);
    expect(record.same_key_replay.expected_status).toBe(200);
    for (const conflict of record.conflicts) {
      const edited = clone(record.envelope);
      const newValue = mutated(edited, {
        name: conflict.name, action: 'replace', path: conflict.path,
        value: conflict.value, expected_field: conflict.path, code: 'idempotency_conflict',
      });
      expect(createHash('sha256').update(JSON.stringify(canonical(newValue)), 'utf8').digest('hex')).not.toBe(record.sha256);
      expect(conflict.expected_status).toBe(409);
    }
    expect(record.security_cases.map(c => c.expected_status)).toEqual([403, 404]);
  });

  it('keeps C0–C8 exactly byte-identical to the recorded base commit blobs', () => {
    expect(Object.keys(bundle.mock_fixture_blob_sha)).toHaveLength(9);
    for (let index = 0; index <= 8; index += 1) {
      const name = 'c' + index + '.json';
      const bytes = readFileSync(join(root, 'tests/fixtures/contracts', name));
      const digest = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
      expect(digest, name).toBe(bundle.mock_fixture_blob_sha[name]);
    }
  });
});
