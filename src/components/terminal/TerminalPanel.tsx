import { useRef, useEffect } from 'react';
import { useTerminal } from '../../contexts/TerminalContext';
import TerminalTabs from './TerminalTabs';
import TerminalWorkspace from './TerminalWorkspace';
import styles from './TerminalPanel.module.css';

export default function TerminalPanel() {
  const { open, panelHeight, setPanelHeight, spawnTerminal, repoState, splitTerminal, closeTab, setActiveTab } = useTerminal();

  // Auto-spawn a terminal when the panel opens with no existing sessions
  useEffect(() => {
    if (open && repoState.tabs.length === 0) {
      spawnTerminal();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  function onResizePointerDown(e: React.PointerEvent) {
    dragging.current = true;
    startY.current = e.clientY;
    startHeight.current = panelHeight;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onResizePointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const delta = startY.current - e.clientY;
    const next = Math.max(120, Math.min(window.innerHeight * 0.9, startHeight.current + delta));
    setPanelHeight(next);
  }

  function onResizePointerUp() {
    dragging.current = false;
  }

  // Panel-scoped keyboard shortcuts
  function onKeyDown(e: React.KeyboardEvent) {
    const { tabs, activeTabId } = repoState;
    const activeTab = tabs.find((t) => t.id === activeTabId);
    const activeId = activeTab?.activeId ?? '';

    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.stopPropagation();
      e.preventDefault();
      spawnTerminal();
    } else if (e.ctrlKey && e.shiftKey && e.key === 'W') {
      e.stopPropagation();
      e.preventDefault();
      if (activeTabId) closeTab(activeTabId);
    } else if (e.ctrlKey && e.shiftKey && e.key === '5') {
      e.stopPropagation();
      e.preventDefault();
      if (activeId) splitTerminal(activeId, 'vertical');
    } else if (e.ctrlKey && e.shiftKey && e.key === '-') {
      e.stopPropagation();
      e.preventDefault();
      if (activeId) splitTerminal(activeId, 'horizontal');
    } else if (e.ctrlKey && !e.shiftKey && e.key === 'Tab') {
      e.stopPropagation();
      e.preventDefault();
      if (tabs.length > 1 && activeTabId) {
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        setActiveTab(tabs[(idx + 1) % tabs.length].id);
      }
    } else if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
      e.stopPropagation();
      e.preventDefault();
      if (tabs.length > 1 && activeTabId) {
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].id);
      }
    } else if (e.ctrlKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
      const n = parseInt(e.key) - 1;
      if (n < tabs.length) {
        e.stopPropagation();
        e.preventDefault();
        setActiveTab(tabs[n].id);
      }
    }
  }

  // Sync main content bottom padding with panel height when open
  useEffect(() => {
    const root = document.querySelector('[data-terminal-root]') as HTMLElement | null;
    if (!root) return;
    root.style.paddingBottom = open ? `${panelHeight}px` : '0';
    return () => { root.style.paddingBottom = '0'; };
  }, [open, panelHeight]);

  return (
    <div
      className={`${styles.panel} ${open ? styles.panelOpen : ''}`}
      style={{ height: panelHeight }}
      onKeyDown={onKeyDown}
      onPointerMove={onResizePointerMove}
      onPointerUp={onResizePointerUp}
    >
      <div
        className={styles.resizeHandle}
        onPointerDown={onResizePointerDown}
      />
      <TerminalTabs />
      <TerminalWorkspace />
    </div>
  );
}
