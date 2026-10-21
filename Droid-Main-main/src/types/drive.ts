export type ActiveSection =
  | 'my-drive'
  | 'shared'
  | 'recent'
  | 'starred'
  | 'trash'
  | 'storage'
  | 'all';

export type FileFilter =
  | 'all'
  | 'folders'
  | 'documents'
  | 'spreadsheets'
  | 'presentations'
  | 'images'
  | 'videos'
  | 'audio'
  | 'archives'
  | 'pdfs';

export interface DriveUser {
  displayName?: string;
  emailAddress?: string;
  photoLink?: string;
  me?: boolean;
}

export interface StorageQuota {
  limit?: string;
  usage?: string;
  usageInDrive?: string;
  usageInDriveTrash?: string;
}

export interface DriveAbout {
  user?: DriveUser;
  storageQuota?: StorageQuota;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  iconLink?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  starred?: boolean;
  trashed?: boolean;
  parents?: string[];
  owners?: DriveUser[];
  shared?: boolean;
  capabilities?: {
    canEdit?: boolean;
    canDelete?: boolean;
    canShare?: boolean;
    canRename?: boolean;
    canDownload?: boolean;
  };
}
