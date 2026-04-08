import { useEffect, useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { createPortal } from 'react-dom';
import type { KanbanColumnData, Issue, PriorityLevel } from '../../types/kanban';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import styles from './KanbanBoard.module.css';

const SWATCHES: (string | null)[] = [
  null,
  '#7c6aff', '#4a9eff', '#34c759', '#ff9500',
  '#ff3b30', '#ff2d8b', '#00c7be', '#af52de',
];

interface Props {
  columns: KanbanColumnData[];
  onChange: (columns: KanbanColumnData[]) => void;
  onIssueMoved?: (issueId: string, fromColId: string, toColId: string) => void;
  onPriorityChange?: (issueId: string, priority: PriorityLevel | null) => void;
  onColumnsReorder?: (columns: KanbanColumnData[]) => void;
  onIssueClick: (id: string) => void;
  onNewIssue: () => void;
  canDrag?: (issue: Issue) => boolean;
  columnColors?: Record<string, string>;
  onColumnColorChange?: (colId: string, color: string | null) => void;
  onColumnRemove?: (colId: string) => void;
  visibleColumns?: number;
  bannedDids?: Set<string>;
  onBanUser?: (did: string, alias: string, scope: 'all' | 'issues' | 'comments') => void;
  delegateDids?: string[];
  myDid?: string | null;
}

interface InsertInfo {
  columnId: string;
  beforeId: string | null;
  zone?: PriorityLevel;
}

interface PendingDrag {
  issue: Issue;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  cardWidth: number;
}

interface ActiveDrag extends PendingDrag {
  currentX: number;
  currentY: number;
}

interface ColPending {
  columnId: string;
  startX: number;
  startY: number;
}

interface ColActive {
  columnId: string;
  currentX: number;
  currentY: number;
  ghostWidth: number;
}

export default function KanbanBoard({
  columns,
  onChange,
  onIssueMoved,
  onPriorityChange,
  onColumnsReorder,
  onIssueClick,
  onNewIssue,
  canDrag,
  columnColors = {},
  onColumnColorChange,
  onColumnRemove,
  visibleColumns = 4,
  bannedDids,
  onBanUser,
  delegateDids = [],
  myDid = null,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [insertInfo, setInsertInfo] = useState<InsertInfo | null>(null);
  const [colDraggingId, setColDraggingId] = useState<string | null>(null);
  const [colInsertBefore, setColInsertBefore] = useState<string | null | undefined>(undefined);
  const [colorMenu, setColorMenu] = useState<{ colId: string; x: number; y: number; isStatic: boolean } | null>(null);
  const [customPickerColor, setCustomPickerColor] = useState<string>('#7c6aff');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startScrollLeft: number } | null>(null);

  const pendingRef = useRef<PendingDrag | null>(null);
  const activeRef = useRef<ActiveDrag | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const insertInfoRef = useRef<InsertInfo | null>(null);

  const colPendingRef = useRef<ColPending | null>(null);
  const colActiveRef = useRef<ColActive | null>(null);
  const colGhostRef = useRef<HTMLDivElement | null>(null);
  const colInsertBeforeRef = useRef<string | null | undefined>(undefined);

  const onChangeRef = useRef(onChange);
  const onIssueMoveRef = useRef(onIssueMoved);
  const onPriorityChangeRef = useRef(onPriorityChange);
  const onColumnsReorderRef = useRef(onColumnsReorder);
  const columnsRef = useRef(columns);

  onChangeRef.current = onChange;
  onIssueMoveRef.current = onIssueMoved;
  onPriorityChangeRef.current = onPriorityChange;
  onColumnsReorderRef.current = onColumnsReorder;
  columnsRef.current = columns;

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      // ── Column drag ──────────────────────────────────────────
      if (colPendingRef.current && !colActiveRef.current) {
        const { startX, startY, columnId } = colPendingRef.current;
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
        const colEl = document.querySelector<HTMLElement>(`[data-column-root-id="${columnId}"]`);
        const ghostWidth = colEl?.getBoundingClientRect().width ?? 200;
        colActiveRef.current = { columnId, currentX: e.clientX, currentY: e.clientY, ghostWidth };
        colPendingRef.current = null;
        document.body.style.userSelect = 'none';
        setColDraggingId(columnId);
        return;
      }

      if (colActiveRef.current) {
        e.preventDefault();
        colActiveRef.current.currentX = e.clientX;
        colActiveRef.current.currentY = e.clientY;
        if (colGhostRef.current) {
          colGhostRef.current.style.transform =
            `translate(${e.clientX - 60}px, ${e.clientY - 20}px) rotate(1deg)`;
        }

        // Detect insert position among columns
        const allColEls = Array.from(
          document.querySelectorAll<HTMLElement>('[data-column-root-id]'),
        );
        let insertBefore: string | null = null;
        for (const el of allColEls) {
          const rect = el.getBoundingClientRect();
          if (e.clientX < rect.left + rect.width / 2) {
            insertBefore = el.dataset.columnRootId!;
            break;
          }
        }
        colInsertBeforeRef.current = insertBefore;
        setColInsertBefore(insertBefore);
        return;
      }

      // ── Card drag ────────────────────────────────────────────
      if (pendingRef.current && !activeRef.current) {
        const { startX, startY, issue, offsetX, offsetY } = pendingRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.hypot(dx, dy) < 5) return;

        const active: ActiveDrag = {
          ...pendingRef.current,
          currentX: e.clientX - offsetX,
          currentY: e.clientY - offsetY,
        };
        activeRef.current = active;
        pendingRef.current = null;
        document.body.style.userSelect = 'none';
        setDraggingId(issue.id);
        return;
      }

      if (activeRef.current) {
        e.preventDefault();
        activeRef.current.currentX = e.clientX - activeRef.current.offsetX;
        activeRef.current.currentY = e.clientY - activeRef.current.offsetY;

        if (ghostRef.current) {
          ghostRef.current.style.transform =
            `translate(${activeRef.current.currentX}px, ${activeRef.current.currentY}px) rotate(1.5deg)`;
        }

        // Use ghost center for column detection so the highlighted column matches
        // the visual position of the dragged card, not just where the cursor is.
        const ghostCenterX = activeRef.current.currentX + activeRef.current.cardWidth / 2;
        const ghostCenterY = e.clientY; // cursor Y for column/insert detection

        const els = document.elementsFromPoint(ghostCenterX, ghostCenterY);
        const columnEl = els.find(
          (el) => (el as HTMLElement).dataset?.columnId !== undefined,
        ) as HTMLElement | undefined;

        if (columnEl) {
          const columnId = columnEl.dataset.columnId!;

          // Detect priority zone when hovering over the Open column
          let zone: PriorityLevel | undefined;
          let searchRoot: HTMLElement = columnEl;
          if (columnId === 'open') {
            const VALID_ZONES = new Set(['critical', 'high', 'medium', 'low']);
            const zoneEls = Array.from(
              columnEl.querySelectorAll<HTMLElement>('[data-zone-id]'),
            );
            for (const zoneEl of zoneEls) {
              const rect = zoneEl.getBoundingClientRect();
              if (ghostCenterY >= rect.top && ghostCenterY <= rect.bottom) {
                const zoneId = zoneEl.dataset.zoneId!;
                zone = VALID_ZONES.has(zoneId) ? (zoneId as PriorityLevel) : undefined;
                searchRoot = zoneEl;
                break;
              }
            }
          }

          const cardEls = Array.from(
            searchRoot.querySelectorAll<HTMLElement>('[data-card-id]'),
          ).filter((el) => el.dataset.cardId !== activeRef.current!.issue.id);

          let beforeId: string | null = null;
          for (const el of cardEls) {
            const rect = el.getBoundingClientRect();
            if (ghostCenterY < rect.top + rect.height / 2) {
              beforeId = el.dataset.cardId!;
              break;
            }
          }

          const newInfo: InsertInfo = { columnId, beforeId, zone };
          insertInfoRef.current = newInfo;
          setInsertInfo(newInfo);
        }
      }
    }

    function onPointerUp() {
      // ── Column drop ──────────────────────────────────────────
      if (colActiveRef.current || colPendingRef.current) {
        const colActive = colActiveRef.current;
        colActiveRef.current = null;
        colPendingRef.current = null;
        document.body.style.userSelect = '';

        if (colActive) {
          const insertBefore = colInsertBeforeRef.current;
          const cols = columnsRef.current;
          const dragged = cols.find((c) => c.id === colActive.columnId);

          if (dragged && !dragged.isStatic) {
            const withoutDragged = cols.filter((c) => c.id !== colActive.columnId);
            let insertIdx: number;
            if (insertBefore === null || insertBefore === undefined) {
              // insert at end before closed
              const closedIdx = withoutDragged.findIndex((c) => c.id === 'closed');
              insertIdx = closedIdx >= 0 ? closedIdx : withoutDragged.length;
            } else {
              insertIdx = withoutDragged.findIndex((c) => c.id === insertBefore);
              if (insertIdx < 0) insertIdx = withoutDragged.length;
            }
            const newCols = [
              ...withoutDragged.slice(0, insertIdx),
              dragged,
              ...withoutDragged.slice(insertIdx),
            ];
            onColumnsReorderRef.current?.(newCols);
          }
        }

        setColDraggingId(null);
        colInsertBeforeRef.current = undefined;
        setColInsertBefore(undefined);
        return;
      }

      // ── Card drop ────────────────────────────────────────────
      pendingRef.current = null;

      if (!activeRef.current) return;

      const active = activeRef.current;
      activeRef.current = null;

      window.addEventListener('click', (e) => e.stopPropagation(), {
        once: true,
        capture: true,
      });

      const info = insertInfoRef.current;
      const cols = columnsRef.current;
      const { issue } = active;

      if (info) {
        const sourceCol = cols.find((col) => col.issues.some((i) => i.id === issue.id));
        if (sourceCol) {
          let next: typeof cols;

          if (sourceCol.id === info.columnId) {
            const issues = sourceCol.issues.filter((i) => i.id !== issue.id);
            const insertIdx = info.beforeId
              ? issues.findIndex((i) => i.id === info.beforeId)
              : -1;
            const reordered =
              insertIdx >= 0
                ? [...issues.slice(0, insertIdx), issue, ...issues.slice(insertIdx)]
                : [...issues, issue];
            next = cols.map((col) =>
              col.id === info.columnId ? { ...col, issues: reordered } : col,
            );

            // Fire priority change if zone changed within Open column
            if (info.columnId === 'open') {
              const targetPriority = info.zone ?? null;
              const currentPriority = issue.priority ?? null;
              if (targetPriority !== currentPriority) {
                onPriorityChangeRef.current?.(issue.id, targetPriority);
              }
            }
          } else {
            const targetIssues = cols.find((c) => c.id === info.columnId)!.issues;
            const insertIdx = info.beforeId
              ? targetIssues.findIndex((i) => i.id === info.beforeId)
              : -1;
            const newTarget =
              insertIdx >= 0
                ? [...targetIssues.slice(0, insertIdx), issue, ...targetIssues.slice(insertIdx)]
                : [...targetIssues, issue];
            next = cols.map((col) => {
              if (col.id === sourceCol.id)
                return { ...col, issues: col.issues.filter((i) => i.id !== issue.id) };
              if (col.id === info.columnId) return { ...col, issues: newTarget };
              return col;
            });

            // Fire side-effect callback for cross-column moves
            onIssueMoveRef.current?.(issue.id, sourceCol.id, info.columnId);

            // When dropping into Open from another column, set priority via zone
            if (info.columnId === 'open') {
              onPriorityChangeRef.current?.(issue.id, info.zone ?? null);
            }
          }

          onChangeRef.current(next);
        }
      }

      document.body.style.userSelect = '';
      setDraggingId(null);
      insertInfoRef.current = null;
      setInsertInfo(null);
    }

    function onPointerCancel() {
      colPendingRef.current = null;
      colActiveRef.current = null;
      pendingRef.current = null;
      activeRef.current = null;
      document.body.style.userSelect = '';
      setColDraggingId(null);
      colInsertBeforeRef.current = undefined;
      setColInsertBefore(undefined);
      setDraggingId(null);
      insertInfoRef.current = null;
      setInsertInfo(null);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, []);

  function handlePointerDown(e: React.PointerEvent, issue: Issue) {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rawOffsetY = e.clientY - rect.top;
    pendingRef.current = {
      issue,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      // Clamp so the cursor never appears below the card during drag.
      // If the user grabs near the bottom, shift up so at most the bottom
      // 16px of the ghost sits below the cursor.
      offsetY: Math.min(rawOffsetY, rect.height - 16),
      cardWidth: rect.width,
    };
  }

  function handleColumnRightClick(e: React.MouseEvent, colId: string) {
    e.preventDefault();
    const col = columnsRef.current.find((c) => c.id === colId);
    setColorMenu({ colId, x: e.clientX, y: e.clientY, isStatic: col?.isStatic ?? false });
    setShowCustomPicker(false);
  }

  function handleColumnPointerDown(e: React.PointerEvent, column: KanbanColumnData) {
    if (e.button !== 0 || column.isStatic) return;
    e.preventDefault();
    e.stopPropagation();
    colPendingRef.current = { columnId: column.id, startX: e.clientX, startY: e.clientY };
  }

  function handleBoardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 1) return;
    e.preventDefault();
    const el = boardRef.current!;
    el.setPointerCapture(e.pointerId);
    panRef.current = { startX: e.clientX, startScrollLeft: el.scrollLeft };
    setIsPanning(true);
  }

  function handleBoardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!panRef.current) return;
    e.preventDefault();
    boardRef.current!.scrollLeft = panRef.current.startScrollLeft - (e.clientX - panRef.current.startX);
  }

  function handleBoardPointerUp(_e: React.PointerEvent<HTMLDivElement>) {
    if (!panRef.current) return;
    panRef.current = null;
    setIsPanning(false);
  }

  const isDraggingAnything = draggingId !== null || colDraggingId !== null;

  return (
    <>
      <div
        ref={boardRef}
        className={`${styles.board} ${isDraggingAnything ? styles.dragging : ''} ${isPanning ? styles.panning : ''}`}
        style={{ '--visible-cols': visibleColumns } as React.CSSProperties}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
      >
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            draggingId={draggingId}
            isOver={insertInfo?.columnId === column.id}
            insertBeforeId={
              insertInfo?.columnId === column.id ? insertInfo.beforeId : undefined
            }
            insertZone={
              insertInfo?.columnId === column.id ? insertInfo.zone : undefined
            }
            isColInsertBefore={colInsertBefore === column.id}
            isColDragging={colDraggingId === column.id}
            color={columnColors[column.id]}
            onPointerDown={handlePointerDown}
            onColumnPointerDown={handleColumnPointerDown}
            onRightClick={(e) => handleColumnRightClick(e, column.id)}
            onIssueClick={onIssueClick}
            onNewIssue={column.id === 'open' ? onNewIssue : undefined}
            canDrag={canDrag}
            onBan={onBanUser ? (issue) => {
              const canBan = myDid !== null
                && issue.authorDid !== myDid
                && !delegateDids.includes(issue.authorDid)
                && !(bannedDids?.has(issue.authorDid));
              return canBan ? () => onBanUser(issue.authorDid, issue.author, 'all') : undefined;
            } : undefined}
          />
        ))}
      </div>

      {/* Card ghost */}
      {draggingId && activeRef.current &&
        createPortal(
          <div
            ref={ghostRef}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: activeRef.current.cardWidth,
              pointerEvents: 'none',
              zIndex: 9999,
              transform: `translate(${activeRef.current.currentX}px, ${activeRef.current.currentY}px) rotate(1.5deg)`,
              opacity: 0.9,
              filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.35))',
            }}
          >
            <KanbanCard
              issue={activeRef.current.issue}
              isDragging={false}
              onPointerDown={() => {}}
              onClick={() => {}}
            />
          </div>,
          document.body,
        )}

      {/* Color menu */}
      {colorMenu && createPortal(
        <>
          <div className={styles.menuOverlay} onClick={() => { setColorMenu(null); setShowCustomPicker(false); }} />
          <div
            className={styles.colorMenu}
            style={{ left: colorMenu.x, top: colorMenu.y }}
          >
            <div className={styles.swatchRow}>
              {SWATCHES.map((swatch, i) => (
                <button
                  key={i}
                  className={`${styles.swatch} ${swatch === null ? styles.swatchReset : ''} ${!showCustomPicker && columnColors[colorMenu.colId] === swatch ? styles.swatchActive : ''}`}
                  style={swatch ? { background: swatch } : undefined}
                  onClick={() => {
                    onColumnColorChange?.(colorMenu.colId, swatch);
                    setColorMenu(null);
                    setShowCustomPicker(false);
                  }}
                  title={swatch ?? 'Reset'}
                />
              ))}
              <div className={styles.swatchDivider} />
              <button
                className={`${styles.swatch} ${styles.swatchCustom} ${showCustomPicker ? styles.swatchActive : ''}`}
                onClick={() => {
                  const current = columnColors[colorMenu.colId];
                  setCustomPickerColor(current ?? '#7c6aff');
                  setShowCustomPicker((v) => !v);
                }}
                title="Custom color"
              />
            </div>
            {showCustomPicker && (
              <div className={styles.customPickerWrap}>
                <HexColorPicker
                  color={customPickerColor}
                  onChange={setCustomPickerColor}
                />
                <div className={styles.customPickerFooter}>
                  <input
                    className={styles.hexInput}
                    value={customPickerColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setCustomPickerColor(v);
                    }}
                    spellCheck={false}
                    maxLength={7}
                  />
                  <button
                    className={styles.applyBtn}
                    onClick={() => {
                      if (/^#[0-9a-fA-F]{6}$/.test(customPickerColor)) {
                        onColumnColorChange?.(colorMenu.colId, customPickerColor);
                        setColorMenu(null);
                        setShowCustomPicker(false);
                      }
                    }}
                  >Apply</button>
                </div>
              </div>
            )}
            {!colorMenu.isStatic && (
              <button
                className={styles.removeColBtn}
                onClick={() => {
                  onColumnRemove?.(colorMenu.colId);
                  setColorMenu(null);
                  setShowCustomPicker(false);
                }}
              >Remove column</button>
            )}
          </div>
        </>,
        document.body,
      )}

      {/* Column ghost */}
      {colDraggingId && colActiveRef.current &&
        createPortal(
          <div
            ref={colGhostRef}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: colActiveRef.current.ghostWidth,
              pointerEvents: 'none',
              zIndex: 9998,
              transform: `translate(${colActiveRef.current.currentX - 60}px, ${colActiveRef.current.currentY - 20}px) rotate(1deg)`,
              opacity: 0.85,
              filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.35))',
            }}
          >
            <div className={styles.colGhost}>
              {columnsRef.current.find((c) => c.id === colDraggingId)?.title}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
