import { useEffect, useRef, useState, startTransition, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useZoom } from './hooks/useZoom';
import { useTheme } from './hooks/useTheme';
import { getCurrentWindow } from '@tauri-apps/api/window';
import KanbanBoard from './components/kanban/KanbanBoard';
import IssuesView from './components/issues/IssuesView';
import PatchesView from './components/patches/PatchesView';
import WorktreesView from './components/worktrees/WorktreesView';
import FilesView from './components/files/FilesView';
import PatchFilesView from './components/patches/PatchFilesView';
import MilestonesView from './components/milestones/MilestonesView';
import InboxView from './components/inbox/InboxView';
import GlobalInboxPanel from './components/inbox/GlobalInboxPanel';
import SettingsModal from './components/settings/SettingsModal';
import WelcomeScreen from './components/welcome/WelcomeScreen';
import AddRepoModal from './components/shared/AddRepoModal';
import ConfirmDialog from './components/shared/ConfirmDialog';
import CloseIssueDialog from './components/shared/CloseIssueDialog';
import type { IssueComment, IssueDetail as IssueDetailType, KanbanColumnData, PatchRef, PriorityLevel } from './types/kanban';
import { PRIORITY_LEVELS } from './types/kanban';
import type { AppSetup, BannedEntry, NotificationCountData, NotificationData, RadicleIdentity, RawIssueData, RawPatchData, RepoInfo } from './types/radboard';
import type { FileDiff } from './components/patches/DiffView';
import { Tabs, TabsList, TabsTrigger } from './ui';
import { RepoProvider } from './contexts/RepoContext';
import { ActionsProvider } from './contexts/ActionsContext';
import { TerminalProvider, useTerminal } from './contexts/TerminalContext';
import TerminalPanel from './components/terminal/TerminalPanel';

type MainView = 'kanban' | 'issues' | 'patches' | 'milestones' | 'worktrees' | 'files' | 'inbox' | 'patch-files';

interface PatchFilesCtx {
  fileDiffs: FileDiff[];
  commitOid: string;
  patchTitle: string;
  initialPath: string | null;
  patchId: string;
  initialRevisionId: string;
}
import './App.css';
import styles from './App.module.css';

// ── Data mapping ──────────────────────────────────────────────────────────────

function msToDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultColumn(state: 'open' | 'closed' | 'solved'): string {
  return state === 'open' ? 'open' : 'closed';
}

const STATIC_COL_IDS = new Set(['open', 'closed']);

