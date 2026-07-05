-- Deterministic fact dedup: a content signature per fact, unique within a project.
-- Partial index so legacy rows with an empty signature don't collide.
ALTER TABLE facts ADD COLUMN IF NOT EXISTS content_sig TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_facts_sig
    ON facts (project, content_sig) WHERE content_sig <> '';
