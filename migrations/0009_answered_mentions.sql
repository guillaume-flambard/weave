-- Dedup ledger for the @mention responder: a mention we've already replied to
-- is never answered again across poll cycles.
CREATE TABLE IF NOT EXISTS answered_mentions (
    provider    text NOT NULL,
    message_id  text NOT NULL,
    answered_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, message_id)
);
