# Weave — Hardening Sprint (2 semaines)

## Objectif
Faire passer `weave` de **démo forte** à **prototype durci et crédible pour pilote encadré**.

---

## Semaine 1 — Backend/API hardening

### Jour 1 — Corriger le scoping API
- [ ] Auditer tous les handlers de `weave/crates/weave-api/src/main.rs`
- [ ] Corriger `approve_agent` pour utiliser un `project` explicite
- [ ] Corriger `/reset` pour permettre un reset scoped par projet
- [ ] Revoir `/ingest/slack` :
  - [ ] soit ajouter `project`
  - [ ] soit le marquer explicitement “mode démo”
- [ ] Vérifier la cohérence `DEFAULT_PROJECT` vs query param vs body JSON
- [ ] Vérifier que toutes les routes mutatives utilisent le bon scope projet
- [ ] Lancer `cargo check`
- [ ] Tester les routes corrigées manuellement avec `curl`

**Done when:**
- aucune route critique n’agit par erreur sur `DEFAULT_PROJECT`

---

### Jour 2 — Ajouter une sécurité API minimale
- [ ] Restreindre CORS via configuration
- [ ] Ajouter une auth simple pour l’API
  - [ ] `Authorization: Bearer ...` ou `X-API-Key`
- [ ] Protéger les routes mutatives :
  - [ ] `/reset`
  - [ ] `/org/load`
  - [ ] `/org` `PUT`
  - [ ] `/simulate`
  - [ ] `/inject`
  - [ ] `/agents/approve`
  - [ ] `/agents/run`
  - [ ] `/ingest/slack`
  - [ ] `/mcp` si nécessaire
- [ ] Ne plus renvoyer les erreurs internes brutes au client
- [ ] Vérifier qu’une requête sans auth échoue
- [ ] Vérifier qu’une requête avec auth réussit

**Done when:**
- les endpoints critiques ne sont plus publics
- les erreurs 500 ne leakent plus de détails internes

---

### Jour 3 — Ajouter des tests d’intégration `PgStore`
- [ ] Créer une suite de tests d’intégration DB
- [ ] Tester les migrations
- [ ] Tester `insert_event` + dédup
- [ ] Tester `reset(project)`
- [ ] Tester `insert_fact` + `recent_facts`
- [ ] Tester `observe` sur les patterns
- [ ] Tester `insert_skill` + unicité
- [ ] Tester `insert_agent` + `set_agent_status`
- [ ] Tester `save_org_config` + `get_org_config`
- [ ] Documenter comment lancer les tests DB

**Done when:**
- les chemins critiques du store concret sont couverts

---

### Jour 4 — Ajouter des tests API Axum
- [ ] Créer une suite de tests API
- [ ] Tester `/health`
- [ ] Tester `/stats`
- [ ] Tester `/facts`
- [ ] Tester `/skills`
- [ ] Tester `/ask`
- [ ] Tester `/agents`
- [ ] Tester `/agents/approve`
- [ ] Tester `/reset`
- [ ] Tester `/inject`
- [ ] Vérifier les status codes
- [ ] Vérifier les JSON de réponse
- [ ] Vérifier auth + scoping projet

**Done when:**
- les endpoints principaux sont validés automatiquement

---

### Jour 5 — Fiabiliser le feedback frontend
- [ ] Supprimer les `catch {}` silencieux du flow principal
- [ ] Ajouter un message d’erreur visible dans l’UI
- [ ] Ajouter état pending pour :
  - [ ] `simulate`
  - [ ] `reset`
  - [ ] `ask`
  - [ ] `inject`
  - [ ] `approveAgent`
  - [ ] `switchOrg`
- [ ] Gérer explicitement le cas API hors ligne
- [ ] Vérifier le comportement frontend si l’API retourne 500

**Done when:**
- une erreur réseau ou backend est visible et compréhensible côté UI

---

## Semaine 2 — Frontend structure + validation + CI

