import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './RepoSwitcher.module.css';

interface Props {
  open: boolean;
  rids: string[];
  repoNames: Map<string, string>;
  activeRid: string | null;
  onSelect: (rid: string) => void;
  onClose: () => void;
}

function score(query: string, name: string, rid: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  const r = rid.toLowerCase();
  if (n === q) return 1000;
  if (n.startsWith(q)) return 500;
  if (n.includes(q)) return 300;
  if (r.includes(q)) return 200;
  // Loose subsequence match in name
  let ni = 0;
  let matched = 0;
  for (const ch of q) {
    const idx = n.indexOf(ch, ni);
    if (idx < 0) return -1;
    ni = idx + 1;
    matched++;
  }
  return matched > 0 ? 50 : -1;
}

export function RepoSwitcher({ open, rids, repoNames, activeRid, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const scored = rids.map((rid) => {
      const name = repoNames.get(rid) ?? rid.slice(0, 12);
      return { rid, name, s: query ? score(query, name, rid) : 0 };
    }).filter((i) => query === '' || i.s >= 0);
    if (query) scored.sort((a, b) => b.s - a.s);
    else scored.sort((a, b) => a.name.localeCompare(b.name));
    return scored;
  }, [rids, repoNames, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (cursor >= items.length) setCursor(Math.max(0, items.length - 1));
  }, [items, cursor]);

  if (!open) return null;

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(items.length - 1, c + 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const pick = items[cursor];
      if (pick) { onSelect(pick.rid); onClose(); }
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className={styles.input}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
          onKeyDown={handleKey}
          placeholder="search repos…"
        />
        <div className={styles.list}>
          {items.length === 0 ? (
            <div className={styles.empty}>no matches</div>
          ) : items.map((it, i) => (
            <button
              key={it.rid}
              className={`${styles.item} ${i === cursor ? styles.itemActive : ''} ${activeRid === it.rid ? styles.itemCurrent : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => { onSelect(it.rid); onClose(); }}
            >
              <span className={styles.itemName}>{it.name}</span>
              <span className={styles.itemRid}>{it.rid.slice(0, 12)}…</span>
            </button>
          ))}
        </div>
        <div className={styles.hint}>↑↓ navigate · ↵ open · esc close</div>
      </div>
    </div>
  );
}
