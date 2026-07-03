CREATE TABLE IF NOT EXISTS connections (
    provider      text        NOT NULL,
    team_id       text        NOT NULL,
    access_token  bytea       NOT NULL,
    refresh_token bytea,
    expires_at    timestamptz,
    scopes        text        NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, team_id)
);
