-- Weave Cognitive Runtime — core schema (MVP)
-- One Postgres does everything: relational data, vectors (pgvector),
-- full-text (tsvector), and graph (edge rows + recursive CTE).

CREATE EXTENSION IF NOT EXISTS vector;

-- Immutable event log (event-sourced). content_hash gives idempotent dedup.
CREATE TABLE IF NOT EXISTS events (
    id           UUID PRIMARY KEY,
    source       TEXT        NOT NULL,          -- slack | github | notion | ...
    ts           TIMESTAMPTZ NOT NULL,
    actor        TEXT        NOT NULL,
    project      TEXT        NOT NULL,
    kind         TEXT        NOT NULL,          -- message | pr | doc_edit | ...
    payload      JSONB       NOT NULL,
    confidence   REAL        NOT NULL DEFAULT 1.0,
    content_hash TEXT        NOT NULL UNIQUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_project ON events (project, ts);

-- Entities (graph nodes).
CREATE TABLE IF NOT EXISTS entities (
    id         UUID PRIMARY KEY,
    project    TEXT        NOT NULL,
    name       TEXT        NOT NULL,
    kind       TEXT        NOT NULL,            -- person | component | service | ...
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project, name, kind)
);

-- Relationships (graph edges).
CREATE TABLE IF NOT EXISTS relationships (
    id         UUID PRIMARY KEY,
    project    TEXT        NOT NULL,
    src        UUID        NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    dst        UUID        NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    rel        TEXT        NOT NULL,            -- owns | depends_on | works_on | ...
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project, src, dst, rel)
);
CREATE INDEX IF NOT EXISTS idx_rel_src ON relationships (src);

-- Atomic facts extracted from events. embedding = pgvector, fts = tsvector (BM25-ish).
CREATE TABLE IF NOT EXISTS facts (
    id            UUID PRIMARY KEY,
    event_id      UUID        REFERENCES events (id) ON DELETE SET NULL,
    project       TEXT        NOT NULL,
    ftype         TEXT        NOT NULL,         -- decision | question | answer | fact
    author        TEXT        NOT NULL,
    topic         TEXT        NOT NULL,
    content       TEXT        NOT NULL,
    confidence    REAL        NOT NULL DEFAULT 0.8,
    memory_level  TEXT        NOT NULL DEFAULT 'project',
    embedding     VECTOR(256),
    fts           TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', topic || ' ' || content)) STORED,
    superseded_by UUID        REFERENCES facts (id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_facts_project ON facts (project);
CREATE INDEX IF NOT EXISTS idx_facts_fts ON facts USING GIN (fts);
CREATE INDEX IF NOT EXISTS idx_facts_topic ON facts (project, topic);

-- Detected patterns (recurring signatures across facts).
CREATE TABLE IF NOT EXISTS patterns (
    id          UUID PRIMARY KEY,
    project     TEXT        NOT NULL,
    signature   TEXT        NOT NULL,           -- normalized topic/intent key
    kind        TEXT        NOT NULL,           -- recurring_question | workflow | ...
    occurrences INT         NOT NULL DEFAULT 1,
    fact_ids    UUID[]      NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project, signature)
);

-- Skills materialized automatically from patterns. This is the hero output.
CREATE TABLE IF NOT EXISTS skills (
    id                   UUID PRIMARY KEY,
    project              TEXT        NOT NULL,
    name                 TEXT        NOT NULL,
    trigger              TEXT        NOT NULL,
    body                 TEXT        NOT NULL,
    sources              UUID[]      NOT NULL DEFAULT '{}',
    referents            TEXT[]      NOT NULL DEFAULT '{}',
    derived_from_pattern UUID        REFERENCES patterns (id) ON DELETE SET NULL,
    memory_level         TEXT        NOT NULL DEFAULT 'project',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project, name)
);
