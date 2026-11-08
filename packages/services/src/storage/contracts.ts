import "server-only";

export interface StorageActor {
  id: string;
  banned: boolean;
}

export interface AttachmentUpload {
  attachmentId: string;
  conversationId: string;
  ownerId: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface AuthorizedAttachment extends AttachmentUpload {
  storageKey: string;
}

export interface AttachmentDownload {
  data: Uint8Array;
  mimeType: string;
  byteSize: number;
  originalName: string;
}
