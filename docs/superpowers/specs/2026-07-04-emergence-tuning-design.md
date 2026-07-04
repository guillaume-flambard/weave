# Spec — Tuning émergence : agents riches, domaines larges, zéro hardcode

**Date:** 2026-07-04 · **Statut:** validé (brainstorm) · **Périmètre:** émergence d'agents.

## But
Rendre les agents émergents **riches** (nom + mandat + description synthétisés, pas
templatés) et l'émergence **large** (n'importe quel thème récurrent, plus les 6 familles
keyword). **Supprimer tout le hardcode de domaine** (`classify_domain` + ses `FAMILIES`),
côté clustering ET routing.

## Ce qu'on enlève
- `weave_core::classify_domain` + la constante `FAMILIES` (6 domaines keyword) + ses tests.
- Ses 2 usages : clustering (`maybe_emerge_agent`) et routing (`find_specialist`).

Hors périmètre (flaggé, autre lot) : `infer_memory_level` (keywords convention/policy) —
autre heuristique hardcodée, touche le schéma `extract` des 4 LLM, traité séparément.

## Nouveau modèle
1. **Thème sémantique par skill.** À la naissance d'un skill, le LLM lui assigne un
   **thème** court en texte libre (`assign_theme`). Stocké : `skills.theme`.
2. **Clustering par (équipe, thème).** `maybe_emerge_agent` groupe les skills d'une équipe
   par thème ; ≥ `AGENT_EMERGE_THRESHOLD` (2) skills même thème → un agent.
3. **Identité synthétisée.** `synthesize_agent(team, theme, skills)` → `{ name, role,
   description }` riches, depuis les triggers+bodies du cluster. `agents.description` ajouté ;
   `agents.domain` porte le thème.
4. **Routing sémantique.** `find_specialist` : embed la tâche, embed `(role+description+
   theme)` de chaque agent actif non-général, cosinus en Rust, meilleur ≥ seuil → délègue.
   Plus d'égalité de domaine keyword. Embeddings calculés à la volée (peu d'agents).
5. **Idempotence.** Clé = `(team, theme)`. Si un agent existe déjà pour ce couple
   (`team == t && domain == theme`), on ne recrée pas. Le nom riche n'affecte pas la dédup.

## Interfaces
- `LlmGateway::assign_theme(&self, trigger: &str, body: &str) -> anyhow::Result<String>`
- `LlmGateway::synthesize_agent(&self, team: &str, theme: &str, skills: &[SkillBrief])
  -> anyhow::Result<AgentSpec>` où `SkillBrief { name, trigger, body }`,
  `AgentSpec { name, role, description }`.
- Implémentées dans les **4** impls : `ollama`, `claude`, `openai` (prompt réel),
  `heuristic` (mock déterministe offline).

## Mock offline (heuristic.rs)
- `assign_theme` : réduction déterministe du trigger (thème = 1–2 tokens significatifs
  normalisés), **sans liste de domaines figée**. Coarse mais regroupe des skills proches.
- `synthesize_agent` : `name = "agent-" + slug(theme)`, `role`/`description` composés depuis
  les skills du cluster. Déterministe (les tests en dépendent).
- ⚠️ L'émergence d'agents **offline** dépend de skills seed partageant un thème coarse.
  Vérifier avec le seed ; ajuster la réduction du mock si aucun agent n'émerge offline.

## Schéma (migration 0006)
- `ALTER TABLE skills  ADD COLUMN IF NOT EXISTS theme       TEXT NOT NULL DEFAULT '';`
- `ALTER TABLE agents  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';`
- Structs core : `Skill.theme: String`, `Agent.description: String`. Store read/write MAJ.

## Flux
- **Skill emergence** (`detect_pattern_and_maybe_emerge`) : après synthèse du body,
  `theme = llm.assign_theme(trigger, body)` ; persister sur le skill.
- **Agent emergence** (`maybe_emerge_agent`) : clusters `(team, theme)` ; par cluster ≥2 non
  déjà couvert → `spec = llm.synthesize_agent(...)` → insert `Agent { name: spec.name,
  role: spec.role, description: spec.description, domain: theme, skills, status: Pending }`.
- **Routing** (`find_specialist`) : embedding cosinus tâche↔agents actifs.

## Erreurs
`assign_theme`/`synthesize_agent` qui échouent ne doivent pas casser l'ingest : sur erreur,
logger + repli (`theme=""` → pas de clustering pour ce skill ; agent non créé ce tour).

## Tests (offline, mock, DB fraîche, serial)
- `assign_theme` mock : déterministe, non vide pour un trigger réel.
- `synthesize_agent` mock : renvoie name/role/description non vides depuis des skills.
- Pipeline : 2 skills même thème (même équipe) → 1 agent riche `Pending` (name ≠ template,
  description non vide). 3ᵉ skill même thème → pas de doublon (idempotence).
- Routing : tâche proche d'un agent actif → `find_specialist` le renvoie ; tâche hors-sujet
  → `None`.
- Core : supprimer les tests `classify_domain`.
- Gate : clippy 0 warn ; suite complète serial DB fraîche.

## Hors-périmètre (suivant)
- `infer_memory_level` LLM-driven (retirer les keywords).
- Embedding d'agent stocké (colonne) si le nb d'agents grossit (routing à la volée suffit MVP).
- Skills → Notion (déjà noté ailleurs).
