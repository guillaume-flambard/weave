#!/usr/bin/env bash
# Generate a warm ambient chord-progression music bed (C–G–Am–F), looped, reverbed.
# Replaceable: drop your own licensed track at public/music.mp3 instead.
set -euo pipefail
cd "$(dirname "$0")"
OUT="public/music.mp3"
TMP="$(mktemp -d)"
DUR=4  # seconds per chord

# chord = 3 detuned sine notes, gentle attack/release to avoid clicks
chord() {
  local f1=$1 f2=$2 f3=$3 out=$4
  ffmpeg -y -loglevel error \
    -f lavfi -i "sine=frequency=$f1:duration=$DUR" \
    -f lavfi -i "sine=frequency=$f2:duration=$DUR" \
    -f lavfi -i "sine=frequency=$f3:duration=$DUR" \
    -filter_complex "[0:a]volume=0.5[a];[1:a]volume=0.42[b];[2:a]volume=0.32[c];\
      [a][b][c]amix=inputs=3:normalize=0,afade=t=in:st=0:d=0.25,afade=t=out:st=$(echo "$DUR-0.4"|bc):d=0.4[o]" \
    -map "[o]" -ar 48000 -ac 2 "$out"
}

# C major, G major, A minor, F major (one octave, warm low register)
chord 130.81 164.81 196.00 "$TMP/c1.wav"   # C  E  G
chord 196.00 246.94 146.83 "$TMP/c2.wav"   # G  B  D
chord 220.00 261.63 164.81 "$TMP/c3.wav"   # A  C  E
chord 174.61 220.00 130.81 "$TMP/c4.wav"   # F  A  C

# concat progression (16s), loop to ~80s, reverb + warmth + tremolo, normalize, fades
printf "file '%s'\n" "$TMP/c1.wav" "$TMP/c2.wav" "$TMP/c3.wav" "$TMP/c4.wav" > "$TMP/list.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$TMP/list.txt" -c copy "$TMP/prog.wav"
ffmpeg -y -loglevel error -stream_loop 5 -i "$TMP/prog.wav" -t 80 \
  -af "lowpass=f=1100,highpass=f=60,aecho=0.8:0.8:80:0.35,tremolo=f=0.12:d=0.25,\
       loudnorm=I=-18:TP=-1.5:LRA=11,afade=t=in:st=0:d=3,afade=t=out:st=76:d=4" \
  -ar 48000 -ac 2 "$OUT"

rm -rf "$TMP"
ls -la "$OUT"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"
ffmpeg -hide_banner -i "$OUT" -af volumedetect -f null /dev/null 2>&1 | grep -E "mean_volume|max_volume"
