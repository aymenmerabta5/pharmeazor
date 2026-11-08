import {
  Body,
  Container,
  Head,
  Html,
  Tailwind,
  pixelBasedPreset,
  type TailwindConfig,
} from "react-email";
import type { ReactNode } from "react";
import { emailDirection, type EmailLocale } from "../locale";

const tailwindConfig: TailwindConfig = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        background: "#f9f6f1",
        foreground: "#0a0a0a",
        card: "#f9f6f1",
        cardForeground: "#0a0a0a",
        primary: "#d33d00",
        primaryForeground: "#f9f6f1",
        secondary: "#0a0a0a",
        secondaryForeground: "#f9f6f1",
        muted: "#efebe2",
        mutedForeground: "#6a6560",
        accent: "#efebe2",
        accentForeground: "#0a0a0a",
        destructive: "#e7000f",
        border: "#e1deda",
      },
    },
  },
};

export default function EmailLayout({
  children,
  title = "GhostInit",
  locale = "en",
}: {
  children: ReactNode;
  title?: string;
  locale?: EmailLocale;
}) {
  return (
    <Html lang={locale} dir={emailDirection(locale)}>
      <Head>
        <title>{title}</title>
      </Head>
      <Tailwind config={tailwindConfig}>
        <Body className="bg-background text-foreground">
          <Container className="mx-auto max-w-2xl px-6 py-10">{children}</Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export { tailwindConfig };
