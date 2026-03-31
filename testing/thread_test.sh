#!/usr/bin/env bash
set -eu

RID="rad:zyAM8wXNAXZh3423qneGMsCu5wAy"
HOST_IP="${HOST_IP:-172.17.0.1}"
HOST_NODE_ID="z6Mko6jDPmLevohDAU7tzHPsZV7kmeWBjK5tiv57cxrKPHZC"

log() { echo "==> $*"; }

# Extract issue ID (40-char OID from "│ Issue   <oid>" line)
issue_id() { grep 'Issue' | grep -oE '[0-9a-f]{40}' | head -1; }

# Extract comment ID (7-char OID from "│ author (you) <time> <id>" line)
comment_id() { grep '(you)' | grep -oE '[0-9a-f]{7}' | tail -1; }

# ── 1. Identity ────────────────────────────────────────────────────────────────

log "Starting SSH agent..."
eval $(ssh-agent -s)

log "Creating tester identity..."
echo "" | rad auth --alias tester --stdin

git config --global user.name "tester"
git config --global user.email "tester@radicle.xyz"
git config --global init.defaultBranch master

# ── 2. Node ────────────────────────────────────────────────────────────────────

log "Starting radicle node..."
rad node start

for i in $(seq 1 15); do
    rad node status 2>/dev/null | grep -q "running" && break
    sleep 1
done

log "Connecting to host node..."
rad node connect "$HOST_NODE_ID@$HOST_IP:8776" 2>/dev/null || true
sleep 3

# ── 3. Clone repo ──────────────────────────────────────────────────────────────

log "Seeding and cloning repo..."
rad seed "$RID"
sleep 5
rad clone "$RID" /workspace/repo
cd /workspace/repo

# ── 4. Create issue with threaded comments ─────────────────────────────────────

log "Creating issue..."
ISSUE=$(rad issue open \
    --title "Review: inbox expand UX feedback" \
    --description "$(printf 'Tried the new expandable notification rows — overall very nice. A few observations:\n\n- The popover description is a great touch\n- Reply buttons now visible on all comments\n- Nested threading looks clean\n\nOne thing: the reply form should auto-scroll into view when opened below a long comment thread.')" \
    2>&1 | issue_id)
echo "   issue: $ISSUE"

sleep 1

log "Adding top-level comments..."

C_A=$(rad issue comment "$ISSUE" \
    -m "The expand chevron was too small to target. Good that the whole row acts as toggle now." \
    2>&1 | comment_id)
echo "   A: $C_A"
sleep 1

C_B=$(rad issue comment "$ISSUE" \
    -m "Popover positioning with position:fixed + getBoundingClientRect is correct. The previous absolute positioning was clipped by overflow:auto on the list wrapper." \
    2>&1 | comment_id)
echo "   B: $C_B"
sleep 1

C_C=$(rad issue comment "$ISSUE" \
    -m "The 120ms hide delay feels right — long enough to move mouse to the popover, short enough not to feel sluggish." \
    2>&1 | comment_id)
echo "   C: $C_C"
sleep 1

log "Adding replies..."

C_A1=$(rad issue comment "$ISSUE" --reply-to "$C_A" \
    -m "Confirmed: clicking anywhere on the row header now toggles expand. Also the Open button in row actions is a good escape hatch for the full view." \
    2>&1 | comment_id)
echo "   A->A1: $C_A1"
sleep 1

# Reply to A1 (depth 2)
rad issue comment "$ISSUE" --reply-to "$C_A1" \
    -m "Also works great with keyboard — Esc goes back to inbox from issue or patch view." 2>&1 || true
sleep 1

C_B1=$(rad issue comment "$ISSUE" --reply-to "$C_B" \
    -m "One edge case: if the row is near the top of viewport the popover goes off-screen upward. Should flip below the row in that case." \
    2>&1 | comment_id)
echo "   B->B1: $C_B1"
sleep 1

# Reply to B1 (depth 2)
rad issue comment "$ISSUE" --reply-to "$C_B1" \
    -m "Fix: compare popoverPos.top with a threshold and flip the popover below the row when too close to the top." 2>&1 || true
sleep 1

rad issue comment "$ISSUE" --reply-to "$C_C" \
    -m "Agree. I would go 80ms — snappier without losing the ability to move to the popover." 2>&1 || true

# ── 5. Sync ────────────────────────────────────────────────────────────────────

log "Syncing..."
rad sync --announce 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done! On your host run:"
echo "    rad sync rad:zyAM8wXNAXZh3423qneGMsCu5wAy --fetch"
echo "  Then Refresh in radboard inbox."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
