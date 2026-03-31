import { useState, useEffect, useRef } from 'react';
import PatchDetail from './PatchDetail';
import type { PatchRef } from '../../types/kanban';
import type { RawPatchData } from '../../types/radboard';
import { useRepo } from '../../contexts/RepoContext';
import { useActions } from '../../contexts/ActionsContext';
import { Badge, FilterChip, useResizableDivider, useOutsideClick } from '../../ui';
import styles from './PatchesView.module.css';

const FILTERS = ['all', 'open', 'draft', 'merged', 'archived'] as const;
type Filter = typeof FILTERS[number];

interface Props {
  patches: RawPatchData[];
  selectedPatch: PatchRef | null;
  onSelectPatch: (patch: PatchRef | null) => void;
  revisionOverride?: string | null;
  isActive: boolean;
  onReturn?: () => void;
  returnLabel?: string;
}

function msToDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function asPatchRef(p: RawPatchData): PatchRef {
  return { id: p.id, title: p.title, author: p.author, authorDid: p.authorDid, state: p.state, head: p.head };
}


const ISSUE_PREFIX_RE = /\[([0-9a-f]{7})\]/i;

function renderTitle(title: string, onOpenIssue?: (prefix: string) => void) {
  const m = title.match(ISSUE_PREFIX_RE);
  if (!m || !onOpenIssue) return title;
  const [full, prefix] = m;
  const idx = title.indexOf(full);
  return (
    <>
      <span
        className={styles.issueLink}
        onClick={(e) => { e.stopPropagation(); onOpenIssue(prefix); }}
        title={`Open issue ${prefix}`}
      >{full}</span>
      {title.slice(idx + full.length)}
    </>
  );
}

