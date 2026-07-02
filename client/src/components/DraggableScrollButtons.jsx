import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Floating "scroll to top / bottom" button group that lives at the bottom of the
 * screen and can be dragged horizontally (left ↔ right only). The vertical
 * position stays pinned to the bottom; the user can only slide it sideways so it
 * can be moved out of the way when it overlaps other content.
 *
 * Pass the scroll buttons themselves as children (they remain fully clickable —
 * dragging is done via the dedicated grip handle on the left).
 *
 * @param {string}  storageKey    unique key so each instance remembers its own position
 * @param {number}  initialRight  default distance (px) from the right edge before the user drags
 */
export default function DraggableScrollButtons({
  children,
  storageKey = 'scrollBtnsPos',
  initialRight = 40,
}) {
  const containerRef = useRef(null);
  const dragOffset = useRef(null);
  // `left` in px once the user has dragged; null means "use the default right offset"
  const [left, setLeft] = useState(null);

  // Restore any position the user set earlier in this session
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved !== null) setLeft(parseFloat(saved));
  }, [storageKey]);

  // Keep the widget on screen (px from the left), leaving a 4px margin on each side
  const clampLeft = useCallback((x) => {
    const width = containerRef.current?.offsetWidth || 40;
    const max = window.innerWidth - width - 4;
    return Math.max(4, Math.min(x, max));
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (dragOffset.current === null) return;
    setLeft(clampLeft(e.clientX - dragOffset.current));
  }, [clampLeft]);

  const handlePointerUp = useCallback(() => {
    dragOffset.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    // Persist wherever it ended up
    setLeft((prev) => {
      if (prev !== null) sessionStorage.setItem(storageKey, String(prev));
      return prev;
    });
  }, [handlePointerMove, storageKey]);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    dragOffset.current = e.clientX - rect.left;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove, handlePointerUp]);

  // Re-clamp if the window is resized so it never ends up off screen
  useEffect(() => {
    const onResize = () => setLeft((prev) => (prev === null ? prev : clampLeft(prev)));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampLeft]);

  const style = left === null ? { right: initialRight } : { left };

  return (
    <div
      ref={containerRef}
      className="fixed bottom-6 max-md:bottom-4 z-40 flex items-center gap-1.5 max-lg:max-w-full"
      style={style}
    >
      {/* Drag handle — grab this to slide the buttons left/right */}
      <div
        onPointerDown={handlePointerDown}
        title="Drag left / right"
        className="cursor-ew-resize flex items-center justify-center w-4 h-8 max-md:w-6 max-md:h-10 rounded text-gray-400 hover:text-gray-600 touch-none select-none"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" />
          <circle cx="15" cy="18" r="1.6" />
        </svg>
      </div>

      {/* The scroll buttons (kept stacked vertically) */}
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}
