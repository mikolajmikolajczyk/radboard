import { useState, useRef, useEffect } from 'react';
import IssueDetail from './IssueDetail';
import NewIssueForm from './NewIssueForm';
import type { IssueDetail as IssueDetailType } from '../../types/kanban';
import { useRepo } from '../../contexts/RepoContext';
import { useActions } from '../../contexts/ActionsContext';
import { FilterChip, useResizableDivider, useOutsideClick } from '../../ui';
import { PrioritySelector } from './PrioritySelector';
import { formatMilestoneDisplay } from '../milestones/MilestonesView';
import { IssueIdBadge } from '../shared/IssueIdBadge';
import styles from './IssuesView.module.css';

type Filter = 'all' | 'open' | 'closed' | string; // string covers dynamic state: labels

function getStateBadgeColor(colId: string, columnColors: Record<string, string>): string {
  if (columnColors[colId]) return columnColors[colId];
  if (colId === 'new' || colId === 'open') return 'var(--col-open-text)';
  if (colId === 'closed') return 'var(--col-closed-text)';
  return 'var(--col-prog-text)';
}

interface Props {
  issueDetails: Map<string, IssueDetailType>;
  selectedIssueId: string | null;
  onSelectIssue: (id: string | null) => void;
  onReturn?: () => void;
  returnLabel?: string;
  startCreating?: boolean;
  onCreatingChange?: (creating: boolean) => void;
}

