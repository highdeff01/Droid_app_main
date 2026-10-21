import React from 'react';
import {
  Eye,
  Info,
  ExternalLink,
  Edit2,
  Star,
  Download,
  RotateCcw,
  Trash2,
  CheckSquare,
  Copy,
  MousePointer,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Layers,
} from 'lucide-react';
import { DriveFile, ActiveSection } from '../types/drive';
import { isFolder } from '../utils/fileUtils';

export type ActionId =
  | 'click'
  | 'preview'
  | 'info'
  | 'open_drive'
  | 'rename'
  | 'star'
  | 'download'
  | 'restore'
  | 'delete'
  | 'select'
  | 'copy_link'
  | 'swipe_up'
  | 'swipe_down'
  | 'swipe_left'
  | 'swipe_right'
  | 'test_diff_frames';

export interface ActionDefinition {
  id: ActionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  destructive?: boolean;
  dividerBefore?: boolean;
  badge?: string;
  category?: 'primary' | 'gesture' | 'standard' | 'danger' | 'advanced';
  isVisible: (file: DriveFile, activeSection: ActiveSection) => boolean;
  execute: (file: DriveFile) => void | Promise<void>;
}

export interface ActionRegistryHandlers {
  activeSection: ActiveSection;
  onOpenFile: (file: DriveFile) => void;
  onPreviewFile: (file: DriveFile) => void;
  onToggleStar: (file: DriveFile) => void;
  onRenameFile: (file: DriveFile) => void;
  onDeleteFile: (file: DriveFile) => void;
  onRestoreFile?: (file: DriveFile) => void;
  onToggleSelectFile?: (fileId: string) => void;
  onShowToast?: (message: string, type?: 'success' | 'error') => void;
  onSwipeAction?: (direction: 'up' | 'down' | 'left' | 'right', file: DriveFile) => void;
  onOpenDiffFrameTester?: (file?: DriveFile) => void;
}

/**
 * Builds and manages the list of file-context-menu actions (click, preview,
 * star, rename, swipe gestures, delete, etc.), wiring each action's
 * visibility and execution to the provided handler callbacks.
 */
export class ActionRegistry {
  private handlers: ActionRegistryHandlers;
  private actions: ActionDefinition[];

