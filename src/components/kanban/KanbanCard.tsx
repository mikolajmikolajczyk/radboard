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

export default function KanbanCard({ issue, isDragging, onPointerDown, onClick, onBan }: Props) {
  return (
    <div
      className={`${styles.card} ${isDragging ? styles.dragging : ''} ${issue.solved ? styles.cardSolved : ''}`}
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
        {issue.milestones?.map((ms) => (
          <span key={ms} className={styles.milestone}>{formatMilestoneDisplay(ms)}</span>
        ))}
        {issue.labels.map((label) => (
          <Label key={label.text} label={label} />
        ))}
        {issue.indicator && <Indicator indicator={issue.indicator} />}
      </div>
    </div>
  );
}
