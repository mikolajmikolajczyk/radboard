import { useEffect, useState } from 'react';

const STEPS = [0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5];
const DEFAULT = 1.0;
const STORAGE_KEY = 'radboard_zoom';

function clamp(value: number): number {
  const nearest = STEPS.reduce((prev, cur) =>
    Math.abs(cur - value) < Math.abs(prev - value) ? cur : prev,
  );
  return nearest;
}

function load(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? clamp(parsed) : DEFAULT;
}

export function useZoom() {
  const [zoom, setZoom] = useState<number>(load);

  function zoomIn() {
    setZoom((z) => {
      const next = STEPS[STEPS.indexOf(z) + 1] ?? z;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  function zoomOut() {
    setZoom((z) => {
      const next = STEPS[STEPS.indexOf(z) - 1] ?? z;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  function resetZoom() {
    setZoom(DEFAULT);
    localStorage.setItem(STORAGE_KEY, String(DEFAULT));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
      if (e.key === '-')                  { e.preventDefault(); zoomOut(); }
      if (e.key === '0')                  { e.preventDefault(); resetZoom(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const canZoomIn  = zoom < STEPS[STEPS.length - 1];
  const canZoomOut = zoom > STEPS[0];

  return { zoom, zoomIn, zoomOut, resetZoom, canZoomIn, canZoomOut };
}
