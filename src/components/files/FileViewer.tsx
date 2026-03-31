import { useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useOutsideClick } from '../../ui';
import type { BlobContentData, BlameHunkData, FileLogEntry } from '../../types/radboard';
import { getLanguage } from '../../utils/languageMap';
import { formatSize } from '../../utils/format';
import styles from './FileViewer.module.css';

interface FileViewerProps {
  rid: string;
  filePath: string | null;
  branchOid: string | null;
}

function formatBlameDate(epoch: number): string {
  const d = new Date(epoch * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function FileViewer({ rid, filePath, branchOid }: FileViewerProps) {
  const [fileContent, setFileContent] = useState<BlobContentData | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [blameActive, setBlameActive] = useState(false);
  const [blameHunks, setBlameHunks] = useState<BlameHunkData[] | null>(null);
  const [loadingBlame, setLoadingBlame] = useState(false);
  const [fileLog, setFileLog] = useState<FileLogEntry[]>([]);
  const [activeRevision, setActiveRevision] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const historyRef = useRef<HTMLDivElement>(null);

  useOutsideClick(historyRef, () => setHistoryOpen(false), historyOpen);

  const oid = branchOid ?? '';

  useEffect(() => {
    if (!filePath) return;
    setFileContent(null);
    setLoadingFile(true);
    setBlameHunks(null);
    setBlameActive(false);
    setActiveRevision(null);
    setFileLog([]);
    setHistoryOpen(false);
    setHistorySearch('');
    invoke<BlobContentData>('read_blob', { rid, path: filePath, commitOid: oid })
      .then(setFileContent)
      .catch(console.error)
      .finally(() => setLoadingFile(false));
    invoke<FileLogEntry[]>('file_log', { rid, path: filePath, commitOid: oid })
      .then(setFileLog)
      .catch(console.error);
  }, [rid, filePath, branchOid]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRevisionSelect(commitOid: string | null) {
    if (!filePath) return;
    setActiveRevision(commitOid);
    setBlameHunks(null);
    setHistoryOpen(false);
    setHistorySearch('');
    setLoadingFile(true);
    const revOid = commitOid ?? oid;
    invoke<BlobContentData>('read_blob', { rid, path: filePath, commitOid: revOid })
      .then(setFileContent)
      .catch(console.error)
      .finally(() => setLoadingFile(false));
    if (blameActive) {
      setLoadingBlame(true);
      invoke<BlameHunkData[]>('get_blame', { rid, path: filePath, commitOid: revOid })
        .then(setBlameHunks)
        .catch(console.error)
        .finally(() => setLoadingBlame(false));
    }
  }

  function handleBlameToggle() {
    if (blameActive) { setBlameActive(false); return; }
    if (!filePath) return;
    setBlameActive(true);
    if (blameHunks) return;
    setLoadingBlame(true);
    const revOid = activeRevision ?? oid;
    invoke<BlameHunkData[]>('get_blame', { rid, path: filePath, commitOid: revOid })
      .then(setBlameHunks)
      .catch(console.error)
      .finally(() => setLoadingBlame(false));
  }

  function handleBlameOidClick(commitOid: string) {
    const entry = fileLog.find((e) => e.oid === commitOid);
    if (entry) handleRevisionSelect(commitOid);
  }

  function renderBreadcrumb() {
    if (!filePath) return null;
    const parts = filePath.split('/');
    return (
      <span className={styles.breadcrumb}>
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 && <span className={styles.breadcrumbSep}> / </span>}
            <span className={i === parts.length - 1 ? styles.breadcrumbFile : ''}>{part}</span>
          </span>
        ))}
      </span>
    );
  }

  const blameLines = useMemo(() => {
    if (!blameActive || !blameHunks || !fileContent) return null;
    const lineCount = fileContent.content.split('\n').length;
    const lines: (BlameHunkData | null)[] = new Array(lineCount + 1).fill(null);
    for (const hunk of blameHunks) {
      for (let i = 0; i < hunk.lineCount; i++) {
        const ln = hunk.startLine + i;
        if (ln <= lineCount) lines[ln] = hunk;
      }
    }
    return lines;
  }, [blameActive, blameHunks, fileContent]);

  const filteredLog = useMemo(() => {
    const q = historySearch.toLowerCase();
    return q
      ? fileLog.filter((e) => e.oid.startsWith(q) || e.summary.toLowerCase().includes(q) || e.author.toLowerCase().includes(q))
      : fileLog;
  }, [fileLog, historySearch]);

  return (
    <div className={styles.contentPanel}>
      {filePath && (
        <div className={styles.contentHeader}>
          {renderBreadcrumb()}
          <div className={styles.headerActions}>
            {fileLog.length > 0 && (() => {
              const activeEntry = activeRevision ? fileLog.find((e) => e.oid === activeRevision) : fileLog[0];
              const filtered = filteredLog;
              return (
                <div className={styles.historyDropdown} ref={historyRef}>
                  <button
                    className={`${styles.historyBtn} ${historyOpen ? styles.historyBtnOpen : ''} ${activeRevision ? styles.historyBtnRevision : ''}`}
                    onClick={() => { setHistoryOpen(!historyOpen); setHistorySearch(''); }}
                  >
                    <span className={styles.historyBtnOid}>{activeEntry ? activeEntry.oid.slice(0, 7) : '...'}</span>
                    <span className={styles.historyBtnSummary}>{activeEntry?.summary ?? ''}</span>
                    <span className={styles.historyChevron}>{historyOpen ? '▲' : '▼'}</span>
                  </button>
                  {historyOpen && (
                    <div className={styles.historyPanel}>
                      <input
                        className={styles.historySearchInput}
                        type="text"
                        placeholder="Search commits..."
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        autoFocus
                      />
                      <div className={styles.historyList}>
                        {filtered.length === 0 ? (
                          <div className={styles.historyEmpty}>No matching commits</div>
                        ) : filtered.map((entry) => {
                          const isActive = activeRevision === entry.oid || (activeRevision === null && entry === fileLog[0]);
                          const originalIndex = fileLog.indexOf(entry);
                          return (
                            <button
                              key={entry.oid}
                              className={`${styles.historyEntry} ${isActive ? styles.historyEntryActive : ''}`}
                              onClick={() => handleRevisionSelect(originalIndex === 0 ? null : entry.oid)}
                            >
                              <span className={styles.historyEntryOid}>{entry.oid.slice(0, 7)}</span>
                              <span className={styles.historyEntrySummary}>{entry.summary}</span>
                              <span className={styles.historyEntryMeta}>
                                {entry.author.split(' ')[0]}, {formatBlameDate(entry.timestamp)}
                              </span>
                              {originalIndex === 0 && <span className={styles.historyLatestBadge}>latest</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            {fileContent && !fileContent.isBinary && (
              <button
                className={`${styles.blameToggle} ${blameActive ? styles.blameToggleActive : ''}`}
                onClick={handleBlameToggle}
                disabled={loadingBlame}
              >
                {loadingBlame ? 'Loading...' : 'Blame'}
              </button>
            )}
          </div>
        </div>
      )}
      {fileContent?.isTruncated && (
        <div className={styles.truncatedBanner}>
          Showing first 1 MB of {formatSize(fileContent.size)}
        </div>
      )}
      <div className={styles.contentBody}>
        {!filePath ? (
          <div className={styles.emptyContent}>Select a file to view</div>
        ) : loadingFile ? (
          <div className={styles.loadingContent}>Loading...</div>
        ) : fileContent?.isBinary ? (
          <div className={styles.binaryMessage}>Binary file ({formatSize(fileContent.size)})</div>
        ) : fileContent ? (
          <div className={styles.codeWithBlame}>
            {blameActive && blameLines && (
              <div className={styles.blameGutter}>
                {fileContent.content.split('\n').map((_, i) => {
                  const lineNum = i + 1;
                  const hunk = blameLines[lineNum];
                  const isFirst = hunk && hunk.startLine === lineNum;
                  return (
                    <div key={lineNum} className={styles.blameLine} title={hunk ? `${hunk.commitOid.slice(0, 8)} ${hunk.summary}` : ''}>
                      {isFirst && hunk ? (
                        <>
                          <span className={styles.blameAuthor}>{hunk.author.length > 16 ? hunk.author.slice(0, 15) + '…' : hunk.author}</span>
                          <span className={styles.blameDate}>{formatBlameDate(hunk.timestamp)}</span>
                          <span
                            className={styles.blameOid}
                            onClick={(e) => { e.stopPropagation(); handleBlameOidClick(hunk.commitOid); }}
                          >{hunk.commitOid.slice(0, 7)}</span>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            <div className={styles.codePane}>
              <SyntaxHighlighter
                style={vscDarkPlus}
                language={getLanguage(filePath.split('/').pop() ?? '')}
                showLineNumbers
                wrapLongLines
                customStyle={{ margin: 0, borderRadius: 0, minHeight: '100%', fontSize: 12, background: 'var(--bg-surface)' }}
              >
                {fileContent.content}
              </SyntaxHighlighter>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
