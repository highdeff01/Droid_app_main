import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DriveFile } from '../types/drive';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuState {
  isOpen: boolean;
  position: ContextMenuPosition;
  file: DriveFile | null;
}

const MENU_WIDTH = 220;
const MENU_HEIGHT = 340;
const PADDING = 12;

/**
 * React hook managing a custom right-click context menu's open/position
 * state, clamping its position within the viewport, and closing it on
 * outside clicks, scroll, or Escape.
 */
export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    file: null,
  });

  const [pulsingFileId, setPulsingFileId] = useState<string | null>(null);
  const pulseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /** Closes the context menu, clearing the selected file. */
  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => (prev.isOpen ? { ...prev, isOpen: false, file: null } : prev));
  }, []);

  /**
   * Opens the context menu for `file` at the click position (clamped to
   * stay within the viewport) and triggers a brief pulse highlight on it.
   */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, file: DriveFile) => {
      // 1. Prevent default browser context menu
      e.preventDefault();
      e.stopPropagation();

      // 2. Trigger brief visual pulse feedback on the target item
      setPulsingFileId(file.id);
      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current);
      }
      pulseTimeoutRef.current = setTimeout(() => {
        setPulsingFileId(null);
      }, 500);

      // 3. Clamping coordinates to ensure menu stays fully visible in viewport
      const clickX = e.clientX;
      const clickY = e.clientY;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      const clampedX =
        clickX + MENU_WIDTH > windowWidth - PADDING
          ? Math.max(PADDING, windowWidth - MENU_WIDTH - PADDING)
          : clickX;

      const clampedY =
        clickY + MENU_HEIGHT > windowHeight - PADDING
          ? Math.max(PADDING, windowHeight - MENU_HEIGHT - PADDING)
          : clickY;

      setContextMenu({
        isOpen: true,
        position: { x: clampedX, y: clampedY },
        file,
      });
    },
    []
  );

  // Close context menu on global click or Escape key
  useEffect(() => {
    if (!contextMenu.isOpen) return;

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('#custom-context-menu-overlay')) {
        return;
      }
      closeContextMenu();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };

    const handleScroll = () => {
      closeContextMenu();
    };

    window.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

    return () => {
      window.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, { capture: true });
      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current);
      }
    };
  }, [contextMenu.isOpen, closeContextMenu]);

  return {
    contextMenu,
    pulsingFileId,
    handleContextMenu,
    closeContextMenu,
  };
}
