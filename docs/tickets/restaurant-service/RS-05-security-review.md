# CON-05 security review for owner decision

Reviewed merge commit `a14b1640dce59f726d501ad6bcf83ad472fc2bc9` from [PR #82](https://github.com/anmolsansi/OrderlyApp/pull/82). Codex completed this source and test review. Recommendation: accept the synthetic identity-provider contract if the reviewer accepts the availability policy below. Formal approval and freeze remain pending.

## Findings

- **Key selection.** In [the verifier](../../../backend/app/staff_identity.py), `_key_id()` inspects the JOSE header before any key lookup. It requires RS256 and rejects key-bearing headers and critical extensions. Fetches use the server-configured HTTPS endpoint and refuse redirects. The later payload check is additional. I found no defect corresponding to Graphify's header concern.
- **Signature and identity.** Verification requires the configured issuer, expiration, not-before time, subject and allowed authorized party. The result contains only the subject. The [signature regression test](../../../backend/tests/test_staff_identity.py) demonstrates that the alternate signature is valid under its own key before asserting rejection under the selected key.
- **Availability decision.** A refresh has one five-second deadline shared by its callers. Once the deadline expires, the cache clears keys, rejects late results and returns 503 even for previously known keys. Each configured cache allows one outstanding worker per process. The deadline bounds caller waiting, but a stuck worker can keep that process unavailable indefinitely. Once a failed or abandoned worker exits, a 30-second retry cooldown applies. The unknown-key cooldown can also delay recognition of a legitimately rotated key. I found the implementation consistent with its documented fail-closed policy.
- **Coverage boundary.** Synthetic tests cover stalled connection and body reads, concurrent refreshes, key rotation, outages and provider error fields. The provider tests assert the shared 401/503 contract. Protected HTTP responses, membership authorization and absence of protected side effects belong to RS-06. Live Clerk operation was outside this review.

## Verification

The [post-merge push run](https://github.com/anmolsansi/OrderlyApp/actions/runs/45793851313) succeeded on the reviewed SHA with 357 backend tests passed, zero skips and one warning. Dependency scans reported zero known vulnerabilities. A separate local test attempt stopped during collection because the system Python lacked PyJWT.

The remaining decision on [issue #80](https://github.com/anmolsansi/OrderlyApp/issues/80) is whether the designated reviewer accepts the per-process outage and rotation behavior for this exact revision.
