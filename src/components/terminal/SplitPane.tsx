import { useRef } from 'react';
import styles from './SplitPane.module.css';

interface SplitPaneProps {
  direction: 'horizontal' | 'vertical';
  ratio: number;
  first: React.ReactNode;
  second: React.ReactNode;
  onRatioChange: (r: number) => void;
}

export default function SplitPane({ direction, ratio, first, second, onRatioChange }: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startPos = useRef(0);
  const startRatio = useRef(ratio);

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true;
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startRatio.current = ratio;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const size = direction === 'horizontal' ? rect.width : rect.height;
    const delta = (direction === 'horizontal' ? e.clientX : e.clientY) - startPos.current;
    const newRatio = Math.max(0.1, Math.min(0.9, startRatio.current + delta / size));
    onRatioChange(newRatio);
  }

  function onPointerUp() {
    dragging.current = false;
  }

  const isH = direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={isH ? styles.splitH : styles.splitV}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div style={{ [isH ? 'flexBasis' : 'flexBasis']: `${ratio * 100}%`, overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        {first}
      </div>
      <div
        className={isH ? styles.dividerH : styles.dividerV}
        onPointerDown={onPointerDown}
      />
      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        {second}
      </div>
    </div>
  );
}
