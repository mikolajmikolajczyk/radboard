import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { RepoTerminalState, TerminalSession, TerminalTab, LayoutNode, SplitDirection } from '../types/terminal';
import { splitLeaf, removeLeaf, collectLeafIds } from '../utils/terminalLayout';

interface TerminalContextValue {
  open: boolean;
  panelHeight: number;
  isDark: boolean;
  toggle: () => void;
  show: () => void;
  hide: () => void;
  setPanelHeight: (h: number) => void;
  repoState: RepoTerminalState;
  spawnTerminal: () => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  splitTerminal: (id: string, direction: SplitDirection) => Promise<void>;
  setActive: (id: string) => void;
  updateLayout: (tabId: string, layout: LayoutNode) => void;
  killTerminal: (id: string) => Promise<void>;
  restartTerminal: (id: string) => Promise<void>;
  setTitle: (id: string, title: string) => void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

const EMPTY_REPO_STATE: RepoTerminalState = { tabs: [], activeTabId: null, allSessions: [] };

function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    try { return JSON.parse(stored) as T; } catch { return defaultValue; }
  });
  const set = useCallback((v: T) => {
    setValue(v);
    localStorage.setItem(key, JSON.stringify(v));
  }, [key]);
  return [value, set];
}

interface TerminalProviderProps {
  rid: string | null;
  localRepoPath: string | null;
  isDark: boolean;
  children: React.ReactNode;
}

