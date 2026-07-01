#!/usr/bin/env bash
# Weave eval harness — measures extraction coverage, emergence, and provenance
# against a running API. Provider-comparable: run it against a server started
# with different WEAVE_LLM_PROVIDER / WEAVE_EMBED_PROVIDER to compare.
#
#   ./scripts/eval.sh            # uses http://127.0.0.1:8787, project pennylane
#   API=... PROJECT=... ./scripts/eval.sh
set -euo pipefail

API="${API:-http://127.0.0.1:8787}"
PROJECT="${PROJECT:-pennylane}"

echo "▶ Weave eval · $API · project=$PROJECT"
curl -s -X POST "$API/reset" >/dev/null
curl -s -X POST "$API/replay" >/dev/null

# Poll /stats until facts count is stable for two consecutive reads.
prev=-1; stable=0
for _ in $(seq 1 60); do
  sleep 4
  facts=$(curl -s "$API/stats?project=$PROJECT" | python3 -c "import sys,json;print(json.load(sys.stdin)['facts'])" 2>/dev/null || echo 0)
  if [ "$facts" = "$prev" ] && [ "$facts" != "0" ]; then
    stable=$((stable+1)); [ "$stable" -ge 2 ] && break
  else
    stable=0
  fi
  prev=$facts
done

STATS=$(curl -s "$API/stats?project=$PROJECT")
ANSWER=$(curl -s -X POST "$API/ask" -H 'content-type: application/json' \
  -d "{\"project\":\"$PROJECT\",\"question\":\"Comment relancer la synchro bancaire ?\"}")

python3 - "$STATS" "$ANSWER" <<'PY'
import sys, json
stats = json.loads(sys.argv[1]); ans = json.loads(sys.argv[2])
events = stats.get("events", 0); facts = stats.get("facts", 0)
skills = stats.get("skills", []); agents = stats.get("agents", [])
cov = round(facts / events, 2) if events else 0.0
layers = [l["level"] for l in ans.get("layers", [])]

print(f"\n  moteur LLM ............. {stats.get('llm')}")
print(f"  événements ingérés ..... {events}")
print(f"  faits extraits ......... {facts}  ({cov} faits/événement)")
print(f"  entités / relations .... {stats.get('entities',0)} / {stats.get('relationships',0)}")
print(f"  compétences émergées ... {skills}")
print(f"  agents ................. {[(a['name'], a['status']) for a in agents]}")
print(f"  réponse agent .......... skill={ans.get('skill_used')}  couches={layers}")

checks = {
  "≥1 événement ingéré": events > 0,
  "extraction non vide (coverage>0)": facts > 0,
  "skill synchro bancaire émergée": any("bancaire" in s for s in skills),
  "skill webhook stripe émergée": any("stripe" in s for s in skills),
  "agent finance-ops émergé": any("finance-ops" in a["name"] for a in agents),
  "réponse via skill (provenance)": ans.get("skill_used") is not None,
  "couches mémoire présentes": len(layers) >= 1,
}
print("\n  Vérifications :")
ok = True
for name, passed in checks.items():
    print(f"    {'✓' if passed else '✗'} {name}")
    ok = ok and passed
print(f"\n  RÉSULTAT : {'PASS ✅' if ok else 'FAIL ❌'}\n")
sys.exit(0 if ok else 1)
PY
