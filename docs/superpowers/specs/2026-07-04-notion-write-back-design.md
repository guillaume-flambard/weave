# Spec — Notion write-back (agents émergents → Notion)

**Date:** 2026-07-04 · **Statut:** validé (brainstorm) · **Périmètre:** agents seulement.

## But
Fermer la boucle produit : quand un agent émergent est **approuvé** dans Weave, l'écrire
automatiquement dans une database Notion "Weave Agents". Rend visible dans l'outil de
l'utilisateur ce que Weave a appris. Codable et testable **sans connexion** (wiremock).

## Décisions (brainstorm)
- **Cible** : database dédiée "Weave Agents", créée/maintenue par Weave sous une page
  accessible à l'intégration.
- **Déclencheur** : auto **à l'approbation** (`POST /agents/approve`).
- **Échec** : **best-effort** — l'approbation réussit toujours ; échec Notion loggé et
  remonté dans la réponse (`notion: "failed"`). Jamais bloquant.
- **Idempotence** : propriété `WeaveId` = UUID agent → upsert (query → update/create).

## Architecture
Nouveau module `crates/weave-ingest/src/notion_write.rs` : `NotionWriter`, à côté du
`NotionConnector` read. Réutilise le pattern client (reqwest, `bearer_auth`,
`Notion-Version`). Une responsabilité : `upsert_agent(agent) -> Result<NotionOutcome>`.

Découpage en unités testables isolément :
- `build_agent_properties(&Agent) -> serde_json::Value` — pur, mappe l'agent → propriétés Notion.
- `database_schema() -> serde_json::Value` — pur, schéma de la DB.
- `find_row_id(query_resp, uuid) -> Option<String>` — pur, extrait le page_id existant.
- `NotionWriter::{resolve_parent, ensure_database, upsert_agent}` — réseau, wiremock.

## Mécanique Notion (API v1)
1. **Parent** : `NOTION_PARENT_PAGE_ID` si défini ; sinon 1ʳᵉ page de `POST /search`
   (filtre `object=page`). Aucune page accessible → erreur `no_parent`.
2. **Ensure DB** : `POST /search` (filtre database) cherche une DB titrée "Weave Agents"
   sous le parent ; absente → `POST /databases` avec le schéma :
   `Name` (title), `Role` (rich_text), `Domain` (select), `Status` (select),
   `Skills` (multi_select), `Source` (rich_text), `WeaveId` (rich_text).
3. **Upsert** : `POST /databases/{id}/query` filtre `WeaveId == agent.id` →
   trouvé = `PATCH /pages/{page_id}` ; sinon `POST /pages` (parent = database_id).

## Flux (API)
`approve_agent` :
1. `set_agent_status(... Active)` (existant).
2. Charge l'`Agent` (via `AgentStore::agents(project)` → find by name).
3. `get_active_connection(cipher, "notion")` :
   - absente → réponse `notion: "not_connected"`.
   - présente → `NotionWriter::new(token).upsert_agent(&agent)` **inline** :
     - ok → `notion: "written"`.
     - err → log `error!` + `notion: "failed"`.
4. Réponse : `{ "status": "active", "name", "project", "notion": <état> }`. Toujours 200.

## Erreurs
Best-effort : toute erreur Notion (token révoqué, pas de parent, API 4xx/5xx) est loggée
et n'empêche jamais l'approbation. Surface via le champ `notion`.

## Tests (offline, zéro connexion)
- **Unit (purs)** : `build_agent_properties` produit le JSON attendu (title/select/multi_select) ;
  `find_row_id` trouve/ne trouve pas ; `database_schema` bien formé.
- **Wiremock (`weave-ingest`)** : `ensure_database` crée quand absente / réutilise quand présente ;
  `upsert_agent` fait `POST /pages` (create) puis `PATCH` (update) sur second appel.
- **API (`weave-api`)** : `approve_agent` → `notion:"not_connected"` sans connexion ;
  avec connexion Notion mockée → writer appelé, `notion:"written"`, statut agent = active.
- Gate : suite serial, DB fraîche, 0 warn (clippy).

## Hors-périmètre (suivant)
- Skills → Notion (ce lot = agents seulement).
- Passe UX dédiée du parcours connect (item #4, avec le skill ui-ux-pro-max).
- Cache du database_id (re-discover par push suffit au volume MVP).
