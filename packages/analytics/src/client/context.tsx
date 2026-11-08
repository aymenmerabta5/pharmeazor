"use client";

import { createContext, useContext } from "react";
import type { PostHogInterface } from "posthog-js";

export interface PostHogContextValue {
  client: PostHogInterface | null;
  isLoaded: boolean;
  isEnabled: boolean;
  isIdentified: boolean;
}

export const PostHogContext = createContext<PostHogContextValue>({
  client: null,
  isLoaded: false,
  isEnabled: false,
  isIdentified: false,
});

export function usePostHogContext(): PostHogContextValue {
  return useContext(PostHogContext);
}
