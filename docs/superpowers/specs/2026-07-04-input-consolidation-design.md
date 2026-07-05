# Spec — Consolidation des inputs (donnée d'entrée propre)

**Date:** 2026-07-04 · **Statut:** validé (brainstorm) · **Périmètre:** ingestion (extract + facts + entités).

## But
Nettoyer et consolider la donnée **entrante**, en écho au travail sur les sorties LLM.
PennyLane exige une donnée bien structurée : parsing robuste, pas de faits dupliqués,
entités canoniques. Passe complète, **déterministe** (aucun embedder requis).

## Décisions (brainstorm)
Les 3 leviers : extract robuste + dédup des faits + canonicalisation des entités/champs.
Non-goal assumé : pas de case-folding des entités (on garde la casse des noms propres) ;
pas de dédup sémantique par embedding (nécessite un vrai embedder — lot séparé).

## Composants

### 1. Extract robuste
Les 3 impls réels (`ollama`, `claude`, `openai`) désérialisent l'`Extraction` via
`weave_llm::parse_json_lenient::<Extraction>` (strip fences/prose, objet équilibré) au lieu de
`serde_json::from_str` brut + `unfence`/`.trim()`. La logique de repli (thin/err → heuristique)
reste. Supprimer les helpers `unfence` locaux devenus inutiles.

### 2. Dédup des faits
- `weave_core::fact_dedup_key(topic: &str, content: &str) -> String` :
  `normalize_signature(topic)` + `"|"` + contenu normalisé (minuscules, espaces collapsés,
  tronqué à 200 chars). Deux formulations proches du même fait → même clé.
- Migration `0007` : `ALTER TABLE facts ADD COLUMN IF NOT EXISTS content_sig TEXT NOT NULL DEFAULT '';`
  puis un index unique **partiel** `CREATE UNIQUE INDEX IF NOT EXISTS uniq_facts_sig ON facts (project, content_sig) WHERE content_sig <> '';`
  (partiel pour ne pas faire échouer d'anciennes lignes à sig vide).
- `Fact` gagne `content_sig: String` (rempli par le pipeline via `fact_dedup_key`).
- `insert_fact` : `INSERT … ON CONFLICT (project, content_sig) DO NOTHING`, retourne
  `anyhow::Result<bool>` (true = inséré, false = doublon). Le conflit vise l'index partiel.
- Pipeline : calcule `content_sig`, appelle `insert_fact` ; **si false (doublon), ne pas
  émettre `FactExtracted` ni lancer la détection de pattern** pour ce fait.

### 3. Canonicalisation entités + champs
- `weave_core::normalize_entity_name(s: &str) -> String` : trim + espaces internes collapsés
  (casse conservée). Appliqué avant `upsert_entity` (et à `ensure_entity` pour les endpoints
  de relations). Merge "Bridge "/" Bridge".
- Trim des champs de faits à l'extraction (topic/author/content) dans le pipeline.

## Flux
event → extract (`parse_json_lenient`) → champs trimés → `content_sig = fact_dedup_key(topic, content)`
→ `insert_fact` (dédup) → si neuf : `FactExtracted` + détection pattern → skill/thème (déjà structuré).
Entités : `normalize_entity_name` avant upsert.

## Erreurs
Tout reste best-effort : parse échoué → repli heuristique (déjà en place) ; dédup ne casse
jamais l'ingest (un doublon est simplement ignoré).

## Tests (offline, DB fraîche, serial)
- `fact_dedup_key` : "Relancer la synchro ?" / "relancer synchro" (contenu proche) → même clé ;
  topics distincts → clés distinctes.
- `normalize_entity_name` : "  Bridge  Sync " → "Bridge Sync".
- Store : `insert_fact` deux fois même `content_sig` → 2ᵉ retourne `false`, une seule ligne.
- Store : deux faits `content_sig` vides → tous deux insérés (index partiel n'impose rien).
- LLM : extract via `parse_json_lenient` sur une réponse entourée de prose → Extraction non vide.
- Gate : clippy 0 warn ; suite complète serial DB fraîche.

## Ripple
Migration 0007 ; `Fact.content_sig` (core + store r/w) ; `insert_fact -> Result<bool>` + ses
appelants (pipeline, tests) ; 3 impls extract ; pipeline (dédup + trim + entity normalize).

## Hors-périmètre (lot suivant)
- Dédup sémantique par embedding (vrai embedder).
- Case-folding / résolution d'alias d'entités.
