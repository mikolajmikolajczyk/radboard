import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TreeEntryData } from '../../types/radboard';
import { getFileIcon } from './FileIcons';
import { formatSize } from '../../utils/format';
import styles from './FileTree.module.css';

interface FileTreeProps {
  rid: string;
  branchOid: string | null;
  initialPath?: string | null;
  selectedFile: string | null;
  onFileSelect: (path: string) => void;
}

export function FileTree({ rid, branchOid, initialPath, selectedFile, onFileSelect }: FileTreeProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['']));
  const [dirContents, setDirContents] = useState<Map<string, TreeEntryData[]>>(new Map());
  const [loadingTree, setLoadingTree] = useState<Set<string>>(new Set());

  const oid = branchOid ?? '';

  const fetchTree = useCallback((path: string) => {
    setLoadingTree((prev) => new Set(prev).add(path));
    invoke<TreeEntryData[]>('list_tree', { rid, path, commitOid: oid })
      .then((entries) => {
        setDirContents((prev) => new Map(prev).set(path, entries));
      })
      .catch(console.error)
      .finally(() => {
        setLoadingTree((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      });
  }, [rid, oid]);

  useEffect(() => {
    setExpandedDirs(new Set(['']));
    setDirContents(new Map());
    fetchTree('');
  }, [rid, oid, fetchTree]);

  const initialPathConsumed = useRef(false);
  useEffect(() => {
    if (!initialPath || initialPathConsumed.current) return;
    const rootEntries = dirContents.get('');
    if (!rootEntries) return;
    initialPathConsumed.current = true;
    const parts = initialPath.split('/');
    const dirsToExpand = new Set(['']);
    for (let i = 1; i < parts.length; i++) {
      dirsToExpand.add(parts.slice(0, i).join('/'));
    }
    setExpandedDirs((prev) => new Set([...prev, ...dirsToExpand]));
    for (const dir of dirsToExpand) {
      if (dir !== '' && !dirContents.has(dir)) fetchTree(dir);
    }
    onFileSelect(initialPath);
  }, [initialPath, dirContents]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDirClick(path: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); } else {
        next.add(path);
        if (!dirContents.has(path)) fetchTree(path);
      }
      return next;
    });
  }

  function renderEntries(entries: TreeEntryData[], parentPath: string, depth: number) {
    return entries.map((entry) => {
      const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      const isDir = entry.kind === 'tree';
      const isExpanded = expandedDirs.has(entryPath);
      const isSelected = selectedFile === entryPath;
      return (
        <div key={entryPath}>
          <div
            className={`${styles.treeEntry} ${isSelected ? styles.treeEntrySelected : ''}`}
            style={{ paddingLeft: depth * 16 + 8 }}
            onClick={() => isDir ? handleDirClick(entryPath) : onFileSelect(entryPath)}
          >
            <span className={styles.treeChevron}>{isDir ? (isExpanded ? '▼' : '▶') : ''}</span>
            <span className={styles.treeIcon}>{getFileIcon(entry.name, entry.kind, isExpanded)}</span>
            <span className={styles.treeName}>{entry.name}</span>
            {entry.size != null && <span className={styles.treeSize}>{formatSize(entry.size)}</span>}
          </div>
          {isDir && isExpanded && dirContents.has(entryPath) &&
            renderEntries(dirContents.get(entryPath)!, entryPath, depth + 1)}
          {isDir && isExpanded && loadingTree.has(entryPath) && (
            <div className={styles.treeEntry} style={{ paddingLeft: (depth + 1) * 16 + 8, color: 'var(--text-6)', fontSize: 11 }}>
              Loading...
            </div>
          )}
        </div>
      );
    });
  }

  const rootEntries = dirContents.get('') ?? [];

  return (
    <div className={styles.treeList}>
      {rootEntries.length > 0
        ? renderEntries(rootEntries, '', 0)
        : loadingTree.has('') && (
            <div style={{ padding: '8px 16px', color: 'var(--text-6)', fontSize: 12 }}>Loading...</div>
          )
      }
    </div>
  );
}
