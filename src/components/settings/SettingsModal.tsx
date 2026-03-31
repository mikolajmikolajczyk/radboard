import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { Theme } from '../../hooks/useTheme';
import type { BannedEntry } from '../../types/radboard';
import { Input } from '../../ui';
import { useRepo } from '../../contexts/RepoContext';
import { useActions } from '../../contexts/ActionsContext';
import styles from './SettingsModal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  visibleColumns: number;
  onVisibleColumnsChange: (n: number) => void;
  explorerUrl: string;
  onExplorerUrlChange: (url: string) => void;
  seedNode: string;
  onSeedNodeChange: (node: string) => void;
  rids: string[];
  repoNames: Map<string, string>;
  localRepoPaths: Record<string, string>;
  onLocalPathChange: (rid: string, path: string) => void;
  preferredEditor: string;
  onEditorChange: (cmd: string) => void;
  inboxPageSize: number;
  onInboxPageSizeChange: (n: number) => void;
}

// ── Nav ────────────────────────────────────────────────────────────────────────

type Page = 'appearance' | 'board' | 'explorer' | 'repos' | 'banned' | 'help';

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/></svg>,
  },
  {
    id: 'board',
    label: 'Board',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="4" height="14" rx="1"/><rect x="6" y="1" width="4" height="9" rx="1"/><rect x="11" y="1" width="4" height="11" rx="1"/></svg>,
  },
  {
    id: 'explorer',
    label: 'Explorer',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 2c-1.5 1.5-2.5 3.5-2.5 6s1 4.5 2.5 6M8 2c1.5 1.5 2.5 3.5 2.5 6s-1 4.5-2.5 6M2 8h12"/><path d="M2.5 5.5h11M2.5 10.5h11"/></svg>,
  },
  {
    id: 'repos',
    label: 'Repos',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>,
  },
  {
    id: 'banned',
    label: 'Banned',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M3.5 3.5l9 9"/></svg>,
  },
  {
    id: 'help',
    label: 'Help',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M6 6a2 2 0 1 1 2 2v1.5"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor"/></svg>,
  },
];

// ── Pages ──────────────────────────────────────────────────────────────────────

function AppearancePage({ theme, onToggleTheme, zoom, zoomIn, zoomOut, resetZoom, canZoomIn, canZoomOut }: {
  theme: Theme; onToggleTheme: () => void;
  zoom: number; zoomIn: () => void; zoomOut: () => void; resetZoom: () => void;
  canZoomIn: boolean; canZoomOut: boolean;
}) {

  return (
    <div className={styles.page}>
      <div className={styles.pageTitle}>Appearance</div>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>Theme</div>
        <div className={styles.themeToggle}>
          <button
            className={`${styles.themeBtn} ${theme === 'dark' ? styles.themeBtnActive : ''}`}
            onClick={() => theme === 'light' && onToggleTheme()}
          >
            Dark
          </button>
          <button
            className={`${styles.themeBtn} ${theme === 'light' ? styles.themeBtnActive : ''}`}
            onClick={() => theme === 'dark' && onToggleTheme()}
          >
            Light
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>UI scale</div>
        <div className={styles.hint}>Adjust the size of text and interface elements.</div>
        <div className={styles.zoomRow}>
          <button className={styles.zoomBtn} onClick={zoomOut} disabled={!canZoomOut} aria-label="Zoom out">−</button>
          <button className={styles.zoomLevel} onClick={resetZoom} aria-label="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <button className={styles.zoomBtn} onClick={zoomIn} disabled={!canZoomIn} aria-label="Zoom in">+</button>
          <span className={styles.zoomHint}>Ctrl + / Ctrl − / Ctrl 0</span>
        </div>
      </section>
    </div>
  );
}

// ──

