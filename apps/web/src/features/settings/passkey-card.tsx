"use client";
import type * as React from "react";
import { usePasskeyManagement, usePasskeyEditor } from "./use-passkey-management";
import { PasskeyView, PasskeyRowView } from "./components/passkey-view";
import type { PasskeySummary } from "./model";
export function PasskeyCard(): React.JSX.Element {
  const model = usePasskeyManagement();
  return (
    <PasskeyView model={model}>
      {model.passkeys.map((passkey) => (
        <PasskeyRow key={passkey.id} passkey={passkey} />
      ))}
    </PasskeyView>
  );
}
function PasskeyRow({ passkey }: { passkey: PasskeySummary }): React.JSX.Element {
  const model = usePasskeyEditor(passkey);
  return <PasskeyRowView model={model} passkey={passkey} />;
}
