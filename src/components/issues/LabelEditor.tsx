import { useRef, useState } from 'react';
import { useRepo } from '../../contexts/RepoContext';
import styles from './LabelEditor.module.css';

interface LabelEditorProps {
  labels: string[];
  onChange: (labels: string[]) => void;
}

export function LabelEditor({ labels, onChange }: LabelEditorProps) {
  const { labelSuggestions: suggestions } = useRepo();
  const [inputValue, setInputValue] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = suggestions.filter(
    (s) => !labels.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase()),
  );

  function commit() {
    const v = inputValue.trim().replace(/,$/, '');
    if (v && !labels.includes(v)) onChange([...labels, v]);
    setInputValue('');
  }

  function remove(label: string) {
    onChange(labels.filter((l) => l !== label));
  }

  function addSuggestion(s: string) {
    if (!labels.includes(s)) onChange([...labels, s]);
    setInputValue('');
    inputRef.current?.focus();
  }

  return (
    <div className={styles.labelEditor}>
      {labels.map((l) => (
        <span key={l} className={styles.labelChip}>
          {l}
          <button className={styles.labelChipRemove} onClick={() => remove(l)}>✕</button>
        </span>
      ))}
      <div className={styles.labelInputWrap}>
        <input
          ref={inputRef}
          className={styles.labelInput}
          value={inputValue}
          placeholder="add label…"
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { commit(); setFocused(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
            if (e.key === 'Backspace' && inputValue === '') onChange(labels.slice(0, -1));
          }}
        />
        {focused && filtered.length > 0 && (
          <ul className={styles.labelSuggestions}>
            {filtered.map((s) => (
              <li key={s}>
                <button
                  className={styles.labelSuggestion}
                  onMouseDown={(e) => { e.preventDefault(); addSuggestion(s); }}
                >{s}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