function BoardPage({ visibleColumns, onVisibleColumnsChange, inboxPageSize, onInboxPageSizeChange }: {
  visibleColumns: number;
  onVisibleColumnsChange: (n: number) => void;
  inboxPageSize: number;
  onInboxPageSizeChange: (n: number) => void;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.pageTitle}>Board</div>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>Visible columns</div>
        <div className={styles.hint}>
          This many columns always fill the window. Extra columns overflow and scroll horizontally.
        </div>
        <div className={styles.zoomRow}>
          <button
            className={styles.zoomBtn}
            onClick={() => onVisibleColumnsChange(Math.max(1, visibleColumns - 1))}
            disabled={visibleColumns <= 1}
            aria-label="Fewer visible columns"
          >−</button>
          <span className={styles.zoomLevel}>{visibleColumns}</span>
          <button
            className={styles.zoomBtn}
            onClick={() => onVisibleColumnsChange(visibleColumns + 1)}
            aria-label="More visible columns"
          >+</button>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>Inbox page size</div>
        <div className={styles.hint}>
          Number of most-recent notifications to load per repository.
        </div>
        <div className={styles.zoomRow}>
          <button
            className={styles.zoomBtn}
            onClick={() => onInboxPageSizeChange(Math.max(10, inboxPageSize - 10))}
            disabled={inboxPageSize <= 10}
            aria-label="Decrease inbox page size"
          >−</button>
          <span className={styles.zoomLevel}>{inboxPageSize}</span>
          <button
            className={styles.zoomBtn}
            onClick={() => onInboxPageSizeChange(inboxPageSize + 10)}
            aria-label="Increase inbox page size"
          >+</button>
        </div>
      </section>
    </div>
  );
}

// ──

const EXPLORER_PRESETS = [
  { label: 'app.radicle.xyz', url: 'https://app.radicle.xyz' },
  { label: 'localhost:8080',  url: 'http://localhost:8080' },
];

