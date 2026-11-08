import type * as React from "react";
export type AnalyticsPrimitive = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsPrimitive>;

export interface ExpoAnalyticsAdapter {
  readonly enabled: boolean;
  capture(event: string, properties?: AnalyticsProperties): void;
  identify(distinctId: string, properties?: AnalyticsProperties): void;
  reset(): void;
  optIn(): Promise<void>;
  optOut(): Promise<void>;
  flush(): Promise<void>;
}

export interface ExpoAnalyticsProviderProps {
  children: React.ReactNode;
  initiallyOptedOut?: boolean;
}

export const EVENT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9 ._/-]{0,127}$/;
const PROPERTY_NAME = /^[a-zA-Z0-9_$][a-zA-Z0-9_$.-]{0,63}$/;
export function validProperties(value: AnalyticsProperties | undefined): boolean {
  if (!value) return true;
  const entries = Object.entries(value);
  return (
    entries.length <= 50 &&
    entries.every(
      ([key, item]) =>
        PROPERTY_NAME.test(key) &&
        (item === null ||
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean"),
    )
  );
}