export default function PatchesView({ patches, selectedPatch, onSelectPatch, revisionOverride, isActive, onReturn, returnLabel }: Props) {
  const { rid } = useRepo();
  const { onRefresh, onOpenIssue } = useActions();
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [displayPatches, setDisplayPatches] = useState(patches);
  const [authorFilters, setAuthorFilters] = useState<Set<string>>(new Set());
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
  const authorDropdownRef = useRef<HTMLDivElement>(null);

  const { width: listWidth, dividerProps, isDragging } = useResizableDivider({
    initial: 360, min: 200, max: 600,
  });
  const listRef = useRef<HTMLDivElement>(null);

  useOutsideClick(authorDropdownRef, () => setAuthorDropdownOpen(false), authorDropdownOpen);

  // Refresh display when the view becomes active, repo changes, or new patch data arrives
  useEffect(() => {
    if (isActive) setDisplayPatches(patches);
  }, [isActive, rid, patches]);

  const sorted = [...displayPatches].sort((a, b) => b.createdAt - a.createdAt);
  const stateFiltered = filter === 'all' ? sorted : sorted.filter((p) => p.state === filter);
  const searchLower = search.toLowerCase();
  const filtered = stateFiltered.filter(
    (p) => (authorFilters.size === 0 || authorFilters.has(p.author)) &&
            (searchLower === '' || p.title.toLowerCase().includes(searchLower) || p.author.toLowerCase().includes(searchLower)),
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (!selectedPatch || filtered.length === 0) return;
      e.preventDefault();
      const idx = filtered.findIndex((p) => p.id === selectedPatch.id);
      const next = e.key === 'ArrowDown'
        ? Math.min(idx + 1, filtered.length - 1)
        : Math.max(idx - 1, 0);
      if (next !== idx) {
        onSelectPatch(asPatchRef(filtered[next]));
        (document.activeElement as HTMLElement)?.blur();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filtered, selectedPatch, onSelectPatch]);

  useEffect(() => {
    if (!selectedPatch || !listRef.current) return;
    listRef.current.querySelector<HTMLElement>(`[data-id="${selectedPatch.id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedPatch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts: Record<Filter, number> = {
    all: displayPatches.length,
    open: displayPatches.filter((p) => p.state === 'open').length,
    draft: displayPatches.filter((p) => p.state === 'draft').length,
    merged: displayPatches.filter((p) => p.state === 'merged').length,
    archived: displayPatches.filter((p) => p.state === 'archived').length,
  };

  // Unique authors sorted by patch count descending
  const allAuthors = [...new Map(
    displayPatches.map((p) => [p.author, p.author])
  ).keys()].sort((a, b) => {
    const ca = displayPatches.filter((p) => p.author === a).length;
    const cb = displayPatches.filter((p) => p.author === b).length;
    return cb - ca;
  });

  function toggleAuthor(author: string) {
    setAuthorFilters((prev) => {
      const next = new Set(prev);
      if (next.has(author)) next.delete(author); else next.add(author);
      return next;
    });
  }

  return (
    <div className={styles.container}>
      {isDragging && <div className={styles.dragOverlay} />}
      {/* Left: patch list */}
      <div className={styles.listPanel} style={{ width: listWidth }}>
        {onReturn && (
          <button className={styles.returnBtn} onClick={onReturn}>
            ← {returnLabel ?? 'Back'}
          </button>
        )}
        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <FilterChip
              key={f}
              active={filter === f}
              count={counts[f]}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </FilterChip>
          ))}
          {[...authorFilters].map((author) => (
            <FilterChip
              key={author}
              active
              className={styles.pillAuthor}
              onClick={() => toggleAuthor(author)}
              title="Click to remove filter"
            >
              {author} ×
            </FilterChip>
          ))}
          {allAuthors.length > 0 && (
            <div className={styles.authorDropdownWrap} ref={authorDropdownRef}>
              <FilterChip
                active={authorFilters.size > 0}
                onClick={() => setAuthorDropdownOpen((o) => !o)}
              >
                Author ▾
              </FilterChip>
              {authorDropdownOpen && (
                <div className={styles.authorDropdown}>
                  {allAuthors.map((author) => {
                    const count = stateFiltered.filter((p) => p.author === author).length;
                    const active = authorFilters.has(author);
                    return (
                      <button
                        key={author}
                        className={`${styles.authorOption} ${active ? styles.authorOptionActive : ''}`}
                        onClick={() => toggleAuthor(author)}
                      >
                        <span className={styles.authorOptionCheck}>{active ? '✓' : '·'}</span>
                        <span className={styles.authorOptionText}>{author}</span>
                        <span className={styles.authorOptionCount}>{count}</span>
                      </button>
                    );
                  })}
                  {authorFilters.size > 0 && (
                    <button
                      className={styles.authorClear}
                      onClick={() => { setAuthorFilters(new Set()); setAuthorDropdownOpen(false); }}
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
            placeholder="Search patches…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.searchClear} onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className={styles.empty}>No {filter === 'all' ? '' : filter + ' '}patches</div>
        ) : (
          <div className={styles.list} ref={listRef}>
            {filtered.map((p) => (
              <button
                key={p.id}
                data-id={p.id}
                className={`${styles.row} ${selectedPatch?.id === p.id ? styles.rowActive : ''}`}
                onClick={() => onSelectPatch(asPatchRef(p))}
              >
                <Badge size="sm" variant={p.state}>{p.state}</Badge>
                <span className={styles.rowTitle}>{renderTitle(p.title, onOpenIssue)}</span>
                <span className={styles.author}>{p.author}</span>
                <span className={styles.date}>{msToDate(p.createdAt)}</span>
                <span className={styles.head}>{p.head.slice(0, 7)}</span>
              </button>
            ))}
          </div>
        )}

      </div>

      {/* Divider */}
      <div className={styles.divider} {...dividerProps} />

      {/* Right: patch detail */}
      <div className={styles.detailPanel}>
        {selectedPatch ? (
          <PatchDetail
            key={selectedPatch.id + (revisionOverride ?? '')}
            patch={selectedPatch}
            onPatchStateChange={onRefresh}
            onClose={() => onSelectPatch(null)}
            initialRevisionId={revisionOverride ?? undefined}
            isViewActive={isActive}
          />
        ) : (
          <div className={styles.emptyDetail}>Select a patch to view details</div>
        )}
      </div>
    </div>
  );
}
