import { DriveAbout, DriveFile, FileFilter } from '../types/drive';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

/** Fetches the authenticated user's Drive profile and storage quota information. */
export async function fetchDriveAbout(accessToken: string): Promise<DriveAbout> {
  const res = await fetch(`${DRIVE_API_BASE}/about?fields=user,storageQuota`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch Drive information (${res.status})`);
  }

  return res.json();
}

interface ListFilesOptions {
  folderId?: string;
  searchQuery?: string;
  trashed?: boolean;
  starred?: boolean;
  filterType?: FileFilter;
  orderBy?: string;
  pageToken?: string;
}

/**
 * Lists Drive files matching the given folder, search, starred/trashed, and
 * mime-type filter options, building the Drive API query string and
 * returning the resulting files along with a pagination token.
 */
export async function listDriveFiles(
  accessToken: string,
  options: ListFilesOptions = {}
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const qParts: string[] = [];

  if (options.trashed) {
    qParts.push('trashed = true');
  } else {
    qParts.push('trashed = false');

    if (options.starred) {
      qParts.push('starred = true');
    }
  }

  // Handle search query with safe tokenization for multi-word, underscore, and hyphenated queries
  if (options.searchQuery && options.searchQuery.trim().length > 0) {
    const raw = options.searchQuery.trim();
    const rawTokens = raw.split(/\s+/).filter(Boolean);
    const subTokens = raw.split(/[\s_\-]+/).filter(Boolean);

    const escapeToken = (t: string) => t.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    if (rawTokens.length === 1) {
      const primaryEscaped = escapeToken(rawTokens[0]);
      if (subTokens.length > 1) {
        // e.g. unified_ai_master_app -> matches both exact name and separated tokens
        const subQueries = subTokens.map((t) => `name contains '${escapeToken(t)}'`);
        qParts.push(`(name contains '${primaryEscaped}' or (${subQueries.join(' and ')}))`);
      } else {
        qParts.push(`name contains '${primaryEscaped}'`);
      }
    } else {
      // Multiple words: e.g. "unified ai master app" -> matches each token AND snake_case variant
      const tokenQueries = rawTokens.map((t) => `name contains '${escapeToken(t)}'`);
      const snakeCase = escapeToken(rawTokens.join('_'));
      qParts.push(`((${tokenQueries.join(' and ')}) or name contains '${snakeCase}')`);
    }
  } else if (!options.starred && !options.trashed) {
    // Only constrain by parents if not searching globally or filtering by starred/trashed
    if (options.folderId) {
      qParts.push(`'${options.folderId}' in parents`);
    } else {
      qParts.push("'root' in parents");
    }
  }

  if (options.filterType && options.filterType !== 'all') {
    switch (options.filterType) {
      case 'folders':
        qParts.push("mimeType = 'application/vnd.google-apps.folder'");
        break;
      case 'documents':
        qParts.push(
          "(mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType contains 'text/')"
        );
        break;
      case 'spreadsheets':
        qParts.push(
          "(mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'text/csv')"
        );
        break;
      case 'presentations':
        qParts.push(
          "(mimeType = 'application/vnd.google-apps.presentation' or mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation')"
        );
        break;
      case 'pdfs':
        qParts.push("mimeType = 'application/pdf'");
        break;
      case 'media':
        qParts.push("(mimeType contains 'image/' or mimeType contains 'video/' or mimeType contains 'audio/')");
        break;
    }
  }

  const query = qParts.join(' and ');
  const params = new URLSearchParams({
    q: query,
    pageSize: '100',
    fields:
      'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,starred,trashed,iconLink,thumbnailLink,webViewLink,webContentLink,parents,owners,shared)',
    orderBy: options.orderBy || 'folder,modifiedTime desc',
  });

  if (options.pageToken) {
    params.set('pageToken', options.pageToken);
  }

  const res = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to list files (${res.status})`);
  }

  return res.json();
}

/** Creates a new folder in Drive under `parentId` (defaults to the root folder). */
export async function createDriveFolder(
  accessToken: string,
  folderName: string,
  parentId: string = 'root'
): Promise<DriveFile> {
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : ['root'],
  };

  const res = await fetch(`${DRIVE_API_BASE}/files?fields=id,name,mimeType,modifiedTime,webViewLink,iconLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create folder (${res.status})`);
  }

  return res.json();
}

/** Creates a new blank Google Doc or Sheet in Drive under `parentId`. */
export async function createBlankGoogleDoc(
  accessToken: string,
  docName: string,
  mimeType: 'application/vnd.google-apps.document' | 'application/vnd.google-apps.spreadsheet',
  parentId: string = 'root'
): Promise<DriveFile> {
  const metadata = {
    name: docName,
    mimeType,
    parents: parentId ? [parentId] : ['root'],
  };

  const res = await fetch(`${DRIVE_API_BASE}/files?fields=id,name,mimeType,modifiedTime,webViewLink,iconLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create file (${res.status})`);
  }

  return res.json();
}

/**
 * Uploads a local `File` to Drive under `parentId` using a multipart
 * request that combines JSON metadata with the raw file bytes.
 */
export async function uploadFileToDrive(
  accessToken: string,
  file: File,
  parentId: string = 'root'
): Promise<DriveFile> {
  const metadata = {
    name: file.name,
    parents: parentId ? [parentId] : ['root'],
  };

  const boundary = `-------DriveBoundary${Date.now()}`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metaPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const fileHeader = `${delimiter}Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`;

  const fileBuffer = await file.arrayBuffer();
  const encoder = new TextEncoder();
  const metaBytes = encoder.encode(metaPart);
  const headerBytes = encoder.encode(fileHeader);
  const closeBytes = encoder.encode(closeDelim);

  const totalLength = metaBytes.length + headerBytes.length + fileBuffer.byteLength + closeBytes.length;
  const combined = new Uint8Array(totalLength);

  let offset = 0;
  combined.set(metaBytes, offset);
  offset += metaBytes.length;

  combined.set(headerBytes, offset);
  offset += headerBytes.length;

  combined.set(new Uint8Array(fileBuffer), offset);
  offset += fileBuffer.byteLength;

  combined.set(closeBytes, offset);

  const res = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink,iconLink,thumbnailLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to upload file (${res.status})`);
  }

  return res.json();
}

/** Patches a Drive file's metadata (name, starred, or trashed state). */
export async function updateDriveFile(
  accessToken: string,
  fileId: string,
  updates: { name?: string; starred?: boolean; trashed?: boolean }
): Promise<DriveFile> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?fields=id,name,mimeType,starred,trashed,modifiedTime`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to update file (${res.status})`);
  }

  return res.json();
}

/** Permanently deletes a Drive file, bypassing the trash. */
export async function deleteDriveFilePermanently(
  accessToken: string,
  fileId: string
): Promise<void> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to permanently delete file (${res.status})`);
  }
}

/** Permanently deletes all files currently in the Drive trash. */
export async function emptyDriveTrash(accessToken: string): Promise<void> {
  const res = await fetch(`${DRIVE_API_BASE}/files/trash`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to empty trash (${res.status})`);
  }
}
