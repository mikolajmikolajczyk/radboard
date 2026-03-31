import { useState, useCallback, useRef } from 'react';

interface Options {
  initial: number;
  min: number;
  max: number;
  direction?: 'horizontal' | 'vertical';
  multiplier?: number;
  onResize?: (width: number) => void;
}

interface Return {
  width: number;
  setWidth: (w: number) => void;
  dividerProps: {
    onPointerDown: (e: React.PointerEvent) => void;
  };
  isDragging: boolean;
}

export function useResizableDivider({
  initial,
  min,
  max,
  direction = 'horizontal',
  multiplier = 1,
  onResize,
}: Options): Return {
  const [width, _setWidth] = useState(initial);
  const [isDragging, setIsDragging] = useState(false);

  // Use refs to avoid stale closures without recreating the callback on every change
  const widthRef = useRef(width);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const multiplierRef = useRef(multiplier);
  const onResizeRef = useRef(onResize);

  widthRef.current = width;
  minRef.current = min;
  maxRef.current = max;
  multiplierRef.current = multiplier;
  onResizeRef.current = onResize;

  const setWidth = useCallback((w: number) => {
    const clamped = Math.max(minRef.current, Math.min(maxRef.current, w));
    _setWidth(clamped);
    onResizeRef.current?.(clamped);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startPos = direction === 'horizontal' ? e.clientX : e.clientY;
    const startWidth = widthRef.current;
    setIsDragging(true);

    function onMove(ev: PointerEvent) {
      const pos = direction === 'horizontal' ? ev.clientX : ev.clientY;
      const delta = (pos - startPos) * multiplierRef.current;
      const newWidth = Math.round(startWidth + delta);
      const clamped = Math.max(minRef.current, Math.min(maxRef.current, newWidth));
      _setWidth(clamped);
      onResizeRef.current?.(clamped);
    }

    function onUp() {
      setIsDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [direction]);

  return { width, setWidth, dividerProps: { onPointerDown }, isDragging };
}
