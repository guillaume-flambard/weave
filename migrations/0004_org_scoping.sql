-- Multi-team / multi-project scoping + org configuration.
-- The `project` column across tables is the ORG (tenant) partition key.
-- `team` and `workstream` locate an item within the org.

ALTER TABLE facts  ADD COLUMN IF NOT EXISTS team       TEXT NOT NULL DEFAULT '';
ALTER TABLE facts  ADD COLUMN IF NOT EXISTS workstream TEXT NOT NULL DEFAULT '';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS team       TEXT NOT NULL DEFAULT '';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS workstream TEXT NOT NULL DEFAULT '';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS team       TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_facts_workstream ON facts (project, workstream);
CREATE INDEX IF NOT EXISTS idx_skills_workstream ON skills (project, workstream);

-- Current org configuration per tenant (teams, projects, people).
CREATE TABLE IF NOT EXISTS org_config (
    org        TEXT PRIMARY KEY,
    config     JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
