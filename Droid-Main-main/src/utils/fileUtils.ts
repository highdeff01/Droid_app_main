import { DriveFile } from '../types/drive';

/** Formats a byte count as a human-readable size string (e.g. "1.5 MB"). */
export function formatBytes(bytes?: string | number, decimals = 1): string {
  if (!bytes) return '--';
  const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(num) || num === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(num) / Math.log(k));
  return `${parseFloat((num / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/** Formats an ISO date string for display, omitting the year when it matches the current year. */
export function formatDate(dateString?: string): string {
  if (!dateString) return '--';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '--';
    
    // Check if within current year
    const now = new Date();
    const isCurrentYear = now.getFullYear() === date.getFullYear();
    
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: isCurrentYear ? undefined : 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '--';
  }
}

/** Returns true when `file` represents a Google Drive folder. */
export function isFolder(file: DriveFile): boolean {
  return file.mimeType === 'application/vnd.google-apps.folder';
}

export interface FileCategoryInfo {
  label: string;
  color: string;
  bgColor: string;
  iconType: 'folder' | 'doc' | 'sheet' | 'slide' | 'pdf' | 'image' | 'video' | 'audio' | 'archive' | 'code' | 'file';
}

/** Maps a mime type to display metadata (label, colors, and icon type) for file listings. */
export function getFileCategory(mimeType: string): FileCategoryInfo {
  if (mimeType === 'application/vnd.google-apps.folder') {
    return {
      label: 'Folder',
      color: 'text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
      iconType: 'folder',
    };
  }

  if (
    mimeType === 'application/vnd.google-apps.document' ||
    mimeType.includes('wordprocessingml') ||
    mimeType.includes('msword') ||
    mimeType.startsWith('text/')
  ) {
    return {
      label: mimeType === 'application/vnd.google-apps.document' ? 'Google Doc' : 'Document',
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
      iconType: 'doc',
    };
  }

  if (
    mimeType === 'application/vnd.google-apps.spreadsheet' ||
    mimeType.includes('spreadsheet') ||
    mimeType === 'text/csv'
  ) {
    return {
      label: mimeType === 'application/vnd.google-apps.spreadsheet' ? 'Google Sheet' : 'Spreadsheet',
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
      iconType: 'sheet',
    };
  }

  if (
    mimeType === 'application/vnd.google-apps.presentation' ||
    mimeType.includes('presentation')
  ) {
    return {
      label: mimeType === 'application/vnd.google-apps.presentation' ? 'Google Slides' : 'Presentation',
      color: 'text-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400',
      iconType: 'slide',
    };
  }

  if (mimeType === 'application/pdf') {
    return {
      label: 'PDF Document',
      color: 'text-rose-500',
      bgColor: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400',
      iconType: 'pdf',
    };
  }

  if (mimeType.startsWith('image/')) {
    return {
      label: 'Image',
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400',
      iconType: 'image',
    };
  }

  if (mimeType.startsWith('video/')) {
    return {
      label: 'Video',
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400',
      iconType: 'video',
    };
  }

  if (mimeType.startsWith('audio/')) {
    return {
      label: 'Audio',
      color: 'text-pink-500',
      bgColor: 'bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400',
      iconType: 'audio',
    };
  }

  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar') || mimeType.includes('7z')) {
    return {
      label: 'Archive',
      color: 'text-zinc-500',
      bgColor: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300',
      iconType: 'archive',
    };
  }

  if (
    mimeType.includes('json') ||
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType.includes('html') ||
    mimeType.includes('css') ||
    mimeType.includes('xml')
  ) {
    return {
      label: 'Code',
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400',
      iconType: 'code',
    };
  }

  return {
    label: 'File',
    color: 'text-slate-500',
    bgColor: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
    iconType: 'file',
  };
}
