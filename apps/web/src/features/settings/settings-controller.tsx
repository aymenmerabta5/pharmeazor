"use client";
import type * as React from "react";
import { ProfileCard } from "./profile-card";
import { DangerZoneCard } from "@/features/account-deletion/account-deletion";
import { PasswordCard } from "./password-card";
import { TwoFactorCard } from "./two-factor-card";
import { SessionsCard } from "./sessions-card";
import { PasskeyCard } from "./passkey-card";

export function SettingsController(): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ProfileCard />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <PasswordCard />
        <TwoFactorCard />
      </div>
      <PasskeyCard />
      <SessionsCard />
      <DangerZoneCard />
    </div>
  );
}
