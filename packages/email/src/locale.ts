export const EMAIL_LOCALES = ["en", "fr", "ar"] as const;
export type EmailLocale = "en" | "fr" | "ar";
export type TransactionalEmailKind = "verification" | "password-reset" | "welcome" | "magic-link";

export interface TransactionalEmailCopy {
  readonly subject: string;
  readonly title: string;
  readonly titleWithName?: string;
  readonly body: string;
  readonly action: string;
  readonly detail: string;
}

const EMAIL_MESSAGES = {
  en: {
    verification: {
      subject: "Verify your email - {appName}",
      title: "Verify your email",
      body: "Thanks for signing up for {appName}. Verify your email address using the secure link below.",
      action: "Verify email",
      detail: "If you did not create an account, you can safely ignore this email.",
    },
    passwordReset: {
      subject: "Reset your password - {appName}",
      title: "Reset your password",
      body: "We received a request to reset your {appName} password.",
      action: "Reset password",
      detail: "This single-use link expires in one hour. Ignore it if you did not request a reset.",
    },
    welcome: {
      subject: "Welcome to {appName}",
      title: "Welcome!",
      titleWithName: "Welcome, {name}!",
      body: "Your {appName} account is ready. You can now sign in, enable two-factor authentication, and manage your workspace.",
      action: "Go to dashboard",
      detail: "For extra security, enable two-factor authentication in Settings.",
    },
    magicLink: {
      subject: "Sign in to {appName}",
      title: "Sign in with a magic link",
      body: "Use the secure link below to sign in to {appName}.",
      action: "Sign in",
      detail: "This single-use link expires in 15 minutes.",
    },
    fallbackLink: "If the button does not work, copy and paste this link:",
  },
  fr: {
    verification: {
      subject: "Vérifiez votre adresse e-mail - {appName}",
      title: "Vérifiez votre adresse e-mail",
      body: "Merci de vous être inscrit sur {appName}. Vérifiez votre adresse e-mail avec le lien sécurisé ci-dessous.",
      action: "Vérifier l’adresse e-mail",
      detail: "Si vous n’avez pas créé de compte, vous pouvez ignorer cet e-mail.",
    },
    passwordReset: {
      subject: "Réinitialisez votre mot de passe - {appName}",
      title: "Réinitialisez votre mot de passe",
      body: "Nous avons reçu une demande de réinitialisation du mot de passe {appName}.",
      action: "Réinitialiser le mot de passe",
      detail:
        "Ce lien à usage unique expire dans une heure. Ignorez-le si vous n’avez rien demandé.",
    },
    welcome: {
      subject: "Bienvenue sur {appName}",
      title: "Bienvenue !",
      titleWithName: "Bienvenue, {name} !",
      body: "Votre compte {appName} est prêt. Vous pouvez vous connecter, activer l’authentification à deux facteurs et gérer votre espace de travail.",
      action: "Ouvrir le tableau de bord",
      detail:
        "Pour renforcer la sécurité, activez l’authentification à deux facteurs dans les paramètres.",
    },
    magicLink: {
      subject: "Connectez-vous à {appName}",
      title: "Connexion avec un lien magique",
      body: "Utilisez le lien sécurisé ci-dessous pour vous connecter à {appName}.",
      action: "Se connecter",
      detail: "Ce lien à usage unique expire dans 15 minutes.",
    },
    fallbackLink: "Si le bouton ne fonctionne pas, copiez et collez ce lien :",
  },
  ar: {
    verification: {
      subject: "تحقق من بريدك الإلكتروني - {appName}",
      title: "تحقق من بريدك الإلكتروني",
      body: "شكرًا لتسجيلك في {appName}. تحقق من عنوان بريدك الإلكتروني باستخدام الرابط الآمن أدناه.",
      action: "التحقق من البريد الإلكتروني",
      detail: "إذا لم تنشئ حسابًا، فيمكنك تجاهل هذه الرسالة بأمان.",
    },
    passwordReset: {
      subject: "إعادة تعيين كلمة المرور - {appName}",
      title: "إعادة تعيين كلمة المرور",
      body: "تلقينا طلبًا لإعادة تعيين كلمة مرور {appName}.",
      action: "إعادة تعيين كلمة المرور",
      detail:
        "تنتهي صلاحية هذا الرابط ذي الاستخدام الواحد خلال ساعة. تجاهله إن لم تطلب إعادة التعيين.",
    },
    welcome: {
      subject: "مرحبًا بك في {appName}",
      title: "مرحبًا بك!",
      titleWithName: "مرحبًا بك، {name}!",
      body: "حسابك في {appName} جاهز. يمكنك الآن تسجيل الدخول وتفعيل المصادقة الثنائية وإدارة مساحة عملك.",
      action: "الانتقال إلى لوحة التحكم",
      detail: "لمزيد من الأمان، فعّل المصادقة الثنائية من الإعدادات.",
    },
    magicLink: {
      subject: "تسجيل الدخول إلى {appName}",
      title: "تسجيل الدخول برابط سحري",
      body: "استخدم الرابط الآمن أدناه لتسجيل الدخول إلى {appName}.",
      action: "تسجيل الدخول",
      detail: "تنتهي صلاحية هذا الرابط ذي الاستخدام الواحد خلال 15 دقيقة.",
    },
    fallbackLink: "إذا لم يعمل الزر، فانسخ هذا الرابط والصقه:",
  },
} as const;