export function TerminalProvider({ rid, localRepoPath, isDark, children }: TerminalProviderProps) {
  const [repoStates, setRepoStates] = useState<Record<string, RepoTerminalState>>({});
  const [open, setOpen] = useLocalStorage('terminal-open', false);
  const [panelHeight, setPanelHeight] = useLocalStorage('terminal-panel-height', 320);

  // Keep ref to current rid for use in callbacks
  const ridRef = useRef(rid);
  useEffect(() => { ridRef.current = rid; }, [rid]);

  const repoState = rid ? (repoStates[rid] ?? EMPTY_REPO_STATE) : EMPTY_REPO_STATE;

  function mutateRid(currentRid: string, fn: (s: RepoTerminalState) => RepoTerminalState) {
    setRepoStates((prev) => ({
      ...prev,
      [currentRid]: fn(prev[currentRid] ?? EMPTY_REPO_STATE),
    }));
  }

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);
  const show = useCallback(() => setOpen(true), [setOpen]);
  const hide = useCallback(() => setOpen(false), [setOpen]);

  const spawnTerminal = useCallback(async () => {
    const currentRid = ridRef.current;
    if (!currentRid) return;
    const cwd = localRepoPath ?? '~';
    const id = await invoke<string>('pty_spawn', { cwd, cols: 80, rows: 24 });
    const session: TerminalSession = { id, rid: currentRid, title: 'bash' };
    const newTab: TerminalTab = {
      id: crypto.randomUUID(),
      layout: { type: 'leaf', terminalId: id },
      sessions: [id],
      activeId: id,
    };
    mutateRid(currentRid, (s) => ({
      tabs: [...s.tabs, newTab],
      activeTabId: newTab.id,
      allSessions: [...s.allSessions, session],
    }));
    setOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localRepoPath]);

  const closeTab = useCallback(async (tabId: string) => {
    const currentRid = ridRef.current;
    if (!currentRid) return;
    setRepoStates((prev) => {
      const s = prev[currentRid] ?? EMPTY_REPO_STATE;
      const tab = s.tabs.find((t) => t.id === tabId);
      if (tab) {
        for (const sid of tab.sessions) {
          invoke('pty_kill', { terminalId: sid }).catch(console.error);
        }
      }
      const newTabs = s.tabs.filter((t) => t.id !== tabId);
      if (newTabs.length === 0) setOpen(false);
      const remainingSessionIds = new Set(newTabs.flatMap((t) => t.sessions));
      return {
        ...prev,
        [currentRid]: {
          tabs: newTabs,
          activeTabId: tabId === s.activeTabId
            ? (newTabs[newTabs.length - 1]?.id ?? null)
            : s.activeTabId,
          allSessions: s.allSessions.filter((sess) => remainingSessionIds.has(sess.id)),
        },
      };
    });
  }, [setOpen]);

  const setActiveTab = useCallback((tabId: string) => {
    const currentRid = ridRef.current;
    if (!currentRid) return;
    mutateRid(currentRid, (s) => ({ ...s, activeTabId: tabId }));
  }, []);

  const splitTerminal = useCallback(async (id: string, direction: SplitDirection) => {
    const currentRid = ridRef.current;
    if (!currentRid) return;
    const cwd = localRepoPath ?? '~';
    const newId = await invoke<string>('pty_spawn', { cwd, cols: 80, rows: 24 });
    const newSession: TerminalSession = { id: newId, rid: currentRid, title: 'bash' };
    setRepoStates((prev) => {
      const s = prev[currentRid] ?? EMPTY_REPO_STATE;
      const activeTab = s.tabs.find((t) => t.id === s.activeTabId);
      if (!activeTab) return prev;
      const newLayout = splitLeaf(activeTab.layout, id, newId, direction);
      const newTab: TerminalTab = {
        ...activeTab,
        layout: newLayout,
        sessions: [...activeTab.sessions, newId],
        activeId: newId,
      };
      return {
        ...prev,
        [currentRid]: {
          ...s,
          tabs: s.tabs.map((t) => (t.id === activeTab.id ? newTab : t)),
          allSessions: [...s.allSessions, newSession],
        },
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localRepoPath]);

  const setActive = useCallback((id: string) => {
    const currentRid = ridRef.current;
    if (!currentRid) return;
    setRepoStates((prev) => {
      const s = prev[currentRid] ?? EMPTY_REPO_STATE;
      const activeTab = s.tabs.find((t) => t.id === s.activeTabId);
      if (!activeTab) return prev;
      return {
        ...prev,
        [currentRid]: {
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === activeTab.id ? { ...t, activeId: id } : t,
          ),
        },
      };
    });
  }, []);

  const updateLayout = useCallback((tabId: string, layout: LayoutNode) => {
    const currentRid = ridRef.current;
    if (!currentRid) return;
    mutateRid(currentRid, (s) => ({
      ...s,
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, layout } : t)),
    }));
  }, []);

  const killTerminal = useCallback(async (id: string) => {
    const currentRid = ridRef.current;
    if (!currentRid) return;
    await invoke('pty_kill', { terminalId: id }).catch(console.error);
    setRepoStates((prev) => {
      const s = prev[currentRid] ?? EMPTY_REPO_STATE;
      const activeTab = s.tabs.find((t) => t.id === s.activeTabId);
      if (!activeTab) return prev;
      const newLayout = removeLeaf(activeTab.layout, id);
      // If tab is now empty, remove it
      if (!newLayout) {
        const newTabs = s.tabs.filter((t) => t.id !== activeTab.id);
        if (newTabs.length === 0) setOpen(false);
        return {
          ...prev,
          [currentRid]: {
            tabs: newTabs,
            activeTabId: newTabs[newTabs.length - 1]?.id ?? null,
            allSessions: s.allSessions.filter((sess) => sess.id !== id),
          },
        };
      }
      const remainingIds = collectLeafIds(newLayout);
      const newActiveId = remainingIds.includes(activeTab.activeId)
        ? activeTab.activeId
        : (remainingIds[0] ?? '');
      return {
        ...prev,
        [currentRid]: {
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === activeTab.id
              ? { ...t, layout: newLayout, sessions: remainingIds, activeId: newActiveId }
              : t,
          ),
          allSessions: s.allSessions.filter((sess) => sess.id !== id),
        },
      };
    });
  }, []);

  const restartTerminal = useCallback(async (id: string) => {
    const currentRid = ridRef.current;
    if (!currentRid) return;
    const cwd = localRepoPath ?? '~';
    const newId = await invoke<string>('pty_spawn', { cwd, cols: 80, rows: 24 });
    setRepoStates((prev) => {
      const s = prev[currentRid] ?? EMPTY_REPO_STATE;
      // Find old session to get its title
      const oldSession = s.allSessions.find((sess) => sess.id === id);
      const newSession: TerminalSession = {
        id: newId,
        rid: currentRid,
        title: oldSession?.title ?? 'bash',
      };
      // Replace id with newId in all tab layouts and session lists
      function replaceInLayout(node: LayoutNode): LayoutNode {
        if (node.type === 'leaf') return node.terminalId === id ? { type: 'leaf', terminalId: newId } : node;
        return { ...node, first: replaceInLayout(node.first), second: replaceInLayout(node.second) };
      }
      return {
        ...prev,
        [currentRid]: {
          ...s,
          tabs: s.tabs.map((t) => ({
            ...t,
            layout: replaceInLayout(t.layout),
            sessions: t.sessions.map((sid) => (sid === id ? newId : sid)),
            activeId: t.activeId === id ? newId : t.activeId,
          })),
          allSessions: s.allSessions.map((sess) => (sess.id === id ? newSession : sess)),
        },
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localRepoPath]);

  const setTitle = useCallback((id: string, title: string) => {
    const currentRid = ridRef.current;
    if (!currentRid) return;
    mutateRid(currentRid, (s) => ({
      ...s,
      allSessions: s.allSessions.map((sess) => (sess.id === id ? { ...sess, title } : sess)),
    }));
  }, []);

  return (
    <TerminalContext.Provider value={{
      open, panelHeight, isDark, toggle, show, hide, setPanelHeight,
      repoState, spawnTerminal, closeTab, setActiveTab,
      splitTerminal, setActive, updateLayout,
      killTerminal, restartTerminal, setTitle,
    }}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error('useTerminal must be used within TerminalProvider');
  return ctx;
}