function ExplorerPage({ explorerUrl, onExplorerUrlChange, seedNode, onSeedNodeChange }: {
  explorerUrl: string;
  onExplorerUrlChange: (url: string) => void;
  seedNode: string;
  onSeedNodeChange: (node: string) => void;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.pageTitle}>Radicle Explorer</div>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>Instance URL</div>
        <div className={styles.hint}>
          Used to open issues and profiles in the Radicle web explorer.
        </div>
        <Input
          className={styles.inputMono}
          type="text"
          value={explorerUrl}
          onChange={(e) => onExplorerUrlChange(e.target.value)}
          spellCheck={false}
          placeholder="https://app.radicle.xyz"
        />
        <div className={styles.presetRow}>
          {EXPLORER_PRESETS.map((p) => (
            <button
              key={p.url}
              className={`${styles.presetBtn} ${explorerUrl === p.url ? styles.presetBtnActive : ''}`}
              onClick={() => onExplorerUrlChange(p.url)}
            >{p.label}</button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>Seed node</div>
        <div className={styles.hint}>
          Hostname of the seed node used in explorer links, e.g. seed.radicle.xyz
        </div>
        <Input
          className={styles.inputMono}
          type="text"
          value={seedNode}
          onChange={(e) => onSeedNodeChange(e.target.value)}
          spellCheck={false}
          placeholder="seed.radicle.xyz"
        />
      </section>
    </div>
  );
}

// ──

type Scope = 'all' | 'issues' | 'comments';

const SCOPE_CLASS: Record<Scope, string> = {
  all:      styles.scopeAll,
  issues:   styles.scopeIssues,
  comments: styles.scopeComments,
};

function BannedPage({ bannedUsers, onBanUser, onUnbanUser }: {
  bannedUsers: BannedEntry[];
  onBanUser: (did: string, alias: string, scope: Scope) => void;
  onUnbanUser: (did: string) => void;
}) {
  const [name, setName]   = useState('');
  const [did, setDid]     = useState('');
  const [scope, setScope] = useState<Scope>('all');

  function addUser() {
    if (!name.trim() || !did.trim()) return;
    onBanUser(did.trim(), name.trim(), scope);
    setName('');
    setDid('');
    setScope('all');
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageTitle}>Banned</div>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>Banned users</div>
        <div className={styles.hint}>
          Issues and/or comments from these users will be hidden across all boards.
        </div>

        <div className={styles.userList}>
          {bannedUsers.length === 0 ? (
            <div className={styles.empty}>no banned users</div>
          ) : (
            bannedUsers.map((u) => (
              <div key={u.did} className={styles.userRow}>
                <div className={styles.avatar}>{u.alias.slice(0, 2).toLowerCase()}</div>
                <div className={styles.userInfo}>
                  <div className={styles.userName}>{u.alias}</div>
                  <div className={styles.userDid}>{u.did}</div>
                </div>
                <span className={`${styles.scope} ${SCOPE_CLASS[u.scope as Scope]}`}>{u.scope}</span>
                <button className={styles.removeBtn} onClick={() => onUnbanUser(u.did)} aria-label="Remove">×</button>
              </div>
            ))
          )}
        </div>
      </section>

      <div className={styles.divider} />

      <section className={styles.section}>
        <div className={styles.addLabel}>Ban user</div>
        <div className={styles.inputRow}>
          <Input
            type="text"
            placeholder="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addUser()}
          />
          <Input
            className={styles.inputMono}
            type="text"
            placeholder="did:key:z6Mk..."
            value={did}
            onChange={(e) => setDid(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addUser()}
          />
        </div>
        <div className={styles.addFooter}>
          <div className={styles.inlineRow}>
            <span className={styles.inputSuffix}>Hide:</span>
            <select
              className={styles.scopeSelect}
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
            >
              <option value="all">all</option>
              <option value="issues">issues only</option>
              <option value="comments">comments only</option>
            </select>
          </div>
          <button className={styles.banBtn} onClick={addUser}>+ Ban user</button>
        </div>
      </section>
    </div>
  );
}

// ──

const SHORTCUTS = [
  { keys: ['Ctrl', '+'],  desc: 'Zoom in' },
  { keys: ['Ctrl', '−'],  desc: 'Zoom out' },
  { keys: ['Ctrl', '0'],  desc: 'Reset zoom' },
  { keys: ['Esc'],        desc: 'Close panel / modal' },
];

function HelpPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageTitle}>Help</div>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>Keyboard shortcuts</div>
        <div className={styles.shortcutList}>
          {SHORTCUTS.map(({ keys, desc }) => (
            <div key={desc} className={styles.shortcut}>
              <span className={styles.shortcutDesc}>{desc}</span>
              <div className={styles.shortcutKeys}>
                {keys.map((k) => <kbd key={k} className={styles.kbd}>{k}</kbd>)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ──

const EDITOR_PRESETS: { label: string; cmd: string }[] = [
  { label: 'VS Code',          cmd: 'code' },
  { label: 'VS Code Insiders', cmd: 'code-insiders' },
  { label: 'Zed',              cmd: 'zed' },
  { label: 'Neovim',           cmd: 'nvim' },
  { label: 'Vim',              cmd: 'vim' },
  { label: 'Helix',            cmd: 'hx' },
  { label: 'Emacs',            cmd: 'emacs' },
  { label: 'Sublime Text',     cmd: 'subl' },
];

function ReposPage({ rids, repoNames, localRepoPaths, onLocalPathChange, preferredEditor, onEditorChange }: {
  rids: string[];
  repoNames: Map<string, string>;
  localRepoPaths: Record<string, string>;
  onLocalPathChange: (rid: string, path: string) => void;
  preferredEditor: string;
  onEditorChange: (cmd: string) => void;
}) {
  const [browseError, setBrowseError] = useState<string | null>(null);
  const isPreset = EDITOR_PRESETS.some((p) => p.cmd === preferredEditor);
  const [showCustom, setShowCustom] = useState(!isPreset && preferredEditor !== '');

  async function browse(rid: string) {
    try {
      await invoke('check_gsettings');
    } catch (e) {
      setBrowseError(String(e));
      return;
    }
    setBrowseError(null);
    const selected = await open({ directory: true, multiple: false }) as string | null;
    if (selected) onLocalPathChange(rid, selected);
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageTitle}>Repos</div>
      <section className={styles.section}>
        <div className={styles.sectionLabel}>Local paths</div>
        <div className={styles.hint}>Link each repo to its local git checkout to enable worktree creation.</div>
        {browseError && <div className={styles.browseError}>{browseError}</div>}
        {rids.map((rid) => (
          <div key={rid} className={styles.repoPathRow}>
            <div className={styles.repoPathName}>{repoNames.get(rid) ?? rid.slice(0, 10)}</div>
            <div className={styles.repoPathInputRow}>
              <Input className={styles.inputMono} type="text"
                placeholder="not set" value={localRepoPaths[rid] ?? ''}
                onChange={(e) => { onLocalPathChange(rid, e.target.value); setBrowseError(null); }} spellCheck={false} />
              <button className={styles.browseBtn} onClick={() => browse(rid)}>Browse…</button>
            </div>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>Editor</div>
        <div className={styles.hint}>
          Automatically open this editor after creating a worktree.
        </div>
        <div className={styles.inputRow}>
          <select
            className={styles.scopeSelect}
            value={showCustom ? '__custom__' : (preferredEditor || '')}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setShowCustom(true);
                onEditorChange('');
              } else {
                setShowCustom(false);
                onEditorChange(e.target.value);
              }
            }}
          >
            <option value="">None</option>
            {EDITOR_PRESETS.map((p) => (
              <option key={p.cmd} value={p.cmd}>{p.label}</option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>
        </div>
        {showCustom && (
          <Input
            className={styles.inputMono}
            type="text"
            value={preferredEditor}
            onChange={(e) => onEditorChange(e.target.value)}
            placeholder="e.g. hx, kate, gedit"
            spellCheck={false}
          />
        )}
      </section>
    </div>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────────

export default function SettingsModal({ open, onClose, theme, onToggleTheme, zoom, zoomIn, zoomOut, resetZoom, canZoomIn, canZoomOut, visibleColumns, onVisibleColumnsChange, explorerUrl, onExplorerUrlChange, seedNode, onSeedNodeChange, rids, repoNames, localRepoPaths, onLocalPathChange, preferredEditor, onEditorChange, inboxPageSize, onInboxPageSizeChange }: Props) {
  const { bannedUsers } = useRepo();
  const { onBanUser, onUnbanUser } = useActions();
  const [page, setPage] = useState<Page>('appearance');

  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.backdropVisible : ''}`}
        onClick={onClose}
      />
      <div className={`${styles.modal} ${open ? styles.modalVisible : ''}`} role="dialog" aria-modal>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarLabel}>Options</div>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`${styles.navItem} ${page === item.id ? styles.navItemActive : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </aside>

        <div className={styles.content}>
          {page === 'appearance' && <AppearancePage theme={theme} onToggleTheme={onToggleTheme} zoom={zoom} zoomIn={zoomIn} zoomOut={zoomOut} resetZoom={resetZoom} canZoomIn={canZoomIn} canZoomOut={canZoomOut} />}
          {page === 'board'      && <BoardPage visibleColumns={visibleColumns} onVisibleColumnsChange={onVisibleColumnsChange} inboxPageSize={inboxPageSize} onInboxPageSizeChange={onInboxPageSizeChange} />}
          {page === 'explorer'   && <ExplorerPage explorerUrl={explorerUrl} onExplorerUrlChange={onExplorerUrlChange} seedNode={seedNode} onSeedNodeChange={onSeedNodeChange} />}
          {page === 'repos'      && <ReposPage rids={rids} repoNames={repoNames} localRepoPaths={localRepoPaths} onLocalPathChange={onLocalPathChange} preferredEditor={preferredEditor} onEditorChange={onEditorChange} />}
          {page === 'banned'     && <BannedPage bannedUsers={bannedUsers} onBanUser={onBanUser} onUnbanUser={onUnbanUser} />}
          {page === 'help'       && <HelpPage />}
        </div>
      </div>
    </>
  );
}