function titleFromId(id: string): string {
  return id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** Reconstruct full label list from an IssueDetail, re-adding milestone labels that were stripped for display. */
function allLabels(issue: IssueDetailType, milestonePrefix: string): string[] {
  const labels = issue.labels.map((l) => l.text);
  if (issue.priority) labels.push(`priority:${issue.priority}`);
  if (issue.milestones) {
    for (const ms of issue.milestones) labels.push(`${milestonePrefix}${ms}`);
  }
  if (issue.blockedBy) {
    for (const b of issue.blockedBy) labels.push(`blocked:${b.raw}`);
  }
  if (issue.isEpic) labels.push('epic');
  if (issue.parentRaw) labels.push(`parent:${issue.parentRaw}`);
  return labels;
}

function issuesToColumns(
  issues: RawIssueData[],
  rid: string,
  columnOrder: string[],
  bannedUsers: BannedEntry[] = [],
  rawPatches: RawPatchData[] = [],
  milestonePrefix: string = 'milestone:',
): [KanbanColumnData[], Map<string, IssueDetailType>] {
  const bannedIssueDids = new Set(
    bannedUsers.filter((b) => b.scope === 'all' || b.scope === 'issues').map((b) => b.did),
  );
  // Exclude static IDs defensively — if they leaked into saved columnOrder they'd cause doubling
  const safeOrder = columnOrder.filter((id) => !STATIC_COL_IDS.has(id));

  // Discover dynamic column ids from state: labels
  const dynamicIds = new Set<string>(safeOrder);
  for (const raw of issues) {
    for (const label of raw.labels) {
      if (label.startsWith('state:')) {
        const id = label.slice(6);
        if (!STATIC_COL_IDS.has(id)) dynamicIds.add(id);
      }
    }
  }

  // Ordered: persisted order first, then any newly discovered ids
  const orderedDynamic = [
    ...safeOrder,
    ...[...dynamicIds].filter((id) => !safeOrder.includes(id)),
  ];

  const cols: Record<string, KanbanColumnData> = {
    open:   { id: 'open',   title: 'Open',   issues: [], isStatic: true },
    closed: { id: 'closed', title: 'Closed', issues: [], isStatic: true },
  };
  for (const id of orderedDynamic) {
    cols[id] = { id, title: titleFromId(id), issues: [] };
  }

  // Map each issue's 7-char prefix back to its full id, used to resolve
  // `blocked:<hex7>` labels to concrete issues at render time.
  const issueByPrefix = new Map<string, string>();
  for (const raw of issues) {
    issueByPrefix.set(raw.id.slice(0, 7).toLowerCase(), raw.id);
  }

  // Inverted blocks index: for every `blocked:<hex7>` label, record the
  // blocked issue's id against the blocker. The blocker may not be loaded —
  // silently ignored.
  const blockedByBlocker = new Map<string, string[]>(); // blockerId -> [blockedId, …]
  const HEX7_LABEL = /^[0-9a-f]{7}$/i;
  for (const raw of issues) {
    for (const l of raw.labels) {
      if (!l.startsWith('blocked:')) continue;
      const val = l.slice('blocked:'.length);
      if (!HEX7_LABEL.test(val)) continue;
      const blockerId = issueByPrefix.get(val.toLowerCase());
      if (!blockerId) continue;
      const list = blockedByBlocker.get(blockerId) ?? [];
      list.push(raw.id);
      blockedByBlocker.set(blockerId, list);
    }
  }

  // Epic→children index: for every `parent:<hex7>` label, record the child
  // against the parent. Parent may not be loaded — chip still renders, no
  // entry in this index.
  const childrenByParent = new Map<string, string[]>();
  for (const raw of issues) {
    for (const l of raw.labels) {
      if (!l.startsWith('parent:')) continue;
      const val = l.slice('parent:'.length);
      if (!HEX7_LABEL.test(val)) continue;
      const parentId = issueByPrefix.get(val.toLowerCase());
      if (!parentId) continue;
      const list = childrenByParent.get(parentId) ?? [];
      list.push(raw.id);
      childrenByParent.set(parentId, list);
    }
  }

  // Build inverted index: 7-char hex prefix → patches that mention it
  // This turns O(N*M) string scans into O(M) build + O(1) lookup
  const patchesByPrefix = new Map<string, RawPatchData[]>();
  const HEX7 = /[0-9a-f]{7}/gi;
  for (const patch of rawPatches) {
    const seen = new Set<string>();
    const text = patch.title + ' ' + patch.description + ' ' + (patch.commitSummaries ?? []).join(' ');
    for (const m of text.matchAll(HEX7)) {
      const key = m[0].toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (!patchesByPrefix.has(key)) patchesByPrefix.set(key, []);
      patchesByPrefix.get(key)!.push(patch);
    }
  }

  const detailMap = new Map<string, IssueDetailType>();

  for (const raw of issues) {
    if (bannedIssueDids.has(raw.authorDid)) continue;
    const upvotes = raw.reactions.find((r) => r.emoji === '👍')?.authors.length ?? 0;
    const downvotes = raw.reactions.find((r) => r.emoji === '👎')?.authors.length ?? 0;
    const prefix = raw.id.slice(0, 7);
    const matchingPatches = patchesByPrefix.get(prefix) ?? [];
    const openPatchCount = matchingPatches.filter((p) => p.state === 'open').length;
    const indicator = {
      ...(upvotes > 0 && { upvotes }),
      ...(downvotes > 0 && { downvotes }),
      ...(raw.commentCount > 0 && { comments: raw.commentCount }),
      ...(openPatchCount > 0 && { patches: openPatchCount }),
    };
    // Parse priority label
    const priorityLabel = raw.labels.find((l) => l.startsWith('priority:'));
    const parsedPriority = priorityLabel ? priorityLabel.slice(9) : null;
    const priority: PriorityLevel | undefined =
      (parsedPriority && PRIORITY_LEVELS.includes(parsedPriority as PriorityLevel))
        ? (parsedPriority as PriorityLevel)
        : undefined;

    const milestoneLabels = raw.labels.filter((l) => l.startsWith(milestonePrefix));
    const milestones = milestoneLabels.map((l) => l.slice(milestonePrefix.length)).filter(Boolean);

    const blockedBy = raw.labels
      .filter((l) => l.startsWith('blocked:'))
      .map((l) => {
        const v = l.slice('blocked:'.length);
        const linkedIssueId = HEX7_LABEL.test(v) ? issueByPrefix.get(v.toLowerCase()) : undefined;
        return { raw: v, linkedIssueId };
      });

    const blockedIssueIds = blockedByBlocker.get(raw.id);

    // Implicit epic: any issue that has at least one child pointing at it
    // is treated as an epic even without the explicit `epic` label.
    const isEpic = raw.labels.includes('epic') || (childrenByParent.get(raw.id)?.length ?? 0) > 0;
    const parentLabel = raw.labels.find((l) => l.startsWith('parent:'));
    const parentRaw = parentLabel ? parentLabel.slice('parent:'.length) : undefined;
    const parentId = parentRaw && HEX7_LABEL.test(parentRaw)
      ? issueByPrefix.get(parentRaw.toLowerCase())
      : undefined;
    const epicChildIds = childrenByParent.get(raw.id);

    const card = {
      id: raw.id,
      author: raw.author,
      authorDid: raw.authorDid,
      title: raw.title,
      labels: raw.labels
        .filter((l) =>
          !l.startsWith('priority:') &&
          !l.startsWith(milestonePrefix) &&
          !l.startsWith('blocked:') &&
          !l.startsWith('parent:') &&
          l !== 'epic',
        )
        .map((l) => ({ text: l, variant: l })),
      milestones: milestones.length > 0 ? milestones : undefined,
      assignees: raw.assignees.length > 0 ? raw.assignees : undefined,
      blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
      blockedIssueIds: blockedIssueIds && blockedIssueIds.length > 0 ? blockedIssueIds : undefined,
      indicator: Object.keys(indicator).length > 0 ? indicator : undefined,
      ...(raw.state === 'solved' && { solved: true }),
      priority,
      ...(isEpic && { isEpic: true }),
      ...(parentRaw && { parentRaw }),
      ...(parentId && { parentId }),
      ...(epicChildIds && epicChildIds.length > 0 && { epicChildIds }),
    };

    detailMap.set(raw.id, {
      ...card,
      rid,
      rootId: raw.rootId,
      status: raw.state === 'solved' ? 'solved' : raw.state === 'open' ? 'open' : 'closed',
      description: raw.description,
      createdAt: msToDate(raw.createdAt),
      reactions: raw.reactions,
      comments: null,
      commentCount: raw.commentCount,
      patches: matchingPatches.map((p) => ({
        id: p.id,
        title: p.title,
        author: p.author,
        authorDid: p.authorDid,
        state: p.state,
        head: p.head,
      })),
    });

    // Closed/solved issues always go to the Closed column regardless of any lingering state:* label.
    // For open issues, state: label determines the dynamic column.
    const stateLabel = raw.labels.find((l) => l.startsWith('state:'));
    const labelCol = (raw.state === 'open' && stateLabel) ? stateLabel.slice(6) : null;

    const colId = labelCol ?? defaultColumn(raw.state);
    (cols[colId] ?? cols[defaultColumn(raw.state)]).issues.push(card);
  }

  // Sort Open column by priority zone order (uncategorized issues go last)
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  cols.open.issues.sort((a, b) => (priorityOrder[a.priority ?? ''] ?? 4) - (priorityOrder[b.priority ?? ''] ?? 4));

  return [
    [cols.open, ...orderedDynamic.map((id) => cols[id]), cols.closed],
    detailMap,
  ];
}

// ── Window controls ────────────────────────────────────────────────────────────

function WindowControls() {
  const win = getCurrentWindow();
  return (
    <div className={styles.windowControls}>
      <button className={`${styles.winBtn} ${styles.winMinimize}`} onClick={() => win.minimize()} aria-label="Minimize" />
      <button className={`${styles.winBtn} ${styles.winMaximize}`} onClick={() => win.toggleMaximize()} aria-label="Maximize" />
      <button className={`${styles.winBtn} ${styles.winClose}`} onClick={() => win.close()} aria-label="Close" />
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function App() {
  const [setup, setSetup] = useState<AppSetup | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  const [myDid, setMyDid] = useState<string | null>(null);
  const [repoDelegateDids, setRepoDelegateDids] = useState<Map<string, string[]>>(new Map());
  const [repoDefaultBranches, setRepoDefaultBranches] = useState<Map<string, string>>(new Map());

  const [activeRid, setActiveRid] = useState<string | null>(null);
  const [repoNames, setRepoNames] = useState<Map<string, string>>(new Map());
  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const [confirmRemoveRid, setConfirmRemoveRid] = useState<string | null>(null);
  const [columns, setColumns] = useState<KanbanColumnData[]>([]);
  const [issueDetails, setIssueDetails] = useState<Map<string, IssueDetailType>>(new Map());
  const [rawPatches, setRawPatches] = useState<RawPatchData[]>([]);
  const [selectedPatch, setSelectedPatch] = useState<PatchRef | null>(null);
  const [activeView, setActiveView] = useState<MainView>('kanban');
  const [patchFilesCtx, setPatchFilesCtx] = useState<PatchFilesCtx | null>(null);
  const [patchRevisionOverride, setPatchRevisionOverride] = useState<string | null>(null);
  const [patchReturnIssueId, setPatchReturnIssueId] = useState<string | null>(null);
  const [patchReturnView, setPatchReturnView] = useState<MainView | null>(null);
  const [selectedIssueInView, setSelectedIssueInView] = useState<string | null>(null);
  const [issueReturnView, setIssueReturnView] = useState<MainView | null>(null);
  const [filesCommitOid, setFilesCommitOid] = useState<string | null>(null);
  const [filesInitialPath, setFilesInitialPath] = useState<string | null>(null);
  const [filesReturnView, setFilesReturnView] = useState<MainView | null>(null);
  const [filesRefLabel, setFilesRefLabel] = useState<string | null>(null);
  const [isRepoLoading, setIsRepoLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [issueCreating, setIssueCreating] = useState(false);
  const [pendingCloseIssue, setPendingCloseIssue] = useState<{ issueId: string; fromColId: string; source: 'kanban' | 'state' } | null>(null);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [globalInboxOpen, setGlobalInboxOpen] = useState(false);
  const [globalNotifications, setGlobalNotifications] = useState<NotificationData[]>([]);
  const [globalUnreadCount, setGlobalUnreadCount] = useState(0);
  const { zoom, zoomIn, zoomOut, resetZoom, canZoomIn, canZoomOut } = useZoom();
  const { theme, toggle: toggleTheme } = useTheme();

  // Pending selections after repo switch (set by inbox navigation, consumed by data-load effect)
  const pendingPatchId = useRef<string | null>(null);
  const pendingIssueId = useRef<string | null>(null);
  const pendingFilesView = useRef<boolean>(false);

  // Load persisted config on startup
  useEffect(() => {
    invoke<AppSetup | null>('load_config')
      .then((saved) => {
        if (saved) {
          setSetup(saved);
          const rid = (saved.lastActiveRid && saved.rids.includes(saved.lastActiveRid))
            ? saved.lastActiveRid
            : saved.rids[0] ?? null;
          setActiveRid(rid);
          const validViews: MainView[] = ['kanban', 'issues', 'patches', 'milestones', 'worktrees', 'files', 'inbox'];
          if (saved.lastActiveView && validViews.includes(saved.lastActiveView as MainView)) {
            setActiveView(saved.lastActiveView as MainView);
          }
        }
      })
      .finally(() => setConfigLoaded(true));
    invoke<RadicleIdentity | null>('get_identity')
      .then((id) => setMyDid(id?.did ?? null))
      .catch(console.error);
  }, []);

  // Persist last active repo + view to config
  useEffect(() => {
    if (!setup || !activeRid) return;
    if (setup.lastActiveRid === activeRid && setup.lastActiveView === activeView) return;
    const updated = { ...setup, lastActiveRid: activeRid, lastActiveView: activeView };
    setSetup(updated);
    invoke('save_config', { config: updated }).catch(console.error);
  }, [activeRid, activeView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch repo names whenever setup changes
  useEffect(() => {
    if (!setup) return;
    invoke<RepoInfo[]>('list_repos')
      .then((repos) => {
        setRepoNames(new Map(repos.map((r) => [r.rid, r.name])));
        setRepoDelegateDids(new Map(repos.map((r) => [r.rid, r.delegateDids])));
        setRepoDefaultBranches(new Map(repos.map((r) => [r.rid, r.defaultBranch])));
      })
      .catch(console.error);
  }, [setup]);

  function fetchNotifications(rid: string, limit: number) {
    invoke<NotificationData[]>('list_notifications', { rid, limit })
      .then((data) => {
        setNotifications(data);
        setUnreadCount(data.filter((n) => n.status === 'unread').length);
      })
      .catch(console.error);
  }

  function fetchGlobalNotifications(limit: number) {
    invoke<NotificationData[]>('list_notifications', { rid: null, limit })
      .then((data) => {
        setGlobalNotifications(data);
        setGlobalUnreadCount(data.filter((n) => n.status === 'unread').length);
      })
      .catch(console.error);
  }

  // Fetch notification list when switching to inbox view or changing repo
  useEffect(() => {
    if (activeView !== 'inbox' || !activeRid || !setup) return;
    fetchNotifications(activeRid, setup.inboxPageSize ?? 50);
  }, [activeView, activeRid, setup]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll counts every 30s; auto-refresh list when count increases
  useEffect(() => {
    if (!setup || !activeRid) return;
    const limit = setup.inboxPageSize ?? 50;
    const rid = activeRid;

    const poll = () => {
      invoke<NotificationCountData>('notification_count', { rid })
        .then((c) => {
          setUnreadCount((prev) => {
            if (c.unread > prev && activeView === 'inbox') fetchNotifications(rid, limit);
            return c.unread;
          });
        })
        .catch(console.error);
      invoke<NotificationCountData>('notification_count', { rid: null })
        .then((c) => {
          setGlobalUnreadCount((prev) => {
            if (c.unread > prev && globalInboxOpen) fetchGlobalNotifications(limit);
            return c.unread;
          });
        })
        .catch(console.error);
    };

    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, [setup, activeRid, activeView, globalInboxOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh on window focus
  useEffect(() => {
    if (!setup || !activeRid) return;
    const limit = setup.inboxPageSize ?? 50;
    const rid = activeRid;
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) return;
      invoke<NotificationCountData>('notification_count', { rid })
        .then((c) => {
          setUnreadCount(c.unread);
          if (activeView === 'inbox') fetchNotifications(rid, limit);
        })
        .catch(console.error);
      invoke<NotificationCountData>('notification_count', { rid: null })
        .then((c) => {
          setGlobalUnreadCount(c.unread);
          if (globalInboxOpen) fetchGlobalNotifications(limit);
        })
        .catch(console.error);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [setup, activeRid, activeView, globalInboxOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll issues + patches every 60s in the background
  useEffect(() => {
    if (!activeRid || !setup) return;
    const rid = activeRid;
    const interval = setInterval(() => {
      invoke('sync_repo_fetch', { rid }).catch(() => {}).finally(() => {
        Promise.all([
          invoke<RawIssueData[]>('list_issues', { rid }),
          invoke<RawPatchData[]>('list_patches', { rid }),
        ]).then(([issues, patches]) => {
          setRawPatches(patches);
          const columnOrder = setup.columnOrder?.[rid] ?? [];
          const [cols, details] = issuesToColumns(issues, rid, columnOrder, setup.bannedUsers, patches, setup.milestonePrefix ?? 'milestone:');
          setColumns(cols);
          setIssueDetails(details);
        }).catch(console.error);
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, [activeRid, setup]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load issues when active repo changes — issues and patches load independently
  useEffect(() => {
    if (!activeRid || !setup) return;
    let cancelled = false;
    setIsRepoLoading(true);
    const rid = activeRid;

    // Apply pending files view navigation (tags) — doesn't depend on loaded data
    if (pendingFilesView.current) {
      pendingFilesView.current = false;
      setActiveView('files');
    }

    const issuesPromise = invoke<RawIssueData[]>('list_issues', { rid });
    const patchesPromise = invoke<RawPatchData[]>('list_patches', { rid });

    // Show issues as soon as they arrive (without patch indicators yet)
    issuesPromise.then((issues) => {
      if (cancelled) return;
      const columnOrder = setup.columnOrder?.[rid] ?? [];
      const [cols, details] = issuesToColumns(issues, rid, columnOrder, setup.bannedUsers, [], setup.milestonePrefix ?? 'milestone:');
      startTransition(() => {
        setColumns(cols);
        setIssueDetails(details);
      });
      // Apply pending issue selection from inbox navigation
      const pendingIssue = pendingIssueId.current;
      if (pendingIssue) {
        pendingIssueId.current = null;
        setSelectedIssueInView(pendingIssue);
        setActiveView('issues');
      }
    }).catch(console.error);

    // When patches arrive, recompute with both
    Promise.all([issuesPromise, patchesPromise]).then(([issues, patches]) => {
      if (cancelled) return;
      const columnOrder = setup.columnOrder?.[rid] ?? [];
      const [cols, details] = issuesToColumns(issues, rid, columnOrder, setup.bannedUsers, patches, setup.milestonePrefix ?? 'milestone:');
      startTransition(() => {
        setRawPatches(patches);
        setColumns(cols);
        setIssueDetails(details);
      });
      // Apply pending patch selection from inbox navigation
      const pendingPatch = pendingPatchId.current;
      if (pendingPatch) {
        pendingPatchId.current = null;
        const raw = patches.find((p: RawPatchData) => p.id === pendingPatch);
        if (raw) setSelectedPatch({ id: raw.id, title: raw.title, author: raw.author, authorDid: raw.authorDid, state: raw.state, head: raw.head });
        setActiveView('patches');
      }
    }).catch(console.error).finally(() => {
      if (!cancelled) setIsRepoLoading(false);
    });

    return () => { cancelled = true; };
  }, [activeRid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist newly discovered dynamic state:* columns so they survive an empty state.
  // Once a column has been seen, it stays in the user's columnOrder until they explicitly
  // remove it via the column context menu (right-click → Remove column).
  useEffect(() => {
    if (!activeRid) return;
    const dynamicIds = columns
      .filter((c) => !c.isStatic && !STATIC_COL_IDS.has(c.id))
      .map((c) => c.id);
    if (dynamicIds.length === 0) return;
    setSetup((prev) => {
      if (!prev) return prev;
      const persisted = prev.columnOrder?.[activeRid] ?? [];
      const missing = dynamicIds.filter((id) => !persisted.includes(id));
      if (missing.length === 0) return prev;
      const merged = [...persisted, ...missing];
      const next = { ...prev, columnOrder: { ...prev.columnOrder, [activeRid]: merged } };
      invoke('save_config', { config: next }).catch(console.error);
      return next;
    });
  }, [columns, activeRid]);

  function handleSetup(s: AppSetup) {
    const full = { ...s };
    setSetup(full);
    setActiveRid(full.rids[0] ?? null);
    invoke('save_config', { config: full }).catch(console.error);
  }

  function handleRemoveRepo(rid: string) {
    if (!setup) return;
    const updated = { ...setup, rids: setup.rids.filter((r) => r !== rid) };
    setSetup(updated);
    if (activeRid === rid) setActiveRid(updated.rids[0] ?? null);
    invoke('save_config', { config: updated }).catch(console.error);
    setConfirmRemoveRid(null);
  }

  function handleAddRepo(rid: string, localPath?: string) {
    if (!setup || setup.rids.includes(rid)) return;
    const localRepoPaths = localPath
      ? { ...(setup.localRepoPaths ?? {}), [rid]: localPath }
      : setup.localRepoPaths;
    const updated = { ...setup, rids: [...setup.rids, rid], ...(localRepoPaths ? { localRepoPaths } : {}) };
    setSetup(updated);
    setActiveRid(rid);
    invoke('save_config', { config: updated }).catch(console.error);
  }

  function handleLocalPathChange(rid: string, path: string) {
    if (!setup) return;
    const localRepoPaths = { ...(setup.localRepoPaths ?? {}), [rid]: path };
    const updated = { ...setup, localRepoPaths };
    setSetup(updated);
    invoke('save_config', { config: updated }).catch(console.error);
  }

  function handleEditorChange(cmd: string) {
    if (!setup) return;
    const updated = { ...setup, preferredEditor: cmd };
    setSetup(updated);
    invoke('save_config', { config: updated }).catch(console.error);
  }

  function handleInboxPageSizeChange(n: number) {
    if (!setup) return;
    const updated = { ...setup, inboxPageSize: n };
    setSetup(updated);
    invoke('save_config', { config: updated }).catch(console.error);
  }

  function handleMilestonePrefixChange(prefix: string) {
    if (!setup) return;
    const updated = { ...setup, milestonePrefix: prefix };
    setSetup(updated);
    invoke('save_config', { config: updated }).catch(console.error);
  }

  function handleColumnsChange(newCols: KanbanColumnData[]) {
    if (!setup || !activeRid) return;
    setColumns(newCols);
  }

  function handleIssueMoved(issueId: string, fromColId: string, toColId: string) {
    if (!activeRid || !setup || fromColId === toColId) return;
    if (toColId === 'closed') {
      setPendingCloseIssue({ issueId, fromColId, source: 'kanban' });
      return;
    } else if (fromColId === 'closed') {
      invoke('set_issue_state', { rid: activeRid, issueId, state: 'open' }).catch(console.error);
    }

    completeIssueMove(issueId, fromColId, toColId);
  }

  function completeIssueMove(issueId: string, _fromColId: string, toColId: string) {
    if (!activeRid || !setup) return;
    const issue = issueDetails.get(issueId);
    if (!issue) return;
    const prefix = setup.milestonePrefix ?? 'milestone:';
    const otherLabels = allLabels(issue, prefix).filter((l) => !l.startsWith('state:') && !l.startsWith('priority:'));

    const STATIC = ['open', 'closed'];
    const newLabels = STATIC.includes(toColId)
      ? otherLabels
      : [...otherLabels, `state:${toColId}`];

    const rid = activeRid;
    const columnOrder = setup.columnOrder?.[rid] ?? [];
    const bannedUsers = setup.bannedUsers ?? [];
    invoke('label_issue', { rid, issueId, labels: newLabels })
      .then(() => Promise.all([
        invoke<RawIssueData[]>('list_issues', { rid }),
        invoke<RawPatchData[]>('list_patches', { rid }),
      ]))
      .then(([issues, patches]) => {
        setRawPatches(patches);
        const [cols, details] = issuesToColumns(issues, rid, columnOrder, bannedUsers, patches, setup.milestonePrefix ?? 'milestone:');
        setColumns(cols);
        setIssueDetails(details);
      })
      .catch(console.error);
  }

  function handlePriorityChange(issueId: string, priority: PriorityLevel | null) {
    if (!activeRid || !setup) return;
    const issue = issueDetails.get(issueId);
    if (!issue) return;
    const prefix = setup.milestonePrefix ?? 'milestone:';
    const otherLabels = allLabels(issue, prefix).filter((l) => !l.startsWith('priority:'));
    const newLabels = priority ? [...otherLabels, `priority:${priority}`] : otherLabels;

    const rid = activeRid;
    const columnOrder = setup.columnOrder?.[rid] ?? [];
    const bannedUsers = setup.bannedUsers ?? [];
    invoke('label_issue', { rid, issueId, labels: newLabels })
      .then(() => Promise.all([
        invoke<RawIssueData[]>('list_issues', { rid }),
        invoke<RawPatchData[]>('list_patches', { rid }),
      ]))
      .then(([issues, patches]) => {
        setRawPatches(patches);
        const [cols, details] = issuesToColumns(issues, rid, columnOrder, bannedUsers, patches, setup.milestonePrefix ?? 'milestone:');
        setColumns(cols);
        setIssueDetails(details);
      })
      .catch(console.error);
  }

  function handleExplorerUrlChange(url: string) {
    if (!setup) return;
    const updated = { ...setup, explorerUrl: url };
    setSetup(updated);
    invoke('save_config', { config: updated }).catch(console.error);
  }

  function handleSeedNodeChange(node: string) {
    if (!setup) return;
    const updated = { ...setup, seedNode: node };
    setSetup(updated);
    invoke('save_config', { config: updated }).catch(console.error);
  }

  function handleVisibleColumnsChange(n: number) {
    if (!setup) return;
    const updated = { ...setup, visibleColumns: n };
    setSetup(updated);
    invoke('save_config', { config: updated }).catch(console.error);
  }

  function handleColumnRemove(colId: string) {
    if (!setup || !activeRid) return;
    const rid = activeRid;

    // Remove state: label from any issues currently in this column
    const col = columns.find((c) => c.id === colId);
    if (col) {
      for (const issue of col.issues) {
        const detail = issueDetails.get(issue.id);
        if (!detail) continue;
        const prefix = setup.milestonePrefix ?? 'milestone:';
        const newLabels = allLabels(detail, prefix).filter((l) => l !== `state:${colId}`);
        invoke('label_issue', { rid, issueId: issue.id, labels: newLabels }).catch(console.error);
      }
    }

    // Remove from columnOrder and columnColors
    const newOrder = (setup.columnOrder?.[rid] ?? []).filter((id) => id !== colId);
    const newColors = { ...setup.columnColors?.[rid] };
    delete newColors[colId];
    const updated = {
      ...setup,
      columnOrder: { ...setup.columnOrder, [rid]: newOrder },
      columnColors: { ...setup.columnColors, [rid]: newColors },
    };
    setSetup(updated);
    setColumns((prev) => prev.filter((c) => c.id !== colId));
    invoke('save_config', { config: updated }).catch(console.error);
  }

  function handleColumnColorChange(colId: string, color: string | null) {
    if (!setup || !activeRid) return;
    const rid = activeRid;
    const existing = setup.columnColors?.[rid] ?? {};
    const updated = color === null
      ? { ...existing }
      : { ...existing, [colId]: color };
    if (color === null) delete updated[colId];
    const next = { ...setup, columnColors: { ...setup.columnColors, [rid]: updated } };
    setSetup(next);
    invoke('save_config', { config: next }).catch(console.error);
  }

  const issuesListWidthTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleIssuesListWidthChange(width: number) {
    if (!setup) return;
    if (issuesListWidthTimer.current) clearTimeout(issuesListWidthTimer.current);
    issuesListWidthTimer.current = setTimeout(() => {
      setSetup((prev) => {
        if (!prev) return prev;
        const next = { ...prev, issuesListWidth: width };
        invoke('save_config', { config: next }).catch(console.error);
        return next;
      });
    }, 300);
  }

  function handleColumnsReorder(newCols: KanbanColumnData[]) {
    if (!setup || !activeRid) return;
    const dynamicOrder = newCols
      .filter((c) => !c.isStatic && !STATIC_COL_IDS.has(c.id))
      .map((c) => c.id);
    const updated = {
      ...setup,
      columnOrder: { ...setup.columnOrder, [activeRid]: dynamicOrder },
    };
    setSetup(updated);
    setColumns(newCols);
    invoke('save_config', { config: updated }).catch(console.error);
  }

  async function handleRefresh() {
    if (!activeRid || !setup) return;
    try {
      const [issues, patches] = await Promise.all([
        invoke<RawIssueData[]>('list_issues', { rid: activeRid }),
        invoke<RawPatchData[]>('list_patches', { rid: activeRid }),
      ]);
      setRawPatches(patches);
      const columnOrder = setup.columnOrder?.[activeRid] ?? [];
      const [cols, details] = issuesToColumns(issues, activeRid, columnOrder, setup.bannedUsers, patches, setup.milestonePrefix ?? 'milestone:');
      setColumns(cols);
      setIssueDetails(details);
    } catch (e) {
      console.error(e);
    }
  }

  function handleCommentsLoaded(issueId: string, comments: IssueComment[]) {
    setIssueDetails((prev) => {
      const existing = prev.get(issueId);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(issueId, { ...existing, comments });
      return next;
    });
  }

  function handleStateChange(issueId: string, newColumnId: string) {
    if (!activeRid || !setup) return;
    const currentColId = columns.find((col) => col.issues.some((i) => i.id === issueId))?.id ?? 'open';
    if (currentColId === newColumnId) return;

    if (newColumnId === 'closed') {
      setPendingCloseIssue({ issueId, fromColId: currentColId, source: 'state' });
      return;
    } else if (currentColId === 'closed') {
      invoke('set_issue_state', { rid: activeRid, issueId, state: 'open' }).catch(console.error);
    }

    completeStateChange(issueId, currentColId, newColumnId);
  }

  function completeStateChange(issueId: string, _currentColId: string, newColumnId: string) {
    if (!activeRid || !setup) return;
    const issue = issueDetails.get(issueId);
    if (!issue) return;
    const prefix = setup.milestonePrefix ?? 'milestone:';
    const otherLabels = allLabels(issue, prefix).filter((l) => !l.startsWith('state:') && !l.startsWith('priority:'));

    const STATIC = ['open', 'closed'];
    const newLabels = STATIC.includes(newColumnId) ? otherLabels : [...otherLabels, `state:${newColumnId}`];

    invoke('label_issue', { rid: activeRid, issueId, labels: newLabels })
      .then(() => Promise.all([
        invoke<RawIssueData[]>('list_issues', { rid: activeRid }),
        invoke<RawPatchData[]>('list_patches', { rid: activeRid }),
      ]))
      .then(([issues, patches]) => {
        setRawPatches(patches);
        const columnOrder = setup.columnOrder?.[activeRid] ?? [];
        const [cols, details] = issuesToColumns(issues, activeRid, columnOrder, setup.bannedUsers ?? [], patches, setup.milestonePrefix ?? 'milestone:');
        setColumns(cols);
        setIssueDetails(details);
      })
      .catch(console.error);
  }

  function handleCloseIssueChoice(state: 'closed' | 'solved') {
    if (!pendingCloseIssue || !activeRid) return;
    const { issueId, fromColId, source } = pendingCloseIssue;
    setPendingCloseIssue(null);
    invoke('set_issue_state', { rid: activeRid, issueId, state }).catch(console.error);
    if (source === 'kanban') {
      completeIssueMove(issueId, fromColId, 'closed');
    } else {
      completeStateChange(issueId, fromColId, 'closed');
    }
  }

  function handleBanUser(did: string, alias: string, scope: 'all' | 'issues' | 'comments') {
    if (!setup) return;
    const existing = setup.bannedUsers ?? [];
    if (existing.some((b) => b.did === did)) return;
    const updated = { ...setup, bannedUsers: [...existing, { did, alias, scope }] };
    setSetup(updated);
    invoke('save_config', { config: updated }).catch(console.error);
  }

  function handleUnbanUser(did: string) {
    if (!setup) return;
    const updated = { ...setup, bannedUsers: (setup.bannedUsers ?? []).filter((b) => b.did !== did) };
    setSetup(updated);
    invoke('save_config', { config: updated }).catch(console.error);
  }

  function handleMarkRead(ids: number[]) {
    invoke('mark_notifications_read', { ids }).then(() => {
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, status: 'read' as const, readAt: Date.now() } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - ids.length));
    }).catch(console.error);
  }

  function handleClearNotifications(ids: number[]) {
    invoke('clear_notifications', { ids }).then(() => {
      if (ids.length === 0) {
        setNotifications([]);
        setUnreadCount(0);
      } else {
        setNotifications((prev) => {
          const removed = prev.filter((n) => ids.includes(n.id));
          const unreadRemoved = removed.filter((n) => n.status === 'unread').length;
          setUnreadCount((c) => Math.max(0, c - unreadRemoved));
          return prev.filter((n) => !ids.includes(n.id));
        });
      }
    }).catch(console.error);
  }

  function handleNotificationNavigate(n: NotificationData) {
    handleMarkRead([n.id]);
    if (n.kind.type === 'issue') {
      const issueId = n.kind.id;
      setIssueReturnView('inbox');
      if (n.repo === activeRid) {
        setSelectedIssueInView(issueId);
        setActiveView('issues');
      } else {
        pendingIssueId.current = issueId;
        setActiveRid(n.repo);
      }
    } else if (n.kind.type === 'patch') {
      const patchId = n.kind.id;
      setPatchReturnView('inbox');
      if (n.repo === activeRid) {
        const raw = rawPatches.find((p) => p.id === patchId);
        if (raw) setSelectedPatch({ id: raw.id, title: raw.title, author: raw.author, authorDid: raw.authorDid, state: raw.state, head: raw.head });
        setActiveView('patches');
      } else {
        pendingPatchId.current = patchId;
        setActiveRid(n.repo);
      }
    } else if (n.kind.type === 'tag') {
      const tagName = n.kind.name;
      const refName = `refs/tags/${tagName}`;
      invoke<string>('resolve_ref', { rid: n.repo, refName })
        .then((oid) => {
          setFilesReturnView('inbox');
          setFilesCommitOid(oid);
          setFilesInitialPath(null);
          setFilesRefLabel(tagName);
          if (n.repo === activeRid) {
            setActiveView('files');
          } else {
            pendingFilesView.current = true;
            setActiveRid(n.repo);
          }
        })
        .catch(console.error);
    }
  }

function handleGlobalInboxOpen() {
    setGlobalInboxOpen(true);
    if (!setup) return;
    fetchGlobalNotifications(setup.inboxPageSize ?? 50);
  }

  function handleGlobalMarkRead(ids: number[]) {
    invoke('mark_notifications_read', { ids }).then(() => {
      setGlobalNotifications((prev) => prev.map((n) => ids.includes(n.id) ? { ...n, status: 'read' as const, readAt: Date.now() } : n));
      setGlobalUnreadCount((c) => Math.max(0, c - ids.length));
      // also update per-repo count if relevant
      setUnreadCount((c) => Math.max(0, c - ids.filter((id) => notifications.some((n) => n.id === id)).length));
      setNotifications((prev) => prev.map((n) => ids.includes(n.id) ? { ...n, status: 'read' as const, readAt: Date.now() } : n));
    }).catch(console.error);
  }

  function handleGlobalClear(ids: number[]) {
    invoke('clear_notifications', { ids }).then(() => {
      if (ids.length === 0) {
        setGlobalNotifications([]);
        setGlobalUnreadCount(0);
        setNotifications([]);
        setUnreadCount(0);
      } else {
        setGlobalNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
        setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
        setGlobalUnreadCount((c) => Math.max(0, c - ids.filter((id) => globalNotifications.find((n) => n.id === id)?.status === 'unread').length));
      }
    }).catch(console.error);
  }

  function handleBrowseFile(commitOid: string, filePath: string) {
    setFilesCommitOid(commitOid);
    setFilesInitialPath(filePath);
    setFilesReturnView(activeView);
    setActiveView('files');
  }

  function handleViewPatchFile(fileDiffs: FileDiff[], commitOid: string, patchTitle: string, initialPath: string, patchId: string, initialRevisionId: string) {
    setPatchFilesCtx({ fileDiffs, commitOid, patchTitle, initialPath, patchId, initialRevisionId });
    setActiveView('patch-files');
  }

  function handlePatchFilesReturn(finalRevisionId: string) {
    setPatchRevisionOverride(finalRevisionId);
    setPatchFilesCtx(null);
    setActiveView('patches');
  }

  function handleFilesReturn() {
    const ret = filesReturnView ?? 'kanban';
    setFilesReturnView(null);
    setFilesCommitOid(null);
    setFilesInitialPath(null);
    setFilesRefLabel(null);
    setActiveView(ret);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (settingsOpen) { setSettingsOpen(false); return; }
      if (activeView === 'issues' && issueReturnView) {
        setActiveView(issueReturnView);
        setIssueReturnView(null);
        return;
      }
      if (activeView === 'patches' && patchReturnIssueId) {
        setSelectedIssueInView(patchReturnIssueId);
        setPatchReturnIssueId(null);
        setActiveView('issues');
        return;
      }
      if (activeView === 'patches' && patchReturnView) {
        const ret = patchReturnView;
        setPatchReturnView(null);
        setActiveView(ret);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settingsOpen, activeView, issueReturnView, patchReturnIssueId, patchReturnView]);

  function handleIssueClick(id: string) {
    setSelectedIssueInView(id);
    setIssueReturnView('kanban');
    setActiveView('issues');
  }

  function handleOpenIssue(prefix: string) {
    const full = [...issueDetails.keys()].find((k) => k.startsWith(prefix));
    if (!full) return;
    setSelectedIssueInView(full);
    setActiveView('issues');
  }

  const activeDelegateDids = repoDelegateDids.get(activeRid ?? '') ?? [];
  const isDelegate = myDid !== null && activeDelegateDids.includes(myDid);
  function canModify(issueId: string): boolean {
    if (isDelegate) return true;
    return myDid !== null && issueDetails.get(issueId)?.authorDid === myDid;
  }

  const labelSuggestions = useMemo(
    () => [...new Set([...issueDetails.values()].flatMap((i) => i.labels.map((l) => l.text)))],
    [issueDetails],
  );

  const milestoneSuggestions = useMemo(
    () => [...new Set([...issueDetails.values()].flatMap((i) => i.milestones ?? []))].sort(),
    [issueDetails],
  );

  const repoCtxValue = useMemo(() => ({
    rid: activeRid ?? '',
    myDid,
    delegateDids: repoDelegateDids.get(activeRid ?? '') ?? [],
    explorerUrl: setup?.explorerUrl ?? 'https://app.radicle.xyz',
    seedNode: setup?.seedNode ?? 'seed.radicle.xyz',
    localRepoPath: activeRid ? (setup?.localRepoPaths?.[activeRid] ?? null) : null,
    defaultBranch: activeRid ? (repoDefaultBranches.get(activeRid) ?? 'master') : 'master',
    preferredEditor: setup?.preferredEditor ?? null,
    columns: columns.map((c) => ({ id: c.id, title: c.title })),
    columnColors: setup?.columnColors?.[activeRid ?? ''] ?? {},
    labelSuggestions,
    milestoneSuggestions,
    milestonePrefix: setup?.milestonePrefix ?? 'milestone:',
    bannedUsers: setup?.bannedUsers ?? [],
  }), [activeRid, myDid, repoDelegateDids, repoDefaultBranches, setup, columns, labelSuggestions, milestoneSuggestions]);

  const actionsCtxValue = useMemo(() => ({
    onRefresh: handleRefresh,
    onBanUser: handleBanUser,
    onUnbanUser: handleUnbanUser,
    onStateChange: handleStateChange,
    onPriorityChange: handlePriorityChange,
    onOpenPatch: (p: PatchRef, issueId: string) => {
      setPatchReturnIssueId(issueId);
      setSelectedIssueInView(null);
      setSelectedPatch(p);
      setPatchRevisionOverride(null);
      setActiveView('patches');
    },
    onSelectIssue: setSelectedIssueInView,
    onBrowseFile: handleBrowseFile,
    onViewPatchFile: handleViewPatchFile,
    onOpenIssue: handleOpenIssue,
    onCommentsLoaded: handleCommentsLoaded,
  }), [activeRid, setup, columns, issueDetails]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.root} style={{ zoom }} data-theme={theme}>
      <header
        className={styles.topbar}
        data-tauri-drag-region
        onMouseDown={(e) => {
          if (e.buttons !== 1) return;
          if ((e.target as HTMLElement).closest('button, a, input, textarea, select, [role="button"]')) return;
          getCurrentWindow().startDragging();
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a, input, textarea, select, [role="button"]')) return;
          getCurrentWindow().toggleMaximize();
        }}
      >
        <div className={styles.logoGroup}>
          <div className={styles.logo}>
            <div className={styles.logoDot} />
            radboard
          </div>
          {setup !== null && (
            <button
              className={`${styles.inboxBtn} ${globalUnreadCount > 0 ? styles.inboxBtnUnread : ''}`}
              onClick={handleGlobalInboxOpen}
              title="Global inbox"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
              </svg>
              {globalUnreadCount > 0 && <span className={styles.inboxDot}>{globalUnreadCount > 99 ? '99+' : globalUnreadCount}</span>}
            </button>
          )}
        </div>
        <WindowControls />
      </header>

      {!configLoaded ? null : setup === null ? (
        <WelcomeScreen onSetup={handleSetup} />
      ) : (
        <RepoProvider value={repoCtxValue}>
          <TerminalProvider
            rid={activeRid}
            localRepoPath={activeRid ? (setup?.localRepoPaths?.[activeRid] ?? null) : null}
            isDark={theme === 'dark'}
          >
          <ActionsProvider value={actionsCtxValue}>
          <>
          <nav className={styles.tabs}>
            {setup!.rids.map((rid) => (
              <button
                key={rid}
                className={`${styles.tab} ${activeRid === rid ? styles.tabActive : ''}`}
                onClick={() => { setActiveRid(rid); setSelectedPatch(null); if (activeView === 'patch-files') setActiveView('patches'); }}
              >
                {repoNames.get(rid) ?? rid.slice(0, 10)}
                <span
                  className={styles.tabClose}
                  role="button"
                  aria-label="Remove board"
                  onClick={(e) => { e.stopPropagation(); setConfirmRemoveRid(rid); }}
                >✕</span>
              </button>
            ))}
            <button className={styles.tabAdd} onClick={() => setAddRepoOpen(true)} aria-label="Add board">+</button>
          </nav>

          <Tabs
            value={activeView}
            onValueChange={(v) => {
              setActiveView(v as MainView);
              if (v !== 'patches') setPatchReturnIssueId(null);
              if (v !== 'issues') setIssueReturnView(null);
            }}
          >
            <TabsList className={styles.viewSwitcher}>
              {(['inbox', 'kanban', 'issues', 'patches', 'milestones', 'worktrees', 'files'] as const).map((v) => (
                <TabsTrigger
                  key={v}
                  value={v}
                  className={v === 'inbox' && unreadCount > 0 && activeView !== 'inbox' ? styles.viewTabUnread : ''}
                  badge={v === 'inbox' && unreadCount > 0 ? unreadCount : undefined}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <main className={styles.main}>
            {isRepoLoading && <div className={styles.loadingBar}><div className={styles.loadingBarInner} /></div>}
            {activeView === 'kanban' && (
              <KanbanBoard columns={columns} onChange={handleColumnsChange} onIssueMoved={handleIssueMoved} onPriorityChange={handlePriorityChange} onColumnsReorder={handleColumnsReorder} onIssueClick={handleIssueClick} onNewIssue={() => { setIssueCreating(true); setIssueReturnView(activeView); setActiveView('issues'); setSelectedIssueInView(null); }} canDrag={(issue) => canModify(issue.id)} columnColors={setup.columnColors?.[activeRid!] ?? {}} onColumnColorChange={handleColumnColorChange} onColumnRemove={handleColumnRemove} visibleColumns={setup.visibleColumns ?? columns.length} bannedDids={new Set((setup.bannedUsers ?? []).filter((b) => b.scope !== 'comments').map((b) => b.did))} onBanUser={handleBanUser} delegateDids={activeDelegateDids} myDid={myDid} onParentClick={handleIssueClick} />
            )}
            {activeView === 'issues' && (
              <IssuesView
                issueDetails={issueDetails}
                selectedIssueId={selectedIssueInView}
                onSelectIssue={setSelectedIssueInView}
                onReturn={issueReturnView ? () => {
                  setIssueReturnView(null);
                  setActiveView(issueReturnView);
                } : undefined}
                returnLabel={issueReturnView === 'kanban' ? 'Back to board' : issueReturnView ? `Back to ${issueReturnView}` : undefined}
                startCreating={issueCreating}
                onCreatingChange={setIssueCreating}
                initialListWidth={setup.issuesListWidth}
                onListWidthChange={handleIssuesListWidthChange}
              />
            )}
            {(activeView === 'patches' || activeView === 'patch-files') && (
              <div style={{ display: activeView === 'patch-files' ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                <PatchesView
                  patches={rawPatches}
                  selectedPatch={selectedPatch}
                  onSelectPatch={(p) => { setSelectedPatch(p); setPatchRevisionOverride(null); }}
                  revisionOverride={patchRevisionOverride}
                  isActive={activeView === 'patches'}
                  onReturn={patchReturnIssueId ? () => {
                    setSelectedIssueInView(patchReturnIssueId);
                    setPatchReturnIssueId(null);
                    setActiveView('issues');
                  } : patchReturnView ? () => {
                    const ret = patchReturnView;
                    setPatchReturnView(null);
                    setActiveView(ret);
                  } : undefined}
                  returnLabel={patchReturnIssueId ? `Back to issue ${patchReturnIssueId.slice(0, 7)}` : patchReturnView ? `Back to ${patchReturnView}` : undefined}
                />
              </div>
            )}
            {activeView === 'patch-files' && patchFilesCtx && activeRid && (
              <PatchFilesView
                rid={activeRid}
                fileDiffs={patchFilesCtx.fileDiffs}
                commitOid={patchFilesCtx.commitOid}
                patchTitle={patchFilesCtx.patchTitle}
                patchId={patchFilesCtx.patchId}
                initialRevisionId={patchFilesCtx.initialRevisionId}
                initialPath={patchFilesCtx.initialPath}
                onReturn={handlePatchFilesReturn}
              />
            )}
            {activeView === 'worktrees' && (
              <WorktreesView
                localRepoPath={activeRid ? (setup.localRepoPaths?.[activeRid] ?? null) : null}
                preferredEditor={setup.preferredEditor ?? null}
                onFindIssue={(prefix) => {
                  const id = [...issueDetails.keys()].find((k) => k.startsWith(prefix));
                  if (!id) return null;
                  return { id, title: issueDetails.get(id)!.title };
                }}
                onOpenIssue={(id) => { setSelectedIssueInView(id); setActiveView('issues'); }}
                onFindPatches={(prefix, head) => {
                  const prefixMatches = prefix
                    ? rawPatches.filter((p) => p.title.includes(prefix) || p.description.includes(prefix))
                    : [];
                  if (prefixMatches.length > 0) return prefixMatches.map((p) => ({ id: p.id, title: p.title, state: p.state, head: p.head }));
                  return rawPatches
                    .filter((p) => p.head === head)
                    .map((p) => ({ id: p.id, title: p.title, state: p.state, head: p.head }));
                }}
                onOpenPatch={(id) => {
                  const p = rawPatches.find((p) => p.id === id);
                  if (!p) return;
                  setSelectedPatch({ id: p.id, title: p.title, author: p.author, authorDid: p.authorDid, state: p.state, head: p.head });
                  setActiveView('patches');
                }}
              />
            )}
            {activeView === 'files' && activeRid && (
              <FilesView
                rid={activeRid}
                commitOid={filesCommitOid}
                initialPath={filesInitialPath}
                onReturn={filesReturnView ? handleFilesReturn : undefined}
                returnLabel={filesReturnView ? `Back to ${filesReturnView}` : undefined}
                refLabel={filesRefLabel ?? undefined}
                patches={rawPatches}
                delegateDids={repoDelegateDids.get(activeRid)}
                defaultBranch={repoDefaultBranches.get(activeRid)}
              />
            )}
            {activeView === 'milestones' && (
              <MilestonesView
                issueDetails={issueDetails}
                milestonePrefix={setup.milestonePrefix ?? 'milestone:'}
                onSelectIssue={(id) => { setSelectedIssueInView(id); setIssueReturnView('milestones'); setActiveView('issues'); }}
              />
            )}
            {activeView === 'inbox' && (
              <InboxView
                notifications={notifications}
                onMarkRead={handleMarkRead}
                onClear={handleClearNotifications}
                onNavigate={handleNotificationNavigate}
              />
            )}
          </main>

          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} onToggleTheme={toggleTheme} zoom={zoom} zoomIn={zoomIn} zoomOut={zoomOut} resetZoom={resetZoom} canZoomIn={canZoomIn} canZoomOut={canZoomOut} visibleColumns={setup.visibleColumns ?? columns.length} onVisibleColumnsChange={handleVisibleColumnsChange} explorerUrl={setup.explorerUrl ?? 'https://app.radicle.xyz'} onExplorerUrlChange={handleExplorerUrlChange} seedNode={setup.seedNode ?? 'seed.radicle.xyz'} onSeedNodeChange={handleSeedNodeChange} rids={setup.rids} repoNames={repoNames} localRepoPaths={setup.localRepoPaths ?? {}} onLocalPathChange={handleLocalPathChange} preferredEditor={setup.preferredEditor ?? ''} onEditorChange={handleEditorChange} inboxPageSize={setup.inboxPageSize ?? 50} onInboxPageSizeChange={handleInboxPageSizeChange} milestonePrefix={setup.milestonePrefix ?? 'milestone:'} onMilestonePrefixChange={handleMilestonePrefixChange} />
          <AddRepoModal
            open={addRepoOpen}
            existingRids={setup!.rids}
            onAdd={handleAddRepo}
            onClose={() => setAddRepoOpen(false)}
          />
          <ConfirmDialog
            open={confirmRemoveRid !== null}
            title="Remove board"
            message={`Remove "${repoNames.get(confirmRemoveRid ?? '') ?? confirmRemoveRid}" from your dashboard?`}
            confirmLabel="Remove"
            onConfirm={() => handleRemoveRepo(confirmRemoveRid!)}
            onCancel={() => setConfirmRemoveRid(null)}
          />
          <CloseIssueDialog
            open={pendingCloseIssue !== null}
            onClose={() => handleCloseIssueChoice('closed')}
            onSolved={() => handleCloseIssueChoice('solved')}
            onCancel={() => setPendingCloseIssue(null)}
          />
          <GlobalInboxPanel
            open={globalInboxOpen}
            notifications={globalNotifications}
            onClose={() => setGlobalInboxOpen(false)}
            onMarkRead={handleGlobalMarkRead}
            onClear={handleGlobalClear}
            onNavigate={handleNotificationNavigate}
          />

          <TerminalKeyboardShortcut />
          <TerminalPanel />

          <footer className={styles.footer}>
            <TerminalToggleButton />
            <button
              className={styles.footerIconBtn}
              onClick={() => handleRefresh()}
              title="Refresh issues &amp; patches"
              aria-label="Refresh"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15" />
              </svg>
            </button>
            <button
              className={styles.footerIconBtn}
              onClick={() => setSettingsOpen(true)}
              title="Settings"
              aria-label="Settings"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
            <div className={styles.footerSpacer} />
            <div className={styles.zoomControls}>
              <button className={styles.zoomBtn} onClick={zoomOut} disabled={!canZoomOut} aria-label="Zoom out">−</button>
              <button className={styles.zoomLevel} onClick={resetZoom} aria-label="Reset zoom">
                {Math.round(zoom * 100)}%
              </button>
              <button className={styles.zoomBtn} onClick={zoomIn} disabled={!canZoomIn} aria-label="Zoom in">+</button>
            </div>
            <div className={styles.footerSpacer} />
          </footer>
          </>
          </ActionsProvider>
          </TerminalProvider>
        </RepoProvider>
      )}
    </div>
  );
}

// ── Terminal helpers ───────────────────────────────────────────────────────────

function TerminalKeyboardShortcut() {
  const { toggle } = useTerminal();
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === '`' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);
  return null;
}

function TerminalToggleButton() {
  const { open, toggle } = useTerminal();
  return (
    <button
      className={`${styles.terminalBtn} ${open ? styles.terminalBtnActive : ''}`}
      onClick={toggle}
      title="Toggle terminal (Ctrl+`)"
    >
      {'>_'}
    </button>
  );
}
