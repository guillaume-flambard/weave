-- Move fact embeddings to 768 dimensions (nomic-embed-text / hash embedder).
-- Demo embeddings are dropped; a reset+replay regenerates them.

ALTER TABLE facts DROP COLUMN IF EXISTS embedding;
ALTER TABLE facts ADD COLUMN embedding vector(768);