export default function IssuesView({
  issueDetails,
  selectedIssueId,
  onSelectIssue,
  onReturn,
  returnLabel,
  startCreating,
  onCreatingChange,
}: Props) {
  const { columnColors, myDid, delegateDids } = useRepo();
  const { onPriorityChange } = useActions();
  const isDelegate = myDid !== null && delegateDids.includes(myDid);
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [labelFilters, setLabelFilters] = useState<Map<string, 'or' | 'and'>>(new Map());
  const [labelDropdownOpen, setLabelDropdownOpen] = useState(false);
  const [assigneeFilters, setAssigneeFilters] = useState<Set<string>>(new Set());
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);
  const [issueSidebarWidth, setIssueSidebarWidth] = useState(210);
  const [creatingNew, _setCreatingNew] = useState(!!startCreating);
  function setCreatingNew(v: boolean) {
    _setCreatingNew(v);
    onCreatingChange?.(v);
  }

  useEffect(() => {
    if (startCreating) _setCreatingNew(true);
  }, [startCreating]);
  const labelDropdownRef = useRef<HTMLDivElement>(null);
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);

  const { width: listWidth, dividerProps, isDragging } = useResizableDivider({
    initial: Math.round(window.innerWidth / 2), min: 200, max: Math.round(window.innerWidth * 0.75),
  });

  useOutsideClick(labelDropdownRef, () => setLabelDropdownOpen(false), labelDropdownOpen);
  useOutsideClick(assigneeDropdownRef, () => setAssigneeDropdownOpen(false), assigneeDropdownOpen);

  // Sort: uncategorized (no priority) first, then by priority level, then by date desc
  const priorityRank: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
  const allIssues = [...issueDetails.values()].sort((a, b) => {
    const aRank = a.priority ? priorityRank[a.priority] : 0;
    const bRank = b.priority ? priorityRank[b.priority] : 0;
    if (aRank !== bRank) return aRank - bRank;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  // Collect unique dynamic states from state: labels, preserving first-seen order
  const dynamicStates = [...new Set(
    allIssues.flatMap((i) =>
      i.labels.map((l) => l.text).filter((t) => t.startsWith('state:')).map((t) => t.slice(6)),
    ),
  )];

  function issueMatchesFilter(i: IssueDetailType, f: Filter): boolean {
    if (f === 'all') return true;
    const isClosed = i.status === 'closed' || i.status === 'solved';
    if (f === 'closed') return isClosed;
    if (f === 'open') return !isClosed && !i.labels.some((l) => l.text.startsWith('state:'));
    // dynamic state
    return i.labels.some((l) => l.text === `state:${f}`);
  }

  // Collect unique non-state: labels from all issues
  const allLabels = [...new Set(
    allIssues.flatMap((i) => i.labels.map((l) => l.text).filter((t) => !t.startsWith('state:'))),
  )];

  // Collect unique assignees from all issues, keyed by DID, keeping first-seen alias
  const allAssigneesMap = new Map<string, string>();
  for (const i of allIssues) {
    for (const a of i.assignees ?? []) {
      if (!allAssigneesMap.has(a.did)) allAssigneesMap.set(a.did, a.alias);
    }
  }
  const allAssignees = [...allAssigneesMap.entries()].map(([did, alias]) => ({ did, alias }));

  function toggleAssigneeFilter(did: string) {
    setAssigneeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(did)) next.delete(did); else next.add(did);
      return next;
    });
  }

  function cycleLabelFilter(label: string) {
    setLabelFilters((prev) => {
      const next = new Map(prev);
      const cur = next.get(label);
      if (!cur) next.set(label, 'or');
      else if (cur === 'or') next.set(label, 'and');
      else next.delete(label);
      return next;
    });
  }

  const orLabels = [...labelFilters.entries()].filter(([, m]) => m === 'or').map(([l]) => l);
  const andLabels = [...labelFilters.entries()].filter(([, m]) => m === 'and').map(([l]) => l);

  const searchLower = search.toLowerCase();
  const filtered = allIssues.filter(
    (i) => issueMatchesFilter(i, filter) &&
           (orLabels.length === 0 || orLabels.some((lf) => i.labels.some((l) => l.text === lf))) &&
           andLabels.every((lf) => i.labels.some((l) => l.text === lf)) &&
           (assigneeFilters.size === 0 ||
             (i.assignees?.some((a) => assigneeFilters.has(a.did)) ?? false)) &&
           (searchLower === '' || i.title.toLowerCase().includes(searchLower) || i.author.toLowerCase().includes(searchLower)),
  );

  const allFilters: Filter[] = ['all', 'open', ...dynamicStates, 'closed'];
  const counts = Object.fromEntries(allFilters.map((f) => [f, allIssues.filter((i) => issueMatchesFilter(i, f)).length]));

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (!selectedIssueId || filtered.length === 0) return;
      e.preventDefault();
      const idx = filtered.findIndex((i) => i.id === selectedIssueId);
      const next = e.key === 'ArrowDown'
        ? Math.min(idx + 1, filtered.length - 1)
        : Math.max(idx - 1, 0);
      if (next !== idx) {
        onSelectIssue(filtered[next].id);
        (document.activeElement as HTMLElement)?.blur();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filtered, selectedIssueId, onSelectIssue]);

  useEffect(() => {
    if (!selectedIssueId || !listRef.current) return;
    listRef.current.querySelector<HTMLElement>(`[data-id="${selectedIssueId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIssueId]);

  const selectedIssue = selectedIssueId ? (issueDetails.get(selectedIssueId) ?? null) : null;
  const currentColumnId = selectedIssue
    ? (selectedIssue.status === 'closed' || selectedIssue.status === 'solved'
        ? 'closed'
        : (selectedIssue.labels.find((l) => l.text.startsWith('state:'))?.text.slice(6) ?? 'open'))
    : 'open';
  return (
    <div className={styles.container}>
      {isDragging && <div className={styles.dragOverlay} />}
      {/* Left: issue list */}
      <div className={styles.listPanel} style={{ width: listWidth }}>
        {onReturn && (
          <button className={styles.returnBtn} onClick={onReturn}>
            ← {returnLabel ?? 'Back'}
          </button>
        )}
        <div className={styles.filters}>
          {allFilters.map((f) => (
            <FilterChip
              key={f}
              active={filter === f}
              count={counts[f]}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </FilterChip>
          ))}
          {[...labelFilters.entries()].map(([label, mode], idx) => (
            <span key={label} className={styles.activeLabelChip}>
              {idx > 0 && (
                <span className={styles.filterConnector}>
                  {mode === 'and' ? 'and' : 'or'}
                </span>
              )}
              <FilterChip
                className={mode === 'and' ? styles.pillAnd : styles.pillOr}
                active
                onClick={() => cycleLabelFilter(label)}
                title="Click to toggle: or → and → off"
              >
                {label} <span className={styles.pillMode}>{mode}</span>
              </FilterChip>
            </span>
          ))}
          <button
            className={styles.newIssueBtn}
            onClick={() => { setCreatingNew(true); onSelectIssue(null); }}
            title="Create new issue"
          >+ New issue</button>
          {[...assigneeFilters].map((did) => {
            const alias = allAssigneesMap.get(did) ?? did;
            return (
              <FilterChip
                key={did}
                active
                onClick={() => toggleAssigneeFilter(did)}
                title={did}
              >
                @{alias} ✕
              </FilterChip>
            );
          })}
          {allAssignees.length > 0 && (
            <div className={styles.labelDropdownWrap} ref={assigneeDropdownRef}>
              <FilterChip
                active={assigneeFilters.size > 0}
                onClick={() => setAssigneeDropdownOpen((o) => !o)}
              >
                Assignee ▾
              </FilterChip>
              {assigneeDropdownOpen && (
                <div className={styles.labelDropdown}>
                  {allAssignees.map(({ did, alias }) => {
                    const count = allIssues.filter(
                      (i) => issueMatchesFilter(i, filter) && i.assignees?.some((a) => a.did === did),
                    ).length;
                    const active = assigneeFilters.has(did);
                    return (
                      <button
                        key={did}
                        className={`${styles.labelOption} ${active ? styles.labelOptionActive : ''}`}
                        onClick={() => toggleAssigneeFilter(did)}
                        title={did}
                      >
                        <span className={`${styles.labelOptionMode} ${active ? styles.modeOr : ''}`}>
                          {active ? '✓' : '·'}
                        </span>
                        <span className={styles.labelOptionText}>@{alias}</span>
                        <span className={styles.labelOptionCount}>{count}</span>
                      </button>
                    );
                  })}
                  {assigneeFilters.size > 0 && (
                    <button
                      className={styles.labelClear}
                      onClick={() => { setAssigneeFilters(new Set()); setAssigneeDropdownOpen(false); }}
                    >Clear</button>
                  )}
                </div>
              )}
            </div>
          )}
          {allLabels.length > 0 && (
            <div className={styles.labelDropdownWrap} ref={labelDropdownRef}>
              <FilterChip
                active={labelFilters.size > 0}
                onClick={() => setLabelDropdownOpen((o) => !o)}
              >
                Label ▾
              </FilterChip>
              {labelDropdownOpen && (
                <div className={styles.labelDropdown}>
                  {allLabels.map((label) => {
                    const count = allIssues.filter((i) => issueMatchesFilter(i, filter) && i.labels.some((l) => l.text === label)).length;
                    const mode = labelFilters.get(label);
                    return (
                      <button
                        key={label}
                        className={`${styles.labelOption} ${mode ? styles.labelOptionActive : ''}`}
                        onClick={() => cycleLabelFilter(label)}
                      >
                        <span className={`${styles.labelOptionMode} ${mode === 'or' ? styles.modeOr : mode === 'and' ? styles.modeAnd : ''}`}>
                          {mode ?? '·'}
                        </span>
                        <span className={styles.labelOptionText}>{label}</span>
                        <span className={styles.labelOptionCount}>{count}</span>
                      </button>
                    );
                  })}
                  {labelFilters.size > 0 && (
                    <button
                      className={styles.labelClear}
                      onClick={() => { setLabelFilters(new Map()); setLabelDropdownOpen(false); }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.searchBar}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search issues…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.searchClear} onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className={styles.empty}>No {filter === 'all' ? '' : filter + ' '}issues</div>

        ) : (
          <div className={styles.list} ref={listRef}>
            {filtered.map((issue) => (
              <button
                key={issue.id}
                data-id={issue.id}
                className={`${styles.row} ${selectedIssueId === issue.id ? styles.rowActive : ''} ${(issue.blockedBy?.length ?? 0) > 0 ? styles.rowBlocked : ''}`}
                onClick={() => { setCreatingNew(false); onSelectIssue(issue.id); }}
              >
                <IssueIdBadge id={issue.id} />
                {(() => {
                  const colId = issue.status === 'closed' || issue.status === 'solved'
                    ? (issue.status === 'solved' ? 'solved' : 'closed')
                    : (issue.labels.find((l) => l.text.startsWith('state:'))?.text.slice(6) ?? 'open');
                  const badgeColor = issue.status === 'solved'
                    ? '#86efac'
                    : getStateBadgeColor(colId, columnColors);
                  return (
                    <span
                      className={styles.badge}
                      style={{ color: badgeColor, borderColor: badgeColor }}
                    >
                      {colId}
                    </span>
                  );
                })()}
                {issue.status === 'open' && !issue.labels.some((l) => l.text.startsWith('state:')) ? (
                  <span onClick={(e) => e.stopPropagation()}>
                    <PrioritySelector
                      current={issue.priority}
                      canEdit={isDelegate || (myDid !== null && issue.authorDid === myDid)}
                      onSelect={(p) => onPriorityChange(issue.id, p)}
                      compact
                    />
                  </span>
                ) : (
                  <span className={styles.prioSpacer} />
                )}
                <span className={styles.rowTitle}>{issue.title}</span>
                {(issue.blockedBy?.length ?? 0) > 0 && (
                  <span className={styles.rowBlockedPill} title={issue.blockedBy!.map((b) => `blocked by ${b.raw}`).join('; ')}>blocked</span>
                )}
                {issue.blockedIssueIds && issue.blockedIssueIds.length > 0 && (
                  <span className={styles.rowBlocksPill}>blocks {issue.blockedIssueIds.length}</span>
                )}
                {issue.isEpic && (
                  <span className={styles.rowEpicPill} title={issue.epicChildIds ? `epic with ${issue.epicChildIds.length} child${issue.epicChildIds.length === 1 ? '' : 'ren'}` : 'epic (no children yet)'}>
                    epic{issue.epicChildIds ? ` ${issue.epicChildIds.length}` : ''}
                  </span>
                )}
                {issue.parentRaw && (
                  <span
                    className={`${styles.rowParentPill} ${!issue.parentId ? styles.rowParentPillOrphan : ''}`}
                    title={issue.parentId ? 'open parent epic' : `parent ${issue.parentRaw} not loaded`}
                    onClick={(e) => {
                      if (!issue.parentId) return;
                      e.stopPropagation();
                      onSelectIssue(issue.parentId);
                    }}
                  >
                    ↑ #{issue.parentRaw}
                  </span>
                )}
                {issue.milestones && issue.milestones.length > 0 && (
                  <span className={styles.rowLabels}>
                    {issue.milestones.map((ms) => (
                      <span key={ms} className={styles.rowMilestone}>{formatMilestoneDisplay(ms)}</span>
                    ))}
                  </span>
                )}
                {issue.labels.filter((l) => !l.text.startsWith('state:')).length > 0 && (
                  <span className={styles.rowLabels}>
                    {issue.labels.filter((l) => !l.text.startsWith('state:')).map((l) => (
                      <span key={l.text} className={styles.rowLabel}>{l.text}</span>
                    ))}
                  </span>
                )}
                {issue.assignees && issue.assignees.length > 0 && (
                  <span className={styles.rowLabels}>
                    {issue.assignees.map((a) => (
                      <span key={a.did} className={styles.rowAssignee} title={a.did}>@{a.alias}</span>
                    ))}
                  </span>
                )}
                <span className={styles.author}>{issue.author}</span>
                <span className={styles.date}>{issue.createdAt.slice(0, 10)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className={styles.divider} {...dividerProps} />

      {/* Right: issue detail or new issue form */}
      <div className={styles.detailPanel}>
        {creatingNew ? (
          <NewIssueForm
            onCreated={(issueId) => { setCreatingNew(false); onSelectIssue(issueId); }}
            onCancel={() => setCreatingNew(false)}
          />
        ) : selectedIssue ? (
          <IssueDetail
            key={selectedIssue.id}
            issue={selectedIssue}
            embedded
            onClose={() => onSelectIssue(null)}
            currentColumnId={currentColumnId}
            sidebarWidth={issueSidebarWidth}
            onSidebarWidthChange={setIssueSidebarWidth}
            allIssues={issueDetails}
            onNavigateIssue={(id) => { setCreatingNew(false); onSelectIssue(id); }}
          />
        ) : (
          <div className={styles.emptyDetail}>Select an issue to view details</div>
        )}
      </div>
    </div>
  );
}
