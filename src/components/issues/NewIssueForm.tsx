import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useRepo } from '../../contexts/RepoContext';
import { useActions } from '../../contexts/ActionsContext';
import { Button, Input, Textarea } from '../../ui';
import { MarkdownBody } from '../shared/MarkdownBody';
import styles from './NewIssueForm.module.css';

interface Props {
  onCreated: (issueId: string) => void;
  onCancel: () => void;
}

export default function NewIssueForm({ onCreated, onCancel }: Props) {
  const { rid, labelSuggestions } = useRepo();
  const { onRefresh } = useActions();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [labelFocused, setLabelFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [descMode, setDescMode] = useState<'code' | 'preview'>('code');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { handleSubmit(); }
      if (e.key === 'Escape') { onCancel(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, labels, labelInput]);

  const filteredSuggestions = labelSuggestions.filter(
    (s) => !labels.includes(s) && s.toLowerCase().includes(labelInput.toLowerCase()),
  );

  function commitLabel() {
    const value = labelInput.trim().replace(/,$/, '');
    addLabel(value);
  }

  function handleLabelKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitLabel(); }
    if (e.key === 'Backspace' && labelInput === '') {
      setLabels((prev) => prev.slice(0, -1));
    }
  }

  function addLabel(value: string) {
    if (!value || labels.includes(value)) return;
    setLabels((prev) => [...prev, value]);
    setLabelInput('');
  }

  function removeLabel(label: string) {
    setLabels((prev) => prev.filter((l) => l !== label));
  }

  async function handleSubmit() {
    if (!title.trim() || submitting) return;
    const pending = labelInput.trim().replace(/,$/, '');
    let finalLabels = pending && !labels.includes(pending) ? [...labels, pending] : labels;
    if (!finalLabels.some((l) => l.startsWith('priority:'))) {
      finalLabels = [...finalLabels, 'priority:medium'];
    }
    setSubmitting(true);
    try {
      const issueId = await invoke<string>('create_issue', {
        rid, title: title.trim(), description: description.trim(), labels: finalLabels,
      });
      onRefresh();
      onCreated(issueId);
    } catch (e) {
      console.error(e);
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>New issue</h2>

      <label className={styles.field}>
        Title
        <Input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Issue title"
          disabled={submitting}
        />
      </label>

      <div className={styles.field}>
        <div className={styles.descHeader}>
          Description <span className={styles.optional}>(optional)</span>
          <div className={styles.descToggle}>
            <button
              className={`${styles.toggleBtn} ${descMode === 'code' ? styles.toggleActive : ''}`}
              onClick={() => setDescMode('code')}
              type="button"
            >Code</button>
            <button
              className={`${styles.toggleBtn} ${descMode === 'preview' ? styles.toggleActive : ''}`}
              onClick={() => setDescMode('preview')}
              type="button"
            >Preview</button>
          </div>
        </div>
        {descMode === 'code' ? (
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue…"
            rows={8}
            disabled={submitting}
          />
        ) : (
          <div className={styles.preview}>
            {description.trim() ? (
              <MarkdownBody content={description} />
            ) : (
              <span className={styles.previewEmpty}>Nothing to preview</span>
            )}
          </div>
        )}
      </div>

      <div className={styles.field}>
        Labels <span className={styles.optional}>(optional)</span>
        <div className={styles.labelWrap}>
          <div className={`${styles.labelBox} ${submitting ? styles.labelBoxDisabled : ''}`}>
            {labels.map((l) => (
              <span key={l} className={styles.chip}>
                {l}
                <button
                  className={styles.chipRemove}
                  onClick={() => removeLabel(l)}
                  tabIndex={-1}
                  disabled={submitting}
                >✕</button>
              </span>
            ))}
            <input
              className={styles.labelInput}
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={handleLabelKeyDown}
              onFocus={() => setLabelFocused(true)}
              onBlur={() => { commitLabel(); setLabelFocused(false); }}
              placeholder={labels.length === 0 ? 'bug, enhancement…' : ''}
              disabled={submitting}
            />
          </div>
          {labelFocused && filteredSuggestions.length > 0 && (
            <ul className={styles.suggestions}>
              {filteredSuggestions.map((s) => (
                <li key={s}>
                  <button
                    className={styles.suggestion}
                    onMouseDown={(e) => { e.preventDefault(); addLabel(s); }}
                  >{s}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className={styles.hint}>Press Enter or , to add</span>
      </div>

      <div className={styles.actions}>
        <Button onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!title.trim() || submitting}
        >
          {submitting ? 'Creating…' : 'Create issue'}
        </Button>
      </div>
    </div>
  );
}
