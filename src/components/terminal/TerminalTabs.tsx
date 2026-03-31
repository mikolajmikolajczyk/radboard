import { useTerminal } from '../../contexts/TerminalContext';
import styles from './TerminalTabs.module.css';

export default function TerminalTabs() {
  const { repoState, spawnTerminal, closeTab, setActiveTab, splitTerminal, hide } = useTerminal();
  const { tabs, activeTabId } = repoState;
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeSessionId = activeTab?.activeId ?? '';

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabs}>
        {tabs.map((tab) => {
          const sess = repoState.allSessions.find((s) => s.id === tab.activeId);
          return (
            <button
              key={tab.id}
              className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className={styles.tabTitle}>{sess?.title ?? 'bash'}</span>
              <span
                className={styles.closeBtn}
                role="button"
                aria-label="Close tab"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              >
                ✕
              </span>
            </button>
          );
        })}
        <button className={styles.addBtn} onClick={spawnTerminal} title="New terminal (Ctrl+Shift+T)">+</button>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.actionBtn}
          onClick={() => splitTerminal(activeSessionId, 'horizontal')}
          title="Split vertically (Ctrl+Shift+5)"
          disabled={!activeSessionId}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="1" y="1" width="12" height="12" rx="1" />
            <line x1="7" y1="1" x2="7" y2="13" />
          </svg>
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => splitTerminal(activeSessionId, 'vertical')}
          title="Split horizontally (Ctrl+Shift+-)"
          disabled={!activeSessionId}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="1" y="1" width="12" height="12" rx="1" />
            <line x1="1" y1="7" x2="13" y2="7" />
          </svg>
        </button>
        <button className={styles.actionBtn} onClick={hide} title="Close panel">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <line x1="1" y1="1" x2="11" y2="11" />
            <line x1="11" y1="1" x2="1" y2="11" />
          </svg>
        </button>
      </div>
    </div>
  );
}
