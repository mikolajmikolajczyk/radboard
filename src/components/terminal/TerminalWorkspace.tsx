import { useTerminal } from '../../contexts/TerminalContext';
import type { LayoutNode } from '../../types/terminal';
import SplitPane from './SplitPane';
import TerminalView from './TerminalView';
import styles from './TerminalWorkspace.module.css';

export default function TerminalWorkspace() {
  const { repoState, spawnTerminal, updateLayout } = useTerminal();
  const activeTab = repoState.tabs.find((t) => t.id === repoState.activeTabId);

  if (!activeTab) {
    return (
      <div className={styles.empty}>
        <button className={styles.newTermBtn} onClick={spawnTerminal}>New terminal</button>
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      <LayoutRenderer node={activeTab.layout} tabId={activeTab.id} onUpdateLayout={updateLayout} />
    </div>
  );
}

function LayoutRenderer({
  node,
  tabId,
  onUpdateLayout,
}: {
  node: LayoutNode;
  tabId: string;
  onUpdateLayout: (tabId: string, layout: LayoutNode) => void;
}) {
  if (node.type === 'leaf') {
    return <TerminalView terminalId={node.terminalId} tabId={tabId} />;
  }

  const splitNode = node; // TypeScript narrowing preserved in closures via local variable

  function handleRatioChange(ratio: number) {
    const firstId = collectFirstId(splitNode.first);
    if (firstId) {
      onUpdateLayout(tabId, updateNodeRatio(splitNode, firstId, ratio));
    }
  }

  return (
    <SplitPane
      direction={splitNode.direction}
      ratio={splitNode.ratio}
      first={<LayoutRenderer node={splitNode.first} tabId={tabId} onUpdateLayout={onUpdateLayout} />}
      second={<LayoutRenderer node={splitNode.second} tabId={tabId} onUpdateLayout={onUpdateLayout} />}
      onRatioChange={handleRatioChange}
    />
  );
}

function collectFirstId(node: LayoutNode): string | null {
  if (node.type === 'leaf') return node.terminalId;
  return collectFirstId(node.first);
}

function updateNodeRatio(root: LayoutNode, firstLeafId: string, ratio: number): LayoutNode {
  if (root.type === 'leaf') return root;
  const rootFirstId = collectFirstId(root.first);
  if (rootFirstId === firstLeafId) {
    return { ...root, ratio };
  }
  return {
    ...root,
    first: updateNodeRatio(root.first, firstLeafId, ratio),
    second: updateNodeRatio(root.second, firstLeafId, ratio),
  };
}

