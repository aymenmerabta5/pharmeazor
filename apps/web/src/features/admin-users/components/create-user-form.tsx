"use client";

import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import type { useCreateAdminUser } from "../use-create-admin-user";

export type CreateUserFormProps = ReturnType<typeof useCreateAdminUser>;

export function CreateUserForm({
  error,
  pending,
  form,
  translate,
}: CreateUserFormProps): React.JSX.Element {
  const roleOptions = [
    { label: translate("roles.user"), value: "user" },
    { label: translate("roles.admin"), value: "admin" },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{translate("create.cardTitle")}</CardTitle>
        <CardDescription className="max-w-[65ch]">
          {translate("create.cardDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>{translate("create.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <form.AppForm>
          <Form form={form} className="flex flex-col gap-6">
            <FieldGroup>
              <form.AppField name="name">
                {(field) => (
                  <field.TextField
                    label={translate("create.nameLabel")}
                    description={translate("create.nameDescription")}
                    placeholder={translate("create.namePlaceholder")}
                    autoComplete="name"
                    disabled={pending}
                  />
                )}
              </form.AppField>
              <form.AppField name="email">
                {(field) => (
                  <field.TextField
                    type="email"
                    label={translate("create.emailLabel")}
                    description={translate("create.emailDescription")}
                    placeholder={translate("create.emailPlaceholder")}
                    autoComplete="email"
                    disabled={pending}
                  />
                )}
              </form.AppField>
              <form.AppField name="password">
                {(field) => (
                  <field.PasswordField
                    label={translate("create.passwordLabel")}
                    description={translate("create.passwordDescription")}
                    autoComplete="new-password"
                    disabled={pending}
                  />
                )}
              </form.AppField>
              <form.AppField name="role">
                {(field) => (
                  <field.SelectField
                    label={translate("create.roleLabel")}
                    description={translate("create.roleDescription")}
                    options={roleOptions}
                    disabled={pending}
                  />
                )}
              </form.AppField>
            </FieldGroup>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <span className="sr-only" role="status" aria-live="polite">
                  {isSubmitting ? translate("create.creating") : ""}
                </span>
              )}
            </form.Subscribe>
            <form.SubmitButton
              className="w-auto self-start"
              pendingLabel={translate("create.creatingPending")}
            >
              {translate("create.submit")}
            </form.SubmitButton>
          </Form>
        </form.AppForm>
      </CardContent>
    </Card>
  );
}
