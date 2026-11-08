import { Button, Heading, Section, Text } from "react-email";
import EmailLayout from "./EmailLayout";
import {
  formatTransactionalEmailMessage,
  getTransactionalEmailCopy,
  getTransactionalEmailFallbackLink,
  transactionalEmailSubject,
  type EmailLocale,
} from "../locale";

export default function MagicLinkEmail({
  link,
  appName = "GhostInit",
  locale = "en",
}: {
  link: string;
  appName?: string;
  locale?: EmailLocale;
}) {
  const copy = getTransactionalEmailCopy(locale, "magic-link");
  return (
    <EmailLayout title={transactionalEmailSubject("magic-link", locale, appName)} locale={locale}>
      <Section className="bg-card my-6 rounded-lg px-6 py-12 text-center">
        <Heading as="h2" className="text-foreground mb-4 text-3xl font-bold">
          {copy.title}
        </Heading>
        <Text className="text-mutedForeground mb-6 text-base">
          {formatTransactionalEmailMessage(copy.body, { appName })}
        </Text>
        <Button className="bg-primary rounded-lg px-6 py-3 font-semibold text-white" href={link}>
          {copy.action}
        </Button>
        <Text className="text-mutedForeground mt-6 text-sm">{copy.detail}</Text>
        <Text className="text-mutedForeground mt-2 text-xs">
          {getTransactionalEmailFallbackLink(locale)}
        </Text>
        <Text className="text-mutedForeground mt-2 text-xs break-all">
          <a href={link} className="text-foreground underline">
            {link}
          </a>
        </Text>
      </Section>
    </EmailLayout>
  );
}
