-- Agents: roles that act on the shared memory. Predefined or emergent.

CREATE TABLE IF NOT EXISTS agents (
    id           UUID PRIMARY KEY,
    project      TEXT        NOT NULL,
    name         TEXT        NOT NULL,
    role         TEXT        NOT NULL,
    domain       TEXT        NOT NULL DEFAULT 'general',
    skills       TEXT[]      NOT NULL DEFAULT '{}',
    scope        TEXT        NOT NULL DEFAULT 'project',
    status       TEXT        NOT NULL DEFAULT 'active',   -- active | pending
    derived_from TEXT        NOT NULL DEFAULT 'predefined',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project, name)
);
CREATE INDEX IF NOT EXISTS idx_agents_project ON agents (project, status);
