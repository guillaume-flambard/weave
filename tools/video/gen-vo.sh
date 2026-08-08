#!/usr/bin/env bash
# Generate French neural voice-over per scene with edge-tts (Microsoft, free, no key),
# convert to wav, report durations. Much higher quality than macOS `say`.
# Usage: ./gen-vo.sh
set -euo pipefail
cd "$(dirname "$0")"
VOICE="fr-FR-HenriNeural"   # warm male FR neural; alt: fr-FR-DeniseNeural (female)
RATE="-4%"                  # slightly calmer than default
OUT="public/vo"
mkdir -p "$OUT"

declare -a IDS=(s1 s2 s3 s4 s5)
declare -a TEXTS=(
"Chez Pennylane, plus de quatre cents agents I A. Un par personne. Un par tâche."
"Mais chaque agent vit seul. Impossible de partager une compétence à toute une équipe. Et sans données propres, l'agent répond n'importe quoi."
"L'idéal ? Des compétences disponibles par défaut. Pour tout le monde. Avec tout le contexte. Sans que chacun recrée son agent."
"Weave, c'est exactement ça. Un cognitive runtime. Les compétences émergent, se partagent, et vivent là où vos équipes travaillent. Slack. Discord. Notion. Une mémoire commune, un contexte partagé."
"Le niveau trois. Par défaut. Voici Weave en action. Parlons-en."
)

echo "[" > "$OUT/durations.json"
for i in "${!IDS[@]}"; do
  id="${IDS[$i]}"; txt="${TEXTS[$i]}"
  uvx edge-tts --voice "$VOICE" --rate="$RATE" --text "$txt" --write-media "$OUT/$id.mp3" >/dev/null 2>&1
  ffmpeg -y -loglevel error -i "$OUT/$id.mp3" -ar 48000 -ac 2 "$OUT/$id.wav"
  rm -f "$OUT/$id.mp3"
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$id.wav")
  sep=","; [ "$i" -eq $(( ${#IDS[@]} - 1 )) ] && sep=""
  echo "  {\"id\":\"$id\",\"dur\":$dur}$sep" >> "$OUT/durations.json"
  printf "%s  %ss\n" "$id" "$dur"
done
echo "]" >> "$OUT/durations.json"
echo "--- wrote $OUT/durations.json ---"