### Jour 6 — Extraire le data layer frontend
- [x] Créer `weave/apps/web/lib/api.ts`
- [x] Créer `weave/apps/web/lib/types.ts`
- [x] Créer `weave/apps/web/hooks/use-weave-dashboard.ts`
- [ ] Créer `weave/apps/web/hooks/use-weave-events.ts` si utile
- [x] Déplacer les appels `fetch` dans `api.ts`
- [x] Déplacer les types locaux hors de `page.tsx`
- [x] Réduire significativement la taille de `page.tsx`
- [ ] Vérifier que le comportement reste identique

**Done when:**
- le réseau et les types ne vivent plus dans `page.tsx`

---

### Jour 7 — Extraire les composants UI
- [ ] Créer `TopBar`
- [ ] Créer `ScopeBar`
- [ ] Créer `FeedPanel`
- [ ] Créer `MemoryPanel`
- [ ] Créer `SkillsPanel`
- [ ] Créer `AgentsPanel`
- [ ] Créer `AskPanel`
- [ ] Laisser `page.tsx` comme composition de haut niveau
- [ ] Vérifier que le rendu final n’a pas régressé

**Done when:**
- `page.tsx` devient un orchestrateur de page, plus un monolithe

---

### Jour 8 — Ajouter un test E2E du flow principal
- [x] Installer/configurer Playwright
- [ ] Écrire un scénario principal :
  - [x] ouvrir l’app
  - [ ] charger preset
  - [ ] simuler l’activité
  - [ ] attendre une skill émergée
  - [ ] poser une question
  - [ ] vérifier réponse + provenance
- [x] Ajouter éventuellement un smoke test secondaire
- [x] Documenter comment lancer les E2E

**Done when:**
- le flow principal de la démo est validé automatiquement

---

### Jour 9 — Ajouter une CI minimale
- [x] Ajouter workflow CI
- [x] Lancer `cargo check`
- [x] Lancer `cargo test`
- [x] Lancer build frontend
- [x] Ajouter tests API/intégration si possible
- [ ] Ajouter smoke E2E si l’environnement le permet
- [ ] Vérifier qu’un échec bloque bien la pipeline

**Done when:**
- chaque changement important passe par une validation automatique minimale

---

### Jour 10 — Observabilité légère + docs alignées
- [x] Ajouter des logs plus explicites sur :
  - [x] `reset`
  - [x] `simulate`
  - [x] `inject`
  - [x] `ask`
  - [x] `approve_agent`
  - [x] `run_agent`
- [x] Mettre à jour `README.md`
- [ ] Mettre à jour la doc d’audit si besoin
- [x] Documenter :
  - [x] mode auth
  - [x] variables d’environnement
  - [x] lancement tests
  - [x] flow de validation
  - [ ] limites restantes connues

**Done when:**
- un autre dev peut lancer le projet et comprendre l’état réel du système

---

# Top 5 priorités absolues
Si le temps manque :

- [ ] Corriger le scoping API
- [ ] Ajouter auth + CORS minimum
- [ ] Ajouter tests d’intégration `PgStore`
- [ ] Ajouter tests API
- [ ] Rendre les erreurs frontend visibles

---

# Critères de succès fin de sprint

## Backend/API
- [ ] plus de route critique hardcodée sur `DEFAULT_PROJECT`
- [ ] auth minimale en place
- [ ] CORS restreint
- [ ] erreurs internes non exposées brut
- [ ] tests store/API verts

## Frontend
- [ ] plus de `catch {}` silencieux sur le flow principal
- [ ] feedback d’erreur visible
- [x] `page.tsx` nettement allégé
- [x] composants/hooks extraits

## Validation
- [ ] flow E2E principal passe
- [x] smoke E2E configuré
- [ ] CI minimale verte
- [x] workflow CI minimal ajouté

## Produit
- [ ] démo toujours fluide
- [x] docs réalignées avec l’état réel

---

# Risques à éviter
- [ ] ne pas sur-refactorer le frontend trop tôt
- [ ] ne pas perdre 3 jours sur une auth trop lourde
- [ ] ne pas repousser les tests DB/API au profit de tâches plus “visibles”
- [ ] ne pas casser la démo pendant le refactor sans filet de validation
