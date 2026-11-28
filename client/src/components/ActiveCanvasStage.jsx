import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const ActiveCanvasContext = createContext(null);

export function createBlockingOverlayRegistration(setBlockingOverlayCount) {
  setBlockingOverlayCount((count) => count + 1);
  let released = false;

  return () => {
    if (released) return;
    released = true;
    setBlockingOverlayCount((count) => Math.max(0, count - 1));
  };
}

/**
 * Owns the single visual stage used by the current screen and its shared
 * HTML overlays. Canvas hooks register their live element here so controls
 * can follow the rendered CSS box instead of the browser viewport.
 */
export function ActiveCanvasStage({ children }) {
  const stageRef = useRef(null);
  const contentRef = useRef(null);
  const [activeCanvas, setActiveCanvas] = useState(null);
  const [blockingOverlayCount, setBlockingOverlayCount] = useState(0);
  const [dialogControls, setDialogControls] = useState(null);
  const registerDialogControls = useCallback((controls) => {
    setDialogControls(controls);
    return () => setDialogControls(current => current === controls ? null : current);
  }, []);

  const registerCanvas = useCallback((canvas) => {
    if (!canvas) return () => {};
    setActiveCanvas(canvas);
    return () => {
      setActiveCanvas((current) => (current === canvas ? null : current));
    };
  }, []);

  const registerBlockingOverlay = useCallback(
    () => createBlockingOverlayRegistration(setBlockingOverlayCount),
    [],
  );

  const value = useMemo(() => ({
    stageRef,
    contentRef,
    activeCanvas,
    registerCanvas,
    registerBlockingOverlay,
    registerDialogControls,
    dialogControls: blockingOverlayCount === 1 ? dialogControls : null,
    blockingOverlayOpen: blockingOverlayCount > 0,
  }), [activeCanvas, blockingOverlayCount, registerBlockingOverlay, registerCanvas, registerDialogControls, dialogControls]);

  return (
    <ActiveCanvasContext.Provider value={value}>
      <div
        ref={stageRef}
        data-testid="active-canvas-stage"
        style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
      >
        <div
          ref={contentRef}
          data-testid="active-canvas-content"
          style={{ display: 'contents' }}
        >
          {children}
        </div>
      </div>
    </ActiveCanvasContext.Provider>
  );
}

export function useRegisterActiveCanvas(canvasRef) {
  const context = useContext(ActiveCanvasContext);
  const registerCanvas = context?.registerCanvas;

  useLayoutEffect(() => {
    if (!registerCanvas || !canvasRef.current) return undefined;
    return registerCanvas(canvasRef.current);
  }, [canvasRef, registerCanvas]);
}

export function useActiveCanvasStage() {
  const context = useContext(ActiveCanvasContext);
  if (!context) {
    throw new Error('useActiveCanvasStage must be used inside ActiveCanvasStage');
  }
  return context;
}

export function useBlockingCanvasOverlayOpen() {
  return useContext(ActiveCanvasContext)?.blockingOverlayOpen ?? false;
}

export function useBlockingCanvasOverlay() {
  const context = useContext(ActiveCanvasContext);

  useEffect(
    () => context?.registerBlockingOverlay(),
    [context?.registerBlockingOverlay],
  );
}

/** Route the existing overlay to native dialog buttons, never to the canvas. */
export function useDialogDpad(dialogRef, onBack, enabled = true) {
  const context = useContext(ActiveCanvasContext);
  const backRef = useRef(onBack);
  backRef.current = onBack;
  useEffect(() => {
    // Disabled while another overlay (e.g. the exit confirm) freezes this dialog.
    if (!enabled || !context?.registerDialogControls) return undefined;
    let selected = null;
    return context.registerDialogControls({
      handleKey(key, type) {
        if (type !== 'keydown') return;
        const buttons = Array.from(dialogRef.current?.querySelectorAll('button:not(:disabled)') || [])
          .filter(button => !button.hasAttribute('data-dialog-close')
            && !button.closest('[hidden], [inert]') && button.getClientRects().length);
        const active = buttons.includes(document.activeElement) ? document.activeElement : selected;
        if (key === 'Escape') { backRef.current?.(); return; }
        if (key === 'Enter') { (buttons.includes(active) ? active : buttons[0])?.click(); return; }
        if (!key.startsWith('Arrow') || !buttons.length) return;
        const direction = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1;
        const current = buttons.indexOf(active);
        const next = current < 0 ? (direction < 0 ? buttons.length - 1 : 0)
          : (current + direction + buttons.length) % buttons.length;
        selected = buttons[next];
        selected.focus({ preventScroll: true });
        selected.scrollIntoView({ block: 'nearest' });
      },
    });
  }, [context?.registerDialogControls, dialogRef, enabled]);
}
