import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import type { AppSetup, RadicleIdentity, RepoInfo } from '../../types/radboard';
import styles from './WelcomeScreen.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncateDid(did: string) {
  if (did.length <= 24) return did;
  return `${did.slice(0, 16)}…${did.slice(-8)}`;
}

function truncateRid(rid: string) {
  return `${rid.slice(0, 10)}…${rid.slice(-6)}`;
}

// ── Step: no identity ─────────────────────────────────────────────────────────

interface NoIdentityProps {
  onCheckAgain: () => void;
}

function NoIdentity({ onCheckAgain }: NoIdentityProps) {
  const [radHome, setRadHome] = useState<string>('~/.radicle');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>('get_rad_home').then(setRadHome).catch(() => {});
  }, []);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className={styles.noIdentity}>
      <div className={styles.stateIcon}>⚠</div>
      <h2 className={styles.stateTitle}>No Radicle identity found</h2>

      <div className={styles.niSection}>
        <span className={styles.niLabel}>radboard is looking at:</span>
        <div className={styles.niPathRow}>
          <code className={styles.niPath}>{radHome}</code>
          <button className={styles.copyBtn} onClick={() => copy(radHome, 'home')}>
            {copied === 'home' ? '✓' : 'copy'}
          </button>
        </div>
      </div>

      <div className={styles.niDivider} />

      <div className={styles.niSection}>
        <span className={styles.niLabel}>New to Radicle? Run this in your terminal:</span>
        <div className={styles.cmdBlock}>
          <pre className={styles.cmdPre}>$ rad auth</pre>
          <button className={styles.copyBtn} onClick={() => copy('rad auth', 'auth')}>
            {copied === 'auth' ? '✓' : 'copy'}
          </button>
        </div>
        <span className={styles.niHint}>This will create a new identity and SSH key.</span>
      </div>

      <div className={styles.niDivider} />

      <div className={styles.niSection}>
        <span className={styles.niLabel}>Already have an identity elsewhere?</span>
        <p className={styles.niHint}>
          Set <code className={styles.inlineCode}>RAD_HOME=/path/to/your/radicle</code> before
          launching radboard, then restart.
        </p>
      </div>

      <div className={styles.niDivider} />

      <div className={styles.niActions}>
        <button className={styles.checkAgainBtn} onClick={onCheckAgain}>
          Check again
        </button>
        <a
          className={styles.docsLink}
          href="https://radicle.xyz"
          target="_blank"
          rel="noreferrer"
        >
          radicle.xyz — getting started
          <span className={styles.externalArrow}>↗</span>
        </a>
      </div>
    </div>
  );
}

// ── Step: repo picker ─────────────────────────────────────────────────────────

interface RepoPickerProps {
  identity: RadicleIdentity;
  repos: RepoInfo[];
  onSelect: (rid: string, localPath?: string) => void;
  onRefresh: () => void;
}

const CLONE_CMD = `git clone <url>
cd <repo-name>
rad init`;

const CREATE_CMD = `git init <name>
cd <name>
git commit --allow-empty -m "Initial commit"
rad init`;