export function normalizeEmailLocale(value: unknown): EmailLocale | null {
  if (typeof value !== "string") return null;
  const language = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return EMAIL_LOCALES.find((locale) => locale === language) ?? null;
}

function localeFromCookie(cookieHeader: string | null): EmailLocale | null {
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== "NEXT_LOCALE") continue;
    try {
      return normalizeEmailLocale(decodeURIComponent(entry.slice(separator + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}

function localeFromAcceptLanguage(header: string | null): EmailLocale | null {
  if (!header) return null;
  const preferences: Array<{ locale: EmailLocale; quality: number; order: number }> = [];
  header.split(",").forEach((entry, order) => {
    const [tag = "", ...parameters] = entry.trim().split(";");
    const locale = normalizeEmailLocale(tag);
    if (!locale) return;
    const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
    const parsedQuality = qualityParameter
      ? Number.parseFloat(qualityParameter.trim().slice(2))
      : 1;
    const quality = Number.isFinite(parsedQuality) ? parsedQuality : 0;
    if (quality > 0) preferences.push({ locale, quality, order });
  });
  preferences.sort((left, right) => right.quality - left.quality || left.order - right.order);
  return preferences[0]?.locale ?? null;
}

export function resolveEmailLocale(headers?: Headers | null): EmailLocale {
  return (
    localeFromCookie(headers?.get("cookie") ?? null) ??
    localeFromAcceptLanguage(headers?.get("accept-language") ?? null) ??
    "en"
  );
}

export function emailDirection(locale: EmailLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

function emailCopyKey(
  kind: TransactionalEmailKind,
): "verification" | "passwordReset" | "welcome" | "magicLink" {
  if (kind === "password-reset") return "passwordReset";
  if (kind === "magic-link") return "magicLink";
  return kind;
}

export function getTransactionalEmailCopy(
  locale: EmailLocale,
  kind: TransactionalEmailKind,
): TransactionalEmailCopy {
  return EMAIL_MESSAGES[locale][emailCopyKey(kind)];
}

export function getTransactionalEmailFallbackLink(locale: EmailLocale): string {
  return EMAIL_MESSAGES[locale].fallbackLink;
}

export function formatTransactionalEmailMessage(
  message: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, key: string) =>
    key in values ? String(values[key]) : placeholder,
  );
}

export function transactionalEmailSubject(
  kind: TransactionalEmailKind,
  locale: EmailLocale,
  appName: string,
): string {
  return formatTransactionalEmailMessage(getTransactionalEmailCopy(locale, kind).subject, {
    appName,
  });
}
