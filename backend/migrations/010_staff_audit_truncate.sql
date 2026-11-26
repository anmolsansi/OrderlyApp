-- Additive defense in depth; applied migration 009 is unchanged.
CREATE TRIGGER live_membership_audit_no_truncate
    BEFORE TRUNCATE ON live_membership_audit
    FOR EACH STATEMENT EXECUTE FUNCTION live_reject_history_mutation();
REVOKE ALL ON live_membership_audit FROM PUBLIC;
