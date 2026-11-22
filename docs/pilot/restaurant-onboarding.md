# OrderlyApp — restaurant pilot onboarding, measurement and evidence checklist

**Status:** DOCUMENT TEMPLATE ONLY. No customer onboarded, paid pilot accepted, real account connected or live tenant activated. Source: [RF-02](../tickets/restaurant-service/RF-02.md) · [offer](restaurant-offer.md) · [RS-65](../tickets/restaurant-service/RS-65.md) · [development roadmap](../../development.md).

## 1. How to use this private-evidence checklist

The provider's project owner makes a **separate private copy per restaurant** after permission to engage. Keep this committed template empty of names, phone numbers, e-mails, signed offers, personal data, real menu secrets, contracts, invoices, provider keys, audio recordings and private test results. Store those in access-controlled records and link only an opaque evidence reference if needed.

**Checklist statuses:** NOT STARTED, PENDING OWNER APPROVAL, BLOCKED, VERIFIED, FAILED, NOT APPLICABLE WITH REASON. VERIFIED requires the named reviewer, UTC observation time, source/build or document revision, exact result and restricted evidence pointer; "said to be ready" is not verification. Record unresolved fields explicitly as **OWNER DECISION REQUIRED**.

### Confidential pilot header (fill privately, not in Git)

| Field | Entry |
|---|---|
| Pilot code / private folder pointer | **OWNER DECISION REQUIRED** |
| Restaurant legal entity, location and signatory | **OWNER DECISION REQUIRED** (private record only) |
| Provider legal entity and commercial representative | **OWNER DECISION REQUIRED** |
| Restaurant operations approver, backup, data owner and finance approver | **OWNER DECISION REQUIRED** |
| Provider implementation lead, technical operator, privacy owner and named support contact/backup | **OWNER DECISION REQUIRED** |
| Proposal revision / signed agreement pointer | **NOT RECORDED** |
| Approved live build / tenant / observation environment | **NOT RECORDED** |
| Pilot duration, review date and private evidence custodian | **OWNER DECISION REQUIRED** |

### Role and account ownership register

- [ ] Authorized restaurant owner confirms business entity, location, authorized commercial and technical approvers, and who can request changes.
- [ ] Provider owner identifies a named primary/backup support contact and approved support channel/window, never just an unmonitored mailbox.
- [ ] Restaurant and provider agree who owns the hosting account, domain, backups, incident notification channel and renewal costs. Document approved read-only/admin access and revocation owner.
- [ ] Restaurant marketing owner and provider operator approve MSG91/SendGrid account holder, sender, templates, regions, budgets/caps, billing route and restricted credential custody. **No real send before U2/U3 and RS-65 verification**.
- [ ] Restaurant data owner and provider privacy owner approve controller/processor responsibilities, opt-in evidence, storage, retention, export and deletion rules (U2).
- [ ] Restaurant signatory approves setup/service/extra support fees, pilot duration, invoice dates, taxes, support coverage and exit/handoff terms in [commercial offer](restaurant-offer.md). No amount is defaulted.
- [ ] Both owners keep synthetic demo identities separate from real staff/member authentication. Never give a guest a real owner or cashier role.

**Account approvals:** named restaurant signatory + provider commercial owner for payment; restaurant data owner + provider privacy owner for personal data; restaurant marketing owner + provider operator for external sends; restaurant operations lead + provider technical lead for devices/live readiness. Every such owner is currently **OWNER DECISION REQUIRED**.

