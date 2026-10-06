
## 2026-10-06 cache boundary check

Versioned local preview baskets and failed API drafts reject more than 50 lines,
repeated line IDs and instructions longer than 500 characters on read. Invalid
cache data returns an empty presentation cache without deleting that record or
unrelated browser storage. API carts remain authoritative. The parameterized
persisted-cache regression reproduces all three failures before the shared
parser fix and passes afterward.
