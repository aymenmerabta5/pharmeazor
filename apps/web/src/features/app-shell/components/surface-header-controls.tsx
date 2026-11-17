"use client";
import type * as React from "react";
import { HeaderActions, type HeaderActionsProps } from "@/components/header-actions";
import { MobileMenu } from "../mobile-menu";

export interface SurfaceHeaderControlsProps extends Omit<HeaderActionsProps, "mobileMenu"> {
  menuClassName?: string;
}

/**
 * Header controls for the immersive surfaces.
 *
 * Desktop keeps the real controls in the bar: language, appearance and the
 * account. Below the small breakpoint the same component swaps them for one
 * full-screen menu trigger, so a phone never renders a row of narrow targets
 * and a desktop never opens a phone menu.
 *
 * The identity and its actions arrive as props: the feature container owns the
 * shell workflow, this view only decides how the controls are arranged.
 */
export function SurfaceHeaderControls({
  identity,
  onNavigate,
  onSignOut,
  menuClassName,
}: SurfaceHeaderControlsProps): React.JSX.Element {
  return (
    <HeaderActions
      identity={identity}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
      mobileMenu={<MobileMenu className={menuClassName} />}
    />
  );
}
