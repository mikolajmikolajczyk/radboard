import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Modal, Button, Input, Textarea } from '../../ui';
import styles from './NewIssueModal.module.css';

interface Props {
  open: boolean;
  rid: string;
  labelSuggestions?: string[];
  onCreated: () => void;
  onClose: () => void;
}

export default function NewIssueModal({ open, rid, labelSuggestions = [], onCreated, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [labelFocused, setLabelFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setLabels([]);
      setLabelInput('');
      setLabelFocused(false);
      setSubmitting(false);
      setTimeout(() => titleRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { handleSubmit(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title, description, labels]);

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
    const finalLabels = pending && !labels.includes(pending) ? [...labels, pending] : labels;
    setSubmitting(true);
    try {
      await invoke('create_issue', { rid, title: title.trim(), description: description.trim(), labels: finalLabels });
      onCreated();
    } catch (e) {
      console.error(e);
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <Modal.Header onClose={onClose}>New issue</Modal.Header>

      <Modal.Body>
        <label className={styles.label}>
          Title
          <Input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Issue title"
            disabled={submitting}
          />
        </label>
        <label className={styles.label}>
          Description <span className={styles.optional}>(optional)</span>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue…"
            rows={4}
            disabled={submitting}
          />
        </label>
        <div className={styles.label}>
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
      </Modal.Body>

      <Modal.Footer>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!title.trim() || submitting}
        >
          {submitting ? 'Creating…' : 'Create'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
