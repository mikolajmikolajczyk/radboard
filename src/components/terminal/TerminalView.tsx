import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type { ITheme } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useTerminal } from '../../contexts/TerminalContext';
import styles from './TerminalView.module.css';

interface TerminalViewProps {
  terminalId: string;
  tabId: string;
}

function buildXtermTheme(isDark: boolean): ITheme {
  if (isDark) {
    return {
      background: '#0d1117',
      foreground: '#cdd9e5',
      cursor: '#f87171',
      selectionBackground: 'rgba(248,113,113,0.25)',
      black: '#22272e', brightBlack: '#444c56',
      red: '#f47067', brightRed: '#ff938a',
      green: '#57ab5a', brightGreen: '#6bc46d',
      yellow: '#c69026', brightYellow: '#daaa3f',
      blue: '#539bf5', brightBlue: '#6cb6ff',
      magenta: '#b083f0', brightMagenta: '#dcbdfb',
      cyan: '#39c5cf', brightCyan: '#56d4dd',
      white: '#909dab', brightWhite: '#cdd9e5',
    };
  }
  return {
    background: '#ffffff',
    foreground: '#1f2328',
    cursor: '#cf222e',
    selectionBackground: 'rgba(207,34,46,0.15)',
    black: '#24292f', brightBlack: '#57606a',
    red: '#cf222e', brightRed: '#a40e26',
    green: '#116329', brightGreen: '#1a7f37',
    yellow: '#633f00', brightYellow: '#7d4e00',
    blue: '#0969da', brightBlue: '#218bff',
    magenta: '#8250df', brightMagenta: '#a475f9',
    cyan: '#1b7c83', brightCyan: '#3192aa',
    white: '#6e7781', brightWhite: '#1f2328',
  };
}

export default function TerminalView({ terminalId, tabId }: TerminalViewProps) {
  const { setActive, killTerminal, isDark, repoState } = useTerminal();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const activeTab = repoState.tabs.find((t) => t.id === tabId);
  const isActive = activeTab?.activeId === terminalId;

  // Focus when active
  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus();
    }
  }, [isActive]);

  // Re-apply theme when dark/light changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = buildXtermTheme(isDark);
    }
  }, [isDark]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      theme: buildXtermTheme(isDark),
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    // Try WebGL, fall back to canvas on error
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      // canvas renderer used as fallback
    }

    fitAddon.fit();
    invoke('pty_resize', { terminalId, cols: term.cols, rows: term.rows }).catch(console.error);

    const inputDisposable = term.onData((data) => {
      invoke('pty_write', {
        terminalId,
        data: Array.from(new TextEncoder().encode(data)),
      }).catch(console.error);
    });

    let alive = true;

    const dataListenerPromise = listen<{ terminalId: string; data: string }>('pty_data', (event) => {
      if (!alive) return;
      if (event.payload.terminalId !== terminalId) return;
      const bytes = Uint8Array.from(atob(event.payload.data), (c) => c.charCodeAt(0));
      term.write(bytes);
    });

    const exitListenerPromise = listen<{ terminalId: string }>('pty_exit', (event) => {
      if (!alive) return;
      if (event.payload.terminalId !== terminalId) return;
      killTerminal(terminalId);
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    return () => {
      alive = false;
      inputDisposable.dispose();
      dataListenerPromise.then((fn) => fn());
      exitListenerPromise.then((fn) => fn());
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
      const term = termRef.current;
      if (term) {
        invoke('pty_resize', { terminalId, cols: term.cols, rows: term.rows }).catch(console.error);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [terminalId]);

  return (
    <div
      className={`${styles.terminalView} ${isActive ? styles.active : ''}`}
      onClick={() => setActive(terminalId)}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
