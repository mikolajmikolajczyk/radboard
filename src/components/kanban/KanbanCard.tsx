import type { Issue, IssueLabel, IssueIndicator } from '../../types/kanban';
import { formatMilestoneDisplay } from '../milestones/MilestonesView';
import { IssueIdBadge } from '../shared/IssueIdBadge';
import styles from './KanbanCard.module.css';

interface Props {
  issue: Issue;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: (id: string) => void;
  onBan?: () => void;
  onParentClick?: (parentId: string) => void;
}

function formatAuthor(author: string): string {
  // "did:key:z6Mk..." → "z6Mk…XXXX" (last 4 chars)
  if (author.startsWith('did:key:')) {
    const key = author.slice('did:key:'.length);
    return key.slice(0, 6) + '…' + key.slice(-4);
  }
  return author;
}

const LABEL_VARIANTS: Record<string, string> = {
  refactor: styles.labelRefactor,
  dedup: styles.labelDedup,
  inconsistency: styles.labelInconsistency,
};

function Label({ label }: { label: IssueLabel }) {
  const cls = LABEL_VARIANTS[label.variant] ?? styles.labelDefault;
  return <span className={`${styles.label} ${cls}`}>{label.text}</span>;
}

function Indicator({ indicator }: { indicator: IssueIndicator }) {
  return (
    <div className={styles.indicator}>
      {indicator.upvotes !== undefined && (
        <span><span className={styles.indicatorDot}>▲</span>{indicator.upvotes}</span>
      )}
      {indicator.downvotes !== undefined && (
        <span><span className={styles.indicatorDot}>▼</span>{indicator.downvotes}</span>
      )}
      {indicator.comments !== undefined && (
        <span><span className={styles.indicatorDot}>◆</span>{indicator.comments}</span>
      )}
      {indicator.patches !== undefined && (
        <span><span className={styles.indicatorDot}>⎇</span>{indicator.patches}</span>
      )}
    </div>
  );
}

export default function KanbanCard({ issue, isDragging, onPointerDown, onClick, onBan, onParentClick }: Props) {
  const isBlocked = (issue.blockedBy?.length ?? 0) > 0;
  const blockedTitle = issue.blockedBy?.map((b) => `blocked by ${b.linkedIssueId ? b.raw : b.raw}`).join('; ');
  return (
    <div
      className={`${styles.card} ${isDragging ? styles.dragging : ''} ${issue.solved ? styles.cardSolved : ''} ${isBlocked ? styles.cardBlocked : ''}`}
      onPointerDown={onPointerDown}
      onClick={() => onClick(issue.id)}
    >
      {issue.solved && <span className={styles.solvedBadge}>solved</span>}
      <div className={styles.meta}>
        <IssueIdBadge id={issue.id} className={styles.issueId} />
        {onBan && (
          <button
            className={styles.banBtn}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onBan(); }}
            title="Ban user"
          >⊘</button>
        )}
        <span className={`${styles.author} ${!onBan ? styles.authorRight : ''}`}>
          <span className={styles.at}>@</span>
          {formatAuthor(issue.author)}
        </span>
      </div>

      <p className={styles.title}>{issue.title}</p>

      <div className={styles.footer}>
        {isBlocked && (
          <span className={styles.blockedPill} title={blockedTitle}>blocked</span>
        )}
        {issue.blockedIssueIds && issue.blockedIssueIds.length > 0 && (
          <span className={styles.blocksPill} title={`blocks ${issue.blockedIssueIds.length} issue${issue.blockedIssueIds.length === 1 ? '' : 's'}`}>
            blocks {issue.blockedIssueIds.length}
          </span>
        )}
        {issue.isEpic && (
          <span className={styles.epicPill} title={issue.epicChildIds ? `epic with ${issue.epicChildIds.length} child${issue.epicChildIds.length === 1 ? '' : 'ren'}` : 'epic (no children yet)'}>
            epic{issue.epicChildIds ? ` ${issue.epicChildIds.length}` : ''}
          </span>
        )}
        {issue.parentRaw && (
          <span
            className={`${styles.parentPill} ${!issue.parentId ? styles.parentPillOrphan : ''}`}
            title={issue.parentId ? 'open parent epic' : `parent ${issue.parentRaw} not loaded`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (issue.parentId && onParentClick) onParentClick(issue.parentId);
            }}
          >
            ↑ #{issue.parentRaw}
          </span>
        )}
        {issue.milestones?.map((ms) => (
          <span key={ms} className={styles.milestone}>{formatMilestoneDisplay(ms)}</span>
        ))}
        {issue.assignees?.map((a) => (
          <span key={a.did} className={styles.assignee} title={a.did}>@{a.alias}</span>
        ))}
        {issue.labels.map((label) => (
          <Label key={label.text} label={label} />
        ))}
        {issue.indicator && <Indicator indicator={issue.indicator} />}
      </div>
    </div>
  );
}
