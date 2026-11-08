import { Button, Heading, Section, Text } from "react-email";
import EmailLayout from "./EmailLayout";
import {
  formatTransactionalEmailMessage,
  getTransactionalEmailCopy,
  getTransactionalEmailFallbackLink,
  transactionalEmailSubject,
  type EmailLocale,
} from "../locale";

export default function ResetPasswordEmail({
  link,
  appName = "GhostInit",
  locale = "en",
}: {
  link: string;
  appName?: string;
  locale?: EmailLocale;
}) {
  const copy = getTransactionalEmailCopy(locale, "password-reset");
  return (
    <EmailLayout
      title={transactionalEmailSubject("password-reset", locale, appName)}
      locale={locale}
    >
      <Section className="bg-card my-6 rounded-lg px-6 py-12 text-center">
        <Heading as="h1" className="text-primary mb-2 text-2xl font-bold">
          {appName}
        </Heading>
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
