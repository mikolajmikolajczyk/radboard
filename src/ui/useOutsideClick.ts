import { useEffect } from 'react';

export function useOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [ref, handler, active]);
}