function fuzzyScoreRepo(query: string, name: string, desc: string, rid: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  if (n === q) return 1000;
  if (n.startsWith(q)) return 500;
  if (n.includes(q)) return 300;
  if (desc.toLowerCase().includes(q)) return 200;
  if (rid.toLowerCase().includes(q)) return 150;
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

function RepoPicker({ identity, repos, onSelect, onRefresh }: RepoPickerProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, setPending] = useState<RepoInfo | null>(null);
  const [localPath, setLocalPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const sorted = [...repos].sort((a, b) => a.name.localeCompare(b.name));
  const filtered = search
    ? sorted
        .map((r) => ({ r, s: fuzzyScoreRepo(search, r.name, r.description ?? '', r.rid) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.r)
    : sorted;

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  function selectRepo(repo: RepoInfo) {
    setPending(repo);
    setLocalPath('');
    setBrowseError(null);
    setScanning(true);
    invoke<string | null>('find_local_repo', { rid: repo.rid })
      .then((p) => { if (p) setLocalPath(p); })
      .catch(() => {})
      .finally(() => setScanning(false));
  }

  async function browse() {
    try {
      await invoke('check_gsettings');
    } catch (e) {
      setBrowseError(String(e));
      return;
    }
    const selected = await openDialog({ directory: true, multiple: false }) as string | null;
    if (selected) { setLocalPath(selected); setBrowseError(null); }
  }

  function confirm() {
    if (!pending) return;
    onSelect(pending.rid, localPath || undefined);
  }

  function backToList() {
    setPending(null);
    setLocalPath('');
    setBrowseError(null);
  }

  // ── confirm sub-step ──────────────────────────────────────────────────────
  if (pending) {
    return (
      <div className={styles.picker}>
        <div className={styles.pickerHeader}>
          <button className={styles.backBtn} onClick={backToList}>← back</button>
          <h2 className={styles.pickerTitle}>{pending.name}</h2>
          <span className={styles.repoRid}>{truncateRid(pending.rid)}</span>
        </div>

        <div className={styles.localPathSection}>
          <div className={styles.localPathLabel}>Local path</div>
          <div className={styles.localPathHint}>
            Link to your local git checkout to enable worktree creation.
            {scanning && <span className={styles.scanning}> scanning…</span>}
          </div>
          <div className={styles.pathRow}>
            <input
              className={styles.pathInput}
              type="text"
              placeholder="not set"
              value={localPath}
              onChange={(e) => { setLocalPath(e.target.value); setBrowseError(null); }}
              spellCheck={false}
            />
            <button className={styles.browseBtn} onClick={browse}>Browse…</button>
          </div>
          {browseError && <div className={styles.browseError}>{browseError}</div>}
        </div>

        <div className={styles.confirmFooter}>
          <button className={styles.checkAgainBtn} onClick={confirm}>
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── list sub-step ─────────────────────────────────────────────────────────
  return (
    <div className={styles.picker}>
      <div className={styles.pickerHeader}>
        <h2 className={styles.pickerTitle}>Pick your first repo</h2>
        <p className={styles.pickerBody}>
          Issues from this repo will appear on your board. You can add more repos later.
        </p>
        <div className={styles.identity}>
          <span className={styles.identityLabel}>signed in as</span>
          <span className={styles.identityAlias}>{identity.alias ?? truncateDid(identity.did)}</span>
          <span className={styles.identityDid}>{truncateDid(identity.did)}</span>
        </div>
      </div>

      {repos.length === 0 ? (
        <div className={styles.emptyRepos}>
          No local repositories found.
        </div>
      ) : (
        <>
          <input
            className={styles.repoSearch}
            type="text"
            placeholder="search by name, description, or rid…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className={styles.repoScrollArea}>
            {filtered.length === 0 ? (
              <div className={styles.emptyRepos}>no matches</div>
            ) : (
              <ul className={styles.repoList}>
                {filtered.map((repo) => (
                  <li key={repo.rid}>
                    <button className={styles.repoItem} onClick={() => selectRepo(repo)}>
                      <div className={styles.repoMain}>
                        <span className={styles.repoName}>{repo.name}</span>
                        {repo.description && (
                          <span className={styles.repoDesc}>{repo.description}</span>
                        )}
                      </div>
                      <div className={styles.repoMeta}>
                        <span className={styles.repoRid}>{truncateRid(repo.rid)}</span>
                        <span className={styles.repoBranch}>{repo.defaultBranch}</span>
                        <span className={styles.repoDelegates}>
                          {repo.delegateDids.length} {repo.delegateDids.length === 1 ? 'delegate' : 'delegates'}
                        </span>
                      </div>
                      <span className={styles.repoArrow}>→</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <div className={styles.niDivider} />

      <div className={styles.createSection}>
        <span className={styles.niLabel}>Don't see your repo?</span>

        <div className={styles.createBlock}>
          <span className={styles.createBlockLabel}>Clone an existing one:</span>
          <div className={styles.cmdBlock}>
            <pre className={styles.cmdPre}>{CLONE_CMD}</pre>
            <button className={styles.copyBtn} onClick={() => copy(CLONE_CMD, 'clone')}>
              {copied === 'clone' ? '✓' : 'copy'}
            </button>
          </div>
        </div>

        <div className={styles.createBlock}>
          <span className={styles.createBlockLabel}>Or create one from scratch:</span>
          <div className={styles.cmdBlock}>
            <pre className={styles.cmdPre}>{CREATE_CMD}</pre>
            <button className={styles.copyBtn} onClick={() => copy(CREATE_CMD, 'create')}>
              {copied === 'create' ? '✓' : 'copy'}
            </button>
          </div>
        </div>

        <p className={styles.niHint}>
          ⓘ  <code className={styles.inlineCode}>rad init</code> requires at least one commit on the branch.
        </p>

        <button className={styles.checkAgainBtn} onClick={onRefresh}>
          Refresh list
        </button>
      </div>
    </div>
  );
}

// ── Step: editor picker ───────────────────────────────────────────────────────

const EDITOR_OPTIONS: { label: string; cmd: string }[] = [
  { label: 'VS Code',      cmd: 'code' },
  { label: 'VS Code Insiders', cmd: 'code-insiders' },
  { label: 'Zed',          cmd: 'zed' },
  { label: 'Neovim',       cmd: 'nvim' },
  { label: 'Vim',          cmd: 'vim' },
  { label: 'Helix',        cmd: 'hx' },
  { label: 'Emacs',        cmd: 'emacs' },
  { label: 'Sublime Text', cmd: 'subl' },
];

interface EditorPickerProps {
  onSelect: (cmd: string | undefined) => void;
  onBack: () => void;
}

function EditorPicker({ onSelect, onBack }: EditorPickerProps) {
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className={styles.picker}>
      <div className={styles.pickerHeader}>
        <button className={styles.backBtn} onClick={onBack}>← back</button>
        <h2 className={styles.pickerTitle}>Choose your editor</h2>
        <p className={styles.pickerBody}>
          radboard will open this editor automatically after creating a worktree.
          You can change this later in Settings → Repos.
        </p>
      </div>

      <ul className={styles.repoList}>
        {EDITOR_OPTIONS.map((e) => (
          <li key={e.cmd}>
            <button className={styles.repoItem} onClick={() => onSelect(e.cmd)}>
              <div className={styles.repoMain}>
                <span className={styles.repoName}>{e.label}</span>
                <span className={styles.repoDesc}>{e.cmd}</span>
              </div>
              <span className={styles.repoArrow}>→</span>
            </button>
          </li>
        ))}
        <li>
          <button className={styles.repoItem} onClick={() => setShowCustom(true)}>
            <div className={styles.repoMain}>
              <span className={styles.repoName}>Custom…</span>
              <span className={styles.repoDesc}>enter a command manually</span>
            </div>
            <span className={styles.repoArrow}>→</span>
          </button>
        </li>
      </ul>

      {showCustom && (
        <div className={styles.pickerHeader}>
          <input
            className={styles.repoDesc}
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. hx, kate, gedit"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && custom.trim()) onSelect(custom.trim());
            }}
            style={{ fontSize: '14px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', width: '100%', marginTop: '8px' }}
          />
          <button
            className={styles.backBtn}
            style={{ marginTop: '8px' }}
            onClick={() => { if (custom.trim()) onSelect(custom.trim()); }}
            disabled={!custom.trim()}
          >
            Use this editor →
          </button>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '16px' }}>
        <button className={styles.backBtn} onClick={() => onSelect(undefined)}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

type Step = 'repo' | 'editor';
type LoadState = 'loading' | 'ready' | 'error';

interface Props {
  onSetup: (setup: AppSetup) => void;
}

export default function WelcomeScreen({ onSetup }: Props) {
  const [step, setStep] = useState<Step>('repo');
  const [pendingSetup, setPendingSetup] = useState<Omit<AppSetup, 'preferredEditor'> | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [identity, setIdentity] = useState<RadicleIdentity | null>(null);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checkCount, setCheckCount] = useState(0);

  useEffect(() => {
    setLoadState('loading');
    invoke<RadicleIdentity | null>('get_identity')
      .then((id) => {
        setIdentity(id);
        if (id !== null) {
          return invoke<RepoInfo[]>('list_repos');
        }
        return [];
      })
      .then((r) => {
        setRepos(r);
        setLoadState('ready');
      })
      .catch((e: unknown) => {
        setError(String(e));
        setLoadState('error');
      });
  }, [checkCount]);

  if (loadState === 'loading') {
    return (
      <div className={styles.root}>
        <div className={styles.state}>
          <div className={styles.stateBody}>Loading…</div>
        </div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className={styles.root}>
        <div className={styles.state}>
          <div className={styles.stateIcon}>⚠</div>
          <h2 className={styles.stateTitle}>Something went wrong</h2>
          <p className={styles.stateBody}>{error}</p>
        </div>
      </div>
    );
  }

  if (identity === null) {
    return (
      <div className={styles.root}>
        <NoIdentity onCheckAgain={() => setCheckCount(c => c + 1)} />
      </div>
    );
  }

  function handleRepoSelect(rid: string, localPath?: string) {
    setPendingSetup({
      rids: [rid],
      ...(localPath ? { localRepoPaths: { [rid]: localPath } } : {}),
    });
    setStep('editor');
  }

  function handleEditorSelect(cmd: string | undefined) {
    if (!pendingSetup) return;
    onSetup(cmd ? { ...pendingSetup, preferredEditor: cmd } : pendingSetup);
  }

  return (
    <div className={styles.root}>
      {step === 'repo' && (
        <RepoPicker
          identity={identity}
          repos={repos}
          onSelect={handleRepoSelect}
          onRefresh={() => setCheckCount(c => c + 1)}
        />
      )}
      {step === 'editor' && (
        <EditorPicker
          onSelect={handleEditorSelect}
          onBack={() => setStep('repo')}
        />
      )}
    </div>
  );
}
