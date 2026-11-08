"use client";
import { useAppForm, useStore } from "@/components/ui/form";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { downloadObjectBase64 } from "./queries";
import { removeStoredObject, uploadTextObject } from "./mutations";
import { useSurfaceTranslations } from "@/lib/translations";

type StorageAction =
  | { kind: "upload"; name: string; text: string }
  | { kind: "download" | "remove"; id: string };
function textFromBase64(value: string): string {
  return new TextDecoder().decode(
    Uint8Array.from(atob(value), (character) => character.charCodeAt(0)),
  );
}
export function useStorageWorkspace() {
  const t = useSurfaceTranslations("storage");
  const uploadForm = useAppForm({
    defaultValues: { name: "note.txt", text: t("defaultText") },
    onSubmit: async ({ value }): Promise<void> => {
      await mutation.run({ kind: "upload", ...value });
    },
  });
  const objectForm = useAppForm({
    defaultValues: { objectId: "" },
    onSubmit: async ({ value }): Promise<void> => {
      await mutation.run({ kind: "download", id: value.objectId });
    },
  });
  const { name, text } = useStore(uploadForm.store, (state) => state.values);
  const objectId = useStore(objectForm.store, (state) => state.values.objectId);
  const setName = (value: string): void => {
    uploadForm.setFieldValue("name", value);
  };
  const setText = (value: string): void => {
    uploadForm.setFieldValue("text", value);
  };
  const setObjectId = (value: string): void => {
    objectForm.setFieldValue("objectId", value);
  };
  const mutation = useAuthOwnedMutation(
    async (action: StorageAction) => {
      if (action.kind === "upload")
        return {
          kind: "upload" as const,
          stored: await uploadTextObject({ originalName: action.name, text: action.text }),
        };
      if (action.kind === "download")
        return {
          kind: "download" as const,
          text: textFromBase64((await downloadObjectBase64(action.id)).base64),
        };
      await removeStoredObject(action.id);
      return { kind: "remove" as const };
    },
    {
      onSuccess: (result) => {
        if (result.kind === "upload") setObjectId(result.stored.id);
      },
    },
  );
  const action = mutation.variables?.kind;
  const status = mutation.error
    ? action === "upload"
      ? t("uploadError")
      : action === "download"
        ? t("downloadError")
        : t("removeError")
    : mutation.data?.kind === "upload"
      ? t("uploaded")
      : mutation.data?.kind === "download"
        ? t("downloaded")
        : mutation.data?.kind === "remove"
          ? t("removed")
          : null;
  return {
    objectId,
    setObjectId,
    name,
    setName,
    text,
    setText,
    status,
    isPending: mutation.isPending,
    downloaded: mutation.data?.kind === "download" ? mutation.data.text : "",
    upload: () => {
      void uploadForm.handleSubmit();
    },
    download: () => {
      void objectForm.handleSubmit();
    },
    remove: () => {
      void mutation.run({ kind: "remove", id: objectForm.state.values.objectId });
    },
  };
}
