# Spec — I/O LLM structurés & consolidés (données propres)

**Date:** 2026-07-04 · **Statut:** validé (brainstorm) · **Périmètre:** émergence (thèmes + agents + parsing).

## But
Rendre les entrées/sorties du LLM **strictement structurées, robustes à parser, et
consolidées**. Éliminer le bruit vu en prod : thèmes hasardeux/fragmentés, JSON qui parse
mal → noms fallback. PennyLane exige une donnée bien structurée ; c'est l'axe.

## Décisions (brainstorm)
- **Vocabulaire de domaines contrôlé** : `assign_theme` reçoit les domaines déjà présents du
  projet et **réutilise** un domaine existant s'il correspond, sinon en propose un nouveau
  normalisé. Consolide le vocabulaire, refait marcher le clustering.
- JSON strict + parsing tolérant partout ; normalisation canonique des thèmes ; nom d'agent
  normalisé en slug déterministe.

## Composants
### 1. `parse_json_lenient<T>` (weave-llm)
`pub fn parse_json_lenient<T: DeserializeOwned>(text: &str) -> anyhow::Result<T>` :
- retire les fences ```json … ``` ; trim ;
- isole la 1ʳᵉ accolade équilibrée `{ … }` si du texte entoure ;
- `serde_json::from_str`.
Réutilisé par extract, synthesize_agent, assign_theme. Remplace les `from_str` bruts.

### 2. `normalize` (weave-llm)
- `pub fn normalize_theme(s: &str) -> String` : trim, minuscules, espaces collapsés, ponctuation
  de bord retirée. **Accents gardés** (français). Vide → "".
- `pub fn slug(s: &str) -> String` : kebab-case ASCII-safe pour les noms d'agents.

### 3. `assign_theme` — signature + comportement
- Trait : `async fn assign_theme(&self, trigger: &str, body: &str, existing: &[String]) -> anyhow::Result<String>`.
- Réels (ollama/claude/openai) : `response_format json_object` ; prompt fournit `existing` et
  demande de réutiliser si pertinent ; parse `{"theme": string}` via `parse_json_lenient` ;
  applique `normalize_theme`. Échec → `normalize_theme(heuristic_theme(trigger))`.
- Mock (heuristic) : si un `existing` a un chevauchement de tokens avec le trigger, le réutiliser ;
  sinon `normalize_theme(heuristic_theme(trigger))`. Déterministe.

### 4. `synthesize_agent` — robuste
- `parse_json_lenient::<AgentSpec>` ; **valide** name/role/description non-vides ; sinon
  `heuristic_agent_spec`. `name` toujours passé par `slug()` (déterministe, pas le LLM brut).

### 5. Pipeline
- `detect_pattern_and_maybe_emerge` : calcule `existing = domaines distincts de store.skills(project)`
  puis `assign_theme(topic, body, &existing)`.
- `maybe_emerge_agent` inchangé (cluster par (team, theme) déjà normalisé). Le seuil reste
  env-tunable (`WEAVE_AGENT_EMERGE_THRESHOLD`) ; avec un vocabulaire consolidé il peut repasser à 2.

## Flux
event → extract (json lenient) → skill body → `existing` domaines → `assign_theme` (réutilise/
normalise) → skill.theme canonique → cluster (team, theme) → `synthesize_agent` (json lenient +
validé, name slug) → agent riche.

## Erreurs
Tout échec LLM/parse → repli déterministe (heuristique normalisée). Ne casse jamais l'ingest.

## Tests (offline, mock, DB fraîche, serial)
- `parse_json_lenient` : objet nu ; entouré de prose ; fences ```json ; invalide → err.
- `normalize_theme` : "  Gestion  Financière! " → "gestion financière" ; accents gardés.
- `slug` : "Réconciliation Data" → "reconciliation-data".
- `assign_theme` mock : `existing=["finance"]` + trigger finance → renvoie "finance" (réutilise).
- `synthesize_agent` : JSON entouré de prose → parse OK ; JSON vide → fallback heuristique.
- Gate : clippy 0 warn ; suite complète serial DB fraîche.

## Hors-périmètre (flag, lot suivant)
- Canonicalisation des **facts** (topics, dédup sémantique).
- Un vrai embedder (routing sémantique) — Groq n'a pas d'embeddings.
