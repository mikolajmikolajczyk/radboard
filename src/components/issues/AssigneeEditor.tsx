import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AssigneeRef } from '../../types/radboard';
import { useRepo } from '../../contexts/RepoContext';
import styles from './LabelEditor.module.css';

interface Props {
  assignees: AssigneeRef[];
  onChange: (next: AssigneeRef[]) => void;
}

function shortDid(did: string): string {
  const key = did.startsWith('did:key:') ? did.slice('did:key:'.length) : did;
  if (key.length <= 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function isValidDid(s: string): boolean {
  return /^did:key:z[A-HJ-NP-Za-km-z1-9]+$/.test(s.trim());
}

export function AssigneeEditor({ assignees, onChange }: Props) {
  const { rid } = useRepo();
  const [inputValue, setInputValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<AssigneeRef[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentDids = new Set(assignees.map((a) => a.did));

  // Debounced backend search. Backend already returns self + delegates + alias-store matches.
  useEffect(() => {
    if (!focused) return;
    const handle = setTimeout(() => {
      invoke<AssigneeRef[]>('search_users', { rid, query: inputValue })
        .then((res) => setSuggestions(res.filter((a) => !currentDids.has(a.did))))
        .catch((e) => console.error(e));
    }, 150);
    return () => clearTimeout(handle);
  }, [inputValue, focused, rid, assignees]); // eslint-disable-line react-hooks/exhaustive-deps

  function add(ref: AssigneeRef) {
    if (currentDids.has(ref.did)) return;
    onChange([...assignees, ref]);
    setInputValue('');
    inputRef.current?.focus();
  }

  function commit() {
    const v = inputValue.trim();
    if (!v) return;
    // First try: top suggestion (alias match).
    if (suggestions.length > 0) {
      add(suggestions[0]);
      return;
    }
    // Fallback: raw DID, only if it actually looks like one.
    if (isValidDid(v)) {
      add({ did: v, alias: shortDid(v) });
    }
  }

  function remove(did: string) {
    onChange(assignees.filter((a) => a.did !== did));
  }

  return (
    <div className={styles.labelEditor}>
      {assignees.map((a) => (
        <span key={a.did} className={styles.labelChip} title={a.did}>
          @{a.alias}
          <button className={styles.labelChipRemove} onClick={() => remove(a.did)} aria-label="Remove assignee">✕</button>
        </span>
      ))}
      <div className={styles.labelInputWrap}>
        <input
          ref={inputRef}
          className={styles.labelInput}
          value={inputValue}
          placeholder="add alias or did:key:…"
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { commit(); setTimeout(() => setFocused(false), 100); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Backspace' && inputValue === '' && assignees.length > 0) {
              onChange(assignees.slice(0, -1));
            }
          }}
        />
        {focused && suggestions.length > 0 && (
          <ul className={styles.labelSuggestions}>
            {suggestions.map((a) => (
              <li key={a.did}>
                <button
                  className={styles.labelSuggestion}
                  title={a.did}
                  onMouseDown={(e) => { e.preventDefault(); add(a); }}
                >@{a.alias}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
