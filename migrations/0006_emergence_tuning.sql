-- Free-text LLM theme per skill (replaces keyword domain clustering) and a
-- synthesized description per agent.
ALTER TABLE skills ADD COLUMN IF NOT EXISTS theme       TEXT NOT NULL DEFAULT '';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
