#!/usr/bin/env bash
set -euo pipefail

RID="rad:zyAM8wXNAXZh3423qneGMsCu5wAy"
HOST_IP="${HOST_IP:-172.17.0.1}"
HOST_NODE_ID="z6Mko6jDPmLevohDAU7tzHPsZV7kmeWBjK5tiv57cxrKPHZC"
MAIN_ISSUE_ID="586feea7115b34f3775408a53ccbc8b92e83093e"

log() { echo "==> $*"; }

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

log "Waiting for node to be ready..."
for i in $(seq 1 10); do
    rad node status 2>/dev/null | grep -q "running" && break
    sleep 1
done

log "Connecting to host node ($HOST_NODE_ID @ $HOST_IP:8776)..."
rad node connect "$HOST_NODE_ID@$HOST_IP:8776" || \
rad node connect "$HOST_IP:8776" || \
echo "  (direct connect failed — relying on gossip)"

sleep 3

# ── 3. Clone repo ──────────────────────────────────────────────────────────────

log "Seeding and fetching repo from host..."
rad seed "$RID"
sleep 5

log "Cloning repo..."
rad clone "$RID" /workspace/repo
cd /workspace/repo

# ── 4. Events ──────────────────────────────────────────────────────────────────

log "Creating issues..."

ISSUE1=$(rad issue open \
    --title "Bug: segfault when processing large datasets" \
    --description "Processing datasets larger than 512 MB causes a segfault. Reproducible on Linux x86_64. Stack trace in first comment." \
    2>&1 | grep -oE '[0-9a-f]{40}' | head -1)
echo "   issue 1: $ISSUE1"

ISSUE2=$(rad issue open \
    --title "Feature: batch operations API" \
    --description "The current single-item API is too slow at scale. We need a batch endpoint that accepts an array of operations and processes them atomically." \
    2>&1 | grep -oE '[0-9a-f]{40}' | head -1)
echo "   issue 2: $ISSUE2"

ISSUE3=$(rad issue open \
    --title "Docs: README missing quickstart section" \
    --description "New contributors have no idea where to start. A quickstart section with a minimal working example would help a lot." \
    2>&1 | grep -oE '[0-9a-f]{40}' | head -1)
echo "   issue 3: $ISSUE3"

log "Adding comments..."

rad issue comment "$ISSUE1" \
    --message "Stack trace: #0 memcpy() at libc.c:42, #1 process_chunk() at core.c:128. Looks like an off-by-one in the chunk size calculation."

rad issue comment "$ISSUE1" \
    --message "I reproduced it with a 256 MB file too — not a 512 MB threshold, probably any buffer over page size."

rad issue comment "$ISSUE2" \
    --message "A queue-based approach would work well here. I can prototype this if the interface is agreed on first."

# Comment on the main identity's existing issue
rad issue comment "$MAIN_ISSUE_ID" \
    --message "I also ran into this on v0.4.2. Happy to help test a fix." \
    2>/dev/null || echo "   (skipped comment on main issue — not found locally)"

log "Creating a patch..."
git checkout -b tester/fix-segfault
cat >> abc.txt << 'EOF'

// fix: validate buffer size before processing to prevent segfault
EOF
git add abc.txt
git commit -m "fix: add bounds check before memcpy to prevent segfault on large input"
git push rad HEAD:refs/patches

# ── 5. Sync back to host ───────────────────────────────────────────────────────

log "Announcing changes to host..."
rad sync --announce 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done! Now on your host machine run:"
echo ""
echo "    rad sync rad:zyAM8wXNAXZh3423qneGMsCu5wAy --fetch"
echo ""
echo "  Then hit Refresh in radboard — inbox should populate."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
