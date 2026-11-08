import "server-only";

export interface OwnedStoredObject {
  id: string;
  ownerId: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  createdAt: Date;
}

export interface OwnedStoredObjectWithData {
  object: OwnedStoredObject;
  data: Uint8Array;
}

export interface OwnedStoragePort {
  putOwned(input: {
    ownerId: string;
    data: Uint8Array;
    originalName: string;
    mimeType: string;
    createdAt?: Date;
  }): Promise<OwnedStoredObject>;
  getOwned(input: { ownerId: string; id: string }): Promise<OwnedStoredObjectWithData | null>;
  deleteOwned(input: { ownerId: string; id: string }): Promise<boolean>;
}
