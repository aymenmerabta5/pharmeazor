import { implement } from "@orpc/server";
import { createStorageActions } from "./actions";
import { storageContract } from "./contract";
import type { ResolveStorageService, StorageTransportContext } from "./context";

export function createStorageProcedures<TContext extends StorageTransportContext>(
  resolveService: ResolveStorageService<TContext>,
) {
  const implementer = implement<typeof storageContract, TContext>(storageContract);
  const actions = createStorageActions(resolveService);
  return {
    upload: implementer.upload.handler(actions.upload),
    uploadBase64: implementer.uploadBase64.handler(actions.uploadBase64),
    download: implementer.download.handler(actions.download),
    downloadBase64: implementer.downloadBase64.handler(actions.downloadBase64),
    remove: implementer.remove.handler(actions.remove),
  };
}