  /** Creates the registry and defines all available actions bound to `handlers`. */
  constructor(handlers: ActionRegistryHandlers) {
    this.handlers = handlers;
    this.actions = [
      {
        id: 'click',
        label: 'Click / Select Item',
        icon: MousePointer,
        shortcut: 'Click',
        category: 'primary',
        isVisible: () => true,
        execute: (file: DriveFile) => {
          if (isFolder(file)) {
            this.handlers.onOpenFile(file);
          } else {
            this.handlers.onPreviewFile(file);
          }
          this.handlers.onShowToast?.(`Clicked item: ${file.name}`);
        },
      },
      {
        id: 'preview',
        label: 'Preview & Details',
        icon: Eye,
        shortcut: 'Space',
        category: 'standard',
        isVisible: () => true,
        execute: (file: DriveFile) => {
          this.handlers.onPreviewFile(file);
        },
      },
      {
        id: 'info',
        label: 'File Info',
        icon: Info,
        shortcut: 'I',
        category: 'standard',
        isVisible: () => true,
        execute: (file: DriveFile) => {
          this.handlers.onPreviewFile(file);
        },
      },
      {
        id: 'open_drive',
        label: 'Open in Google Drive',
        icon: ExternalLink,
        shortcut: '↵',
        category: 'standard',
        isVisible: (file) => Boolean(file.webViewLink),
        execute: (file: DriveFile) => {
          if (file.webViewLink) {
            window.open(file.webViewLink, '_blank', 'noopener,noreferrer');
          }
        },
      },
      {
        id: 'star',
        label: 'Toggle Star',
        icon: Star,
        shortcut: 'S',
        category: 'standard',
        isVisible: (_file, section) => section !== 'trash',
        execute: (file: DriveFile) => {
          this.handlers.onToggleStar(file);
        },
      },
      {
        id: 'rename',
        label: 'Rename',
        icon: Edit2,
        shortcut: 'F2',
        dividerBefore: true,
        category: 'standard',
        isVisible: (_file, section) => section !== 'trash',
        execute: (file: DriveFile) => {
          this.handlers.onRenameFile(file);
        },
      },
      {
        id: 'swipe_up',
        label: 'Swipe Up ⬆️',
        icon: ArrowUp,
        category: 'gesture',
        dividerBefore: true,
        isVisible: () => true,
        execute: (file: DriveFile) => {
          this.handlers.onSwipeAction?.('up', file);
          this.handlers.onShowToast?.(`Dispatched Swipe Up on ${file.name}`);
        },
      },
      {
        id: 'swipe_down',
        label: 'Swipe Down ⬇️',
        icon: ArrowDown,
        category: 'gesture',
        isVisible: () => true,
        execute: (file: DriveFile) => {
          this.handlers.onSwipeAction?.('down', file);
          this.handlers.onShowToast?.(`Dispatched Swipe Down on ${file.name}`);
        },
      },
      {
        id: 'swipe_left',
        label: 'Swipe Left ⬅️',
        icon: ArrowLeft,
        category: 'gesture',
        isVisible: () => true,
        execute: (file: DriveFile) => {
          this.handlers.onSwipeAction?.('left', file);
          this.handlers.onShowToast?.(`Dispatched Swipe Left on ${file.name}`);
        },
      },
      {
        id: 'swipe_right',
        label: 'Swipe Right ➡️',
        icon: ArrowRight,
        category: 'gesture',
        isVisible: () => true,
        execute: (file: DriveFile) => {
          this.handlers.onSwipeAction?.('right', file);
          this.handlers.onShowToast?.(`Dispatched Swipe Right on ${file.name}`);
        },
      },
      {
        id: 'test_diff_frames',
        label: 'Test on Diff Frames / Screenshots 🧪',
        icon: Sparkles,
        category: 'advanced',
        dividerBefore: true,
        badge: 'Diff AI',
        isVisible: () => true,
        execute: (file: DriveFile) => {
          this.handlers.onOpenDiffFrameTester?.(file);
        },
      },
      {
        id: 'download',
        label: 'Download',
        icon: Download,
        shortcut: '⌥D',
        dividerBefore: true,
        category: 'standard',
        isVisible: (file, section) => !isFolder(file) && section !== 'trash' && Boolean(file.webContentLink),
        execute: (file: DriveFile) => {
          if (file.webContentLink) {
            const link = document.createElement('a');
            link.href = file.webContentLink;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        },
      },
      {
        id: 'copy_link',
        label: 'Copy Drive Link',
        icon: Copy,
        shortcut: '⌘C',
        category: 'standard',
        isVisible: (file) => Boolean(file.webViewLink),
        execute: async (file: DriveFile) => {
          if (file.webViewLink && navigator.clipboard) {
            try {
              await navigator.clipboard.writeText(file.webViewLink);
              this.handlers.onShowToast?.(`Link copied to clipboard: ${file.name}`);
            } catch {
              // fallback
            }
          }
        },
      },
      {
        id: 'select',
        label: 'Select / Toggle',
        icon: CheckSquare,
        shortcut: 'X',
        category: 'standard',
        isVisible: () => Boolean(this.handlers.onToggleSelectFile),
        execute: (file: DriveFile) => {
          this.handlers.onToggleSelectFile?.(file.id);
        },
      },
      {
        id: 'restore',
        label: 'Restore Item',
        icon: RotateCcw,
        shortcut: '⌥R',
        dividerBefore: true,
        category: 'standard',
        isVisible: (_file, section) => section === 'trash' && Boolean(this.handlers.onRestoreFile),
        execute: (file: DriveFile) => {
          this.handlers.onRestoreFile?.(file);
        },
      },
      {
        id: 'delete',
        label: 'Move to Trash',
        icon: Trash2,
        shortcut: '⌫',
        destructive: true,
        dividerBefore: true,
        category: 'danger',
        isVisible: () => true,
        execute: (file: DriveFile) => {
          this.handlers.onDeleteFile(file);
        },
      },
    ];
  }

  /** Replaces the handler callbacks used by registered actions. */
  public updateHandlers(handlers: ActionRegistryHandlers) {
    this.handlers = handlers;
  }

  /**
   * Returns the actions visible for `file` in the current section, with
   * dynamic labels (e.g. star/delete) adjusted based on file state.
   */
  public getAvailableActions(file: DriveFile): ActionDefinition[] {
    return this.actions
      .filter((action) => action.isVisible(file, this.handlers.activeSection))
      .map((action) => {
        // Customize dynamic labels based on state
        if (action.id === 'star') {
          return {
            ...action,
            label: file.starred ? 'Remove Star' : 'Add Star',
          };
        }
        if (action.id === 'delete') {
          return {
            ...action,
            label: this.handlers.activeSection === 'trash' ? 'Delete Permanently' : 'Move to Trash',
          };
        }
        return action;
      });
  }

  /** Runs the `execute` handler for the action matching `actionId`, if registered. */
  public async executeAction(actionId: ActionId, file: DriveFile): Promise<void> {
    const action = this.actions.find((a) => a.id === actionId);
    if (action) {
      await action.execute(file);
    }
  }
}
