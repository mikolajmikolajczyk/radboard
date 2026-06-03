import { useState, useMemo } from 'react';
import type { IssueDetail as IssueDetailType } from '../../types/kanban';
import { useRepo } from '../../contexts/RepoContext';
import { FilterChip } from '../../ui';
import { IssueIdBadge } from '../shared/IssueIdBadge';
import styles from './MilestonesView.module.css';

// ── Semver helpers ──────────────────────────────────────────────────────────────

interface SemVer {
  major: number;
  minor: number;
  patch: number;
  pre: string;
}

function parseSemver(raw: string): SemVer | null {
  const s = raw.startsWith('v') ? raw.slice(1) : raw;
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? '' };
}

function compareSemver(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.pre === b.pre) return 0;
  if (a.pre === '') return 1; // no pre > with pre
  if (b.pre === '') return -1;
  return a.pre < b.pre ? -1 : 1;
}

// ── Display name formatting ─────────────────────────────────────────────────────

export function formatMilestoneDisplay(name: string): string {
  // Semver names displayed as-is
  if (parseSemver(name)) return name;
  // Numeric prefix: strip "N-" and title-case remainder
  const m = name.match(/^\d+-(.+)$/);
  if (m) {
    const rest = m[1].replace(/-/g, ' ');
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return name;
}

// ── Milestone grouping ──────────────────────────────────────────────────────────

/** Per-state count for progress segments. stateId is the column id (e.g. "in-progress", "review") or "open"/"closed". */
interface StateCount {
  stateId: string;
  count: number;
}

interface MilestoneGroup {
  raw: string;       // label value after prefix
  display: string;   // formatted display name
  issues: IssueDetailType[];
  stateCounts: StateCount[];  // ordered: closed first, then dynamic states, then open
  closedCount: number;
  openCount: number;          // issues with no state: label and not closed
}

function issueStateId(issue: IssueDetailType): string {
  if (issue.status === 'closed' || issue.status === 'solved') return 'closed';
  const stateLabel = issue.labels.find((l) => l.text.startsWith('state:'));
  if (stateLabel) return stateLabel.text.slice(6);
  return 'open';
}

function buildMilestones(issues: IssueDetailType[]): MilestoneGroup[] {
  const map = new Map<string, IssueDetailType[]>();

  for (const issue of issues) {
    if (!issue.milestones) continue;
    for (const name of issue.milestones) {
      let arr = map.get(name);
      if (!arr) { arr = []; map.set(name, arr); }
      arr.push(issue);
    }
  }

  const groups: MilestoneGroup[] = [];
  for (const [raw, groupIssues] of map) {
    const counts = new Map<string, number>();
    for (const i of groupIssues) {
      const sid = issueStateId(i);
      counts.set(sid, (counts.get(sid) ?? 0) + 1);
    }
    // Order: closed first, then dynamic states alphabetically, then open last
    const stateCounts: StateCount[] = [];
    if (counts.has('closed')) stateCounts.push({ stateId: 'closed', count: counts.get('closed')! });
    for (const [sid, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (sid !== 'closed' && sid !== 'open') stateCounts.push({ stateId: sid, count });
    }
    if (counts.has('open')) stateCounts.push({ stateId: 'open', count: counts.get('open')! });

    groups.push({
      raw,
      display: formatMilestoneDisplay(raw),
      issues: groupIssues,
      stateCounts,
      closedCount: counts.get('closed') ?? 0,
      openCount: counts.get('open') ?? 0,
    });
  }

  // Sort: semver first (ascending), then non-semver alphabetically
  groups.sort((a, b) => {
    const aSv = parseSemver(a.raw);
    const bSv = parseSemver(b.raw);
    if (aSv && bSv) return compareSemver(aSv, bSv);
    if (aSv && !bSv) return -1;
    if (!aSv && bSv) return 1;
    return a.raw.localeCompare(b.raw);
  });

  return groups;
}

// ── Status badge color ──────────────────────────────────────────────────────────

function statusColor(status: string, columnColors: Record<string, string>): string {
  if (columnColors[status]) return columnColors[status];
  if (status === 'open') return 'var(--col-open-text)';
  if (status === 'closed' || status === 'solved') return 'var(--col-closed-text)';
  return 'var(--col-prog-text)';
}

function statusLabel(issue: IssueDetailType): string {
  // Closed/solved issues always show their terminal status, ignoring any lingering state:* label.
  if (issue.status !== 'open') return issue.status;
  const stateLabel = issue.labels.find((l) => l.text.startsWith('state:'));
  if (stateLabel) return stateLabel.text.slice(6);
  return issue.status;
}

// ── Component ───────────────────────────────────────────────────────────────────

type Filter = 'all' | 'active' | 'finished';

interface Props {
  issueDetails: Map<string, IssueDetailType>;
  milestonePrefix: string;
  onSelectIssue: (id: string) => void;
}

export default function MilestonesView({ issueDetails, milestonePrefix, onSelectIssue }: Props) {
  const { columnColors } = useRepo();
  const [filter, setFilter] = useState<Filter>('active');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const allIssues = useMemo(() => [...issueDetails.values()], [issueDetails]);
  const milestones = useMemo(() => buildMilestones(allIssues), [allIssues]);

  const filtered = useMemo(() => {
    if (filter === 'all') return milestones;
    return milestones.filter((ms) => {
      const isFinished = ms.closedCount === ms.issues.length;
      return filter === 'finished' ? isFinished : !isFinished;
    });
  }, [milestones, filter]);

  function toggleCollapse(raw: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(raw)) next.delete(raw); else next.add(raw);
      return next;
    });
  }

  if (milestones.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyInner}>
          <div className={styles.emptyTitle}>No milestones</div>
          <div className={styles.emptyHint}>
            Add a <code>{milestonePrefix}</code> label to any issue to create a milestone.
            <br />
            Example: <code>{milestonePrefix}v1.0.0</code>, <code>{milestonePrefix}0-alpha</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {([['active', 'Active'], ['finished', 'Finished'], ['all', 'All']] as const).map(([f, label]) => (
            <FilterChip key={f} active={filter === f} onClick={() => setFilter(f as Filter)}>
              {label}
            </FilterChip>
          ))}
        </div>
        <div className={styles.hint}>
          Tip: use numeric prefixes for ordering non-semver milestones (e.g. <code>0-alpha</code>, <code>1-beta</code>)
        </div>
      </div>

      <div className={styles.list}>
        {filtered.map((ms) => (
          <div key={ms.raw} className={styles.milestone}>
            <button className={styles.milestoneHeader} onClick={() => toggleCollapse(ms.raw)}>
              <span className={styles.chevron}>{collapsed.has(ms.raw) ? '▸' : '▾'}</span>
              <span className={styles.milestoneName}>{ms.display}</span>
              <span className={styles.milestoneCount}>
                {ms.stateCounts.map((sc, i) => (
                  <span key={sc.stateId}>
                    {i > 0 && <span className={styles.countSep}>·</span>}
                    <span style={{ color: statusColor(sc.stateId, columnColors) }}>
                      {sc.count} {sc.stateId}
                    </span>
                  </span>
                ))}
              </span>
            </button>
            {(() => {
              const total = ms.issues.length;
              const isComplete = ms.closedCount === total;
              return (
                <div className={`${styles.milestoneProgress} ${isComplete ? styles.progressComplete : ''}`}>
                  {ms.stateCounts.map((sc) => (
                    <span
                      key={sc.stateId}
                      className={styles.progressSegment}
                      style={{
                        width: `${total ? Math.round((sc.count / total) * 100) : 0}%`,
                        background: statusColor(sc.stateId, columnColors),
                      }}
                    />
                  ))}
                </div>
              );
            })()}
            {!collapsed.has(ms.raw) && (
              <div className={styles.issueList}>
                {ms.issues.map((issue) => {
                  const sl = statusLabel(issue);
                  const color = statusColor(sl, columnColors);
                  return (
                    <button
                      key={issue.id}
                      className={styles.issueRow}
                      onClick={() => onSelectIssue(issue.id)}
                    >
                      <span className={styles.badge} style={{ color, borderColor: color }}>
                        {sl}
                      </span>
                      <IssueIdBadge id={issue.id} />
                      <span className={styles.issueTitle}>{issue.title}</span>
                      <span className={styles.issueAuthor}>{issue.author}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
