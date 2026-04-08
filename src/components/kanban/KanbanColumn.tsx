import { AnimatePresence, motion } from 'framer-motion';
import type { Issue, KanbanColumnData, PriorityLevel } from '../../types/kanban';
import { PRIORITY_LEVELS } from '../../types/kanban';
import KanbanCard from './KanbanCard';
import styles from './KanbanColumn.module.css';

interface Props {
  column: KanbanColumnData;
  draggingId: string | null;
  /** undefined = not the drop target; null = insert at end; string = insert before that card */
  insertBeforeId: string | null | undefined;
  /** Which priority zone the drop target is in (only for open column) */
  insertZone?: PriorityLevel;
  onPointerDown: (e: React.PointerEvent, issue: Issue) => void;
  onColumnPointerDown?: (e: React.PointerEvent, column: KanbanColumnData) => void;
  onRightClick?: (e: React.MouseEvent) => void;
  onIssueClick: (id: string) => void;
  isOver: boolean;
  isColInsertBefore?: boolean;
  isColDragging?: boolean;
  color?: string;
  onNewIssue?: () => void;
  canDrag?: (issue: Issue) => boolean;
  onBan?: (issue: Issue) => (() => void) | undefined;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const STATIC_STYLES: Record<string, string> = {
  new:    styles.colNew,
  open:   styles.colOpen,
  closed: styles.colClosed,
};

type Item = { type: 'card'; issue: Issue } | { type: 'placeholder' };

function buildItems(issues: Issue[], insertBeforeId: string | null | undefined): Item[] {
  const items: Item[] = [];
  if (insertBeforeId === undefined) {
    for (const issue of issues) items.push({ type: 'card', issue });
    return items;
  }
  for (const issue of issues) {
    if (insertBeforeId === issue.id) items.push({ type: 'placeholder' });
    items.push({ type: 'card', issue });
  }
  if (insertBeforeId === null) items.push({ type: 'placeholder' });
  return items;
}

const ZONE_META: Record<PriorityLevel, { label: string; style: string }> = {
  critical: { label: 'Critical', style: styles.zoneCritical },
  high:     { label: 'High',     style: styles.zoneHigh },
  medium:   { label: 'Medium',   style: styles.zoneMedium },
  low:      { label: 'Low',      style: styles.zoneLow },
};

function renderItems(
  items: Item[],
  draggingId: string | null,
  onPointerDown: (e: React.PointerEvent, issue: Issue) => void,
  onIssueClick: (id: string) => void,
  canDrag?: (issue: Issue) => boolean,
  onBan?: (issue: Issue) => (() => void) | undefined,
) {
  return (
    <AnimatePresence initial={false}>
      {items.map((item) =>
        item.type === 'placeholder' ? (
          <motion.div
            key="placeholder"
            className={styles.placeholder}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          />
        ) : (
          <motion.div
            key={item.issue.id}
            layout
            data-card-id={item.issue.id}
            transition={{ layout: { duration: draggingId ? 0 : 0.2 } }}
            onPointerDown={
              canDrag == null || canDrag(item.issue)
                ? (e: React.PointerEvent) => onPointerDown(e, item.issue)
                : undefined
            }
          >
            <KanbanCard
              issue={item.issue}
              isDragging={draggingId === item.issue.id}
              onPointerDown={() => {}}
              onClick={onIssueClick}
              onBan={onBan?.(item.issue)}
            />
          </motion.div>
        )
      )}
    </AnimatePresence>
  );
}

export default function KanbanColumn({
  column,
  draggingId,
  insertBeforeId,
  insertZone,
  onPointerDown,
  onColumnPointerDown,
  onRightClick,
  onIssueClick,
  isOver,
  isColInsertBefore,
  isColDragging,
  color,
  onNewIssue,
  canDrag,
  onBan,
}: Props) {
  const colStyle = STATIC_STYLES[column.id] ?? styles.colDynamic;
  const isOpenColumn = column.id === 'open';

  const headerStyle = color ? { background: hexToRgba(color, 0.14) } : undefined;
  const titleStyle = color ? { color } : undefined;
  const badgeStyle = color ? { background: hexToRgba(color, 0.2), color } : undefined;
  const dropZoneStyle = color ? { borderColor: hexToRgba(color, 0.4) } : undefined;

  if (isOpenColumn) {
    // Group issues by priority zone; unsorted = no priority label
    const grouped: Record<PriorityLevel, Issue[]> = { critical: [], high: [], medium: [], low: [] };
    const unsorted: Issue[] = [];
    for (const issue of column.issues) {
      if (issue.priority) {
        grouped[issue.priority].push(issue);
      } else {
        unsorted.push(issue);
      }
    }

    return (
      <div
        className={`${styles.column} ${colStyle} ${isColDragging ? styles.colDraggingSource : ''} ${isColInsertBefore ? styles.colInsertBefore : ''}`}
        data-column-root-id={column.id}
      >
        <div className={styles.header} style={headerStyle} onContextMenu={onRightClick}>
          <span className={styles.title} style={titleStyle}>{column.title}</span>
          <div className={styles.headerRight}>
            {onNewIssue && (
              <button className={styles.addBtn} onClick={onNewIssue} title="New issue">+</button>
            )}
            <span className={styles.badge} style={badgeStyle}>{column.issues.length}</span>
          </div>
        </div>

        <div
          className={`${styles.dropZone} ${styles.dropZoneZoned} ${isOver ? styles.dragOver : ''}`}
          style={dropZoneStyle}
          data-column-id={column.id}
        >
          {PRIORITY_LEVELS.map((level) => {
            const meta = ZONE_META[level];
            const zoneIssues = grouped[level];
            const isZoneOver = isOver && insertZone === level;
            const zoneInsertBeforeId = isZoneOver ? insertBeforeId : undefined;
            const items = buildItems(zoneIssues, zoneInsertBeforeId);

            return (
              <div
                key={level}
                className={`${styles.zone} ${meta.style} ${isZoneOver ? styles.zoneOver : ''}`}
                data-zone-id={level}
              >
                <div className={styles.zoneHeader}>
                  <span className={styles.zoneDot} />
                  <span className={styles.zoneLabel}>{meta.label}</span>
                  {zoneIssues.length > 0 && (
                    <span className={styles.zoneCount}>{zoneIssues.length}</span>
                  )}
                </div>
                <div className={styles.zoneContent}>
                  {items.length === 0 ? (
                    <div className={styles.zoneEmpty} />
                  ) : (
                    renderItems(items, draggingId, onPointerDown, onIssueClick, canDrag, onBan)
                  )}
                </div>
              </div>
            );
          })}

          {/* Uncategorized zone — issues without a priority label; hidden when empty */}
          {(unsorted.length > 0 || (isOver && !insertZone)) && (() => {
            const isZoneOver = isOver && !insertZone;
            const zoneInsertBeforeId = isZoneOver ? insertBeforeId : undefined;
            const items = buildItems(unsorted, zoneInsertBeforeId);
            return (
              <div
                className={`${styles.zone} ${styles.zoneUncategorized} ${isZoneOver ? styles.zoneOver : ''}`}
                data-zone-id="uncategorized"
              >
                <div className={styles.zoneHeader}>
                  <span className={styles.zoneDot} />
                  <span className={styles.zoneLabel}>Uncategorized</span>
                  {unsorted.length > 0 && (
                    <span className={styles.zoneCount}>{unsorted.length}</span>
                  )}
                </div>
                <div className={styles.zoneContent}>
                  {items.length === 0 ? (
                    <div className={styles.zoneEmpty} />
                  ) : (
                    renderItems(items, draggingId, onPointerDown, onIssueClick, canDrag, onBan)
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // Non-open columns: flat list (original behavior)
  const items = buildItems(column.issues, insertBeforeId);
  const isEmpty = column.issues.length === 0 && insertBeforeId === undefined;

  return (
    <div
      className={`${styles.column} ${colStyle} ${isColDragging ? styles.colDraggingSource : ''} ${isColInsertBefore ? styles.colInsertBefore : ''}`}
      data-column-root-id={column.id}
    >
      <div className={styles.header} style={headerStyle} onContextMenu={onRightClick}>
        {!column.isStatic && (
          <div
            className={styles.dragHandle}
            onPointerDown={(e) => onColumnPointerDown?.(e, column)}
            title="Drag to reorder column"
          >⠿</div>
        )}
        <span className={styles.title} style={titleStyle}>{column.title}</span>
        <div className={styles.headerRight}>
          {onNewIssue && (
            <button className={styles.addBtn} onClick={onNewIssue} title="New issue">+</button>
          )}
          <span className={styles.badge} style={badgeStyle}>{column.issues.length}</span>
        </div>
      </div>

      <div
        className={`${styles.dropZone} ${isOver ? styles.dragOver : ''}`}
        style={dropZoneStyle}
        data-column-id={column.id}
      >
        {isEmpty ? (
          <div className={styles.empty}>no issues</div>
        ) : (
          renderItems(items, draggingId, onPointerDown, onIssueClick, canDrag, onBan)
        )}
      </div>
    </div>
  );
}
