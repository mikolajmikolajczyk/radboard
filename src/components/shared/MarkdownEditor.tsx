import React, { useState } from 'react';
import { Textarea, TextareaProps } from '../../ui';
import { MarkdownBody } from './MarkdownBody';
import styles from './MarkdownEditor.module.css';

export interface MarkdownEditorProps extends TextareaProps {
  value: string;
  minHeight?: number;
}

export const MarkdownEditor = React.forwardRef<HTMLTextAreaElement, MarkdownEditorProps>(
  ({ value, minHeight, className, ...textareaProps }, ref) => {
    const [mode, setMode] = useState<'code' | 'preview'>('code');
    const previewMinHeight = minHeight ?? Math.max(60, ((textareaProps.rows ?? 3) * 20) + 20);

    return (
      <div className={styles.wrapper}>
        <div className={styles.toolbar}>
          <div className={styles.toggle}>
            <button
              type="button"
              className={`${styles.toggleBtn} ${mode === 'code' ? styles.toggleActive : ''}`}
              onClick={() => setMode('code')}
            >Code</button>
            <button
              type="button"
              className={`${styles.toggleBtn} ${mode === 'preview' ? styles.toggleActive : ''}`}
              onClick={() => setMode('preview')}
            >Preview</button>
          </div>
        </div>
        {mode === 'code' ? (
          <Textarea ref={ref} value={value} className={className} {...textareaProps} />
        ) : (
          <div className={styles.preview} style={{ minHeight: previewMinHeight }}>
            {value.trim() ? (
              <MarkdownBody content={value} />
            ) : (
              <span className={styles.previewEmpty}>Nothing to preview</span>
            )}
          </div>
        )}
      </div>
    );
  },
);

MarkdownEditor.displayName = 'MarkdownEditor';
