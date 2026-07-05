-- Canonical topic per fact: the stable pattern-signature anchor for free-text
-- sources (Discord/Slack) that don't carry a payload topic. Backfilled only for
-- new ingests; existing rows default to ''.
ALTER TABLE facts ADD COLUMN canonical_topic text NOT NULL DEFAULT '';
