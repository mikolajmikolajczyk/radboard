import type { ReactNode } from 'react';

const S = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function FolderIcon() {
  return (
    <svg {...S} style={{ color: '#5de4c7' }}>
      <path d="M2 4.5h4.5l1.5 1.5H14v7H2z" />
      <path d="M2 4.5V3h4.5l1.5 1.5" />
    </svg>
  );
}

function FolderOpenIcon() {
  return (
    <svg {...S} style={{ color: '#5de4c7' }}>
      <path d="M1 13l1.5-5H14l-1.5 5z" />
      <path d="M2 8V3h4.5l1.5 1.5H14v3.5" />
    </svg>
  );
}

function FileCodeIcon() {
  return (
    <svg {...S}>
      <path d="M4 1h5l4 4v10H4z" />
      <path d="M9 1v4h4" />
      <path d="M7 9l-1.5 1.5L7 12" />
      <path d="M10 9l1.5 1.5L10 12" />
    </svg>
  );
}

function FileConfigIcon() {
  return (
    <svg {...S}>
      <path d="M4 1h5l4 4v10H4z" />
      <path d="M9 1v4h4" />
      <path d="M6.5 10h4" />
      <path d="M6.5 12h2.5" />
    </svg>
  );
}

function FileMarkdownIcon() {
  return (
    <svg {...S}>
      <path d="M4 1h5l4 4v10H4z" />
      <path d="M9 1v4h4" />
      <path d="M6 10v3l1-1 1 1v-3" />
      <path d="M10 13v-3l1.5 2 1.5-2v3" />
    </svg>
  );
}

function FileImageIcon() {
  return (
    <svg {...S}>
      <path d="M4 1h5l4 4v10H4z" />
      <path d="M9 1v4h4" />
      <circle cx="7.5" cy="9" r="1" />
      <path d="M5.5 13l2-2.5 1.5 1.5 1.5-1 2 2" />
    </svg>
  );
}

function FileLockIcon() {
  return (
    <svg {...S}>
      <path d="M4 1h5l4 4v10H4z" />
      <path d="M9 1v4h4" />
      <rect x="7" y="9.5" width="3" height="2.5" rx="0.5" />
      <path d="M7.5 9.5V8.5a1 1 0 0 1 2 0v1" />
    </svg>
  );
}

function FileDefaultIcon() {
  return (
    <svg {...S}>
      <path d="M4 1h5l4 4v10H4z" />
      <path d="M9 1v4h4" />
    </svg>
  );
}

const CODE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'rs', 'py', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'rb', 'swift', 'kt', 'lua', 'zig', 'ex', 'hs', 'ml', 'sh', 'bash', 'zsh', 'php', 'pl', 'scala', 'dart', 'v', 'nix', 'el', 'clj', 'lisp', 'sql', 'html', 'htm', 'css', 'scss', 'sass', 'less']);
const CONFIG_EXTS = new Set(['json', 'toml', 'yaml', 'yml', 'xml', 'ini', 'cfg', 'env']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'bmp', 'webp']);
const LOCK_NAMES = new Set(['Cargo.lock', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'Gemfile.lock', 'flake.lock']);

export function getFileIcon(name: string, kind: 'tree' | 'blob', isExpanded?: boolean): ReactNode {
  if (kind === 'tree') return isExpanded ? <FolderOpenIcon /> : <FolderIcon />;

  if (LOCK_NAMES.has(name)) return <FileLockIcon />;
  if (name.endsWith('.md') || name.endsWith('.mdx')) return <FileMarkdownIcon />;

  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTS.has(ext)) return <FileImageIcon />;
  if (CONFIG_EXTS.has(ext)) return <FileConfigIcon />;
  if (CODE_EXTS.has(ext)) return <FileCodeIcon />;
  if (name === 'Makefile' || name === 'Dockerfile' || name === 'Containerfile' || name === 'Justfile') return <FileCodeIcon />;

  return <FileDefaultIcon />;
}
