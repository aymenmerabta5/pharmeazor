import { Button, Heading, Section, Text } from "react-email";
import EmailLayout from "./EmailLayout";
import {
  formatTransactionalEmailMessage,
  getTransactionalEmailCopy,
  transactionalEmailSubject,
  type EmailLocale,
} from "../locale";

export default function WelcomeEmail({
  appName = "GhostInit",
  name,
  dashboardUrl = "/dashboard",
  locale = "en",
}: {
  appName?: string;
  name?: string;
  dashboardUrl?: string;
  locale?: EmailLocale;
}) {
  const copy = getTransactionalEmailCopy(locale, "welcome");
  const title =
    name && copy.titleWithName
      ? formatTransactionalEmailMessage(copy.titleWithName, { name })
      : copy.title;
  return (
    <EmailLayout title={transactionalEmailSubject("welcome", locale, appName)} locale={locale}>
      <Section className="bg-card my-6 rounded-lg px-6 py-12 text-center">
        <Heading as="h1" className="text-primary mb-2 text-2xl font-bold">
          {appName}
        </Heading>
        <Heading as="h2" className="text-foreground mb-4 text-3xl font-bold">
          {title}
        </Heading>
        <Text className="text-mutedForeground mb-6 text-base">
          {formatTransactionalEmailMessage(copy.body, { appName })}
        </Text>
        <Button
          className="bg-primary rounded-lg px-6 py-3 font-semibold text-white"
          href={dashboardUrl}
        >
          {copy.action}
        </Button>
      </Section>
    </EmailLayout>
  );
}
