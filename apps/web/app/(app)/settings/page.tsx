import type { Metadata } from "next";
import { Bell, Building2, Shield, User } from "lucide-react";
import { can, publicActor } from "@accordiq/auth";
import { isAppError, parsePage } from "@accordiq/core";
import {
  Alert,
  Badge,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@accordiq/ui";
import { NotificationPreferencesForm } from "../../../components/settings/notification-preferences-form";
import { RiskPolicyForm } from "../../../components/settings/risk-policy-form";
import { TimezoneForm } from "../../../components/settings/timezone-form";
import { CreateRecordForm, PermissionNote } from "../../../components/settings-workspace";
import { requireNavItem } from "../../../lib/navigation";
import { getRuntime } from "../../../lib/runtime";
import { requireActor } from "../../../lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const item = requireNavItem("/settings");
  const actor = await requireActor("/settings");
  const { access, clm } = await getRuntime();
  const view = publicActor(actor);

  let members: Awaited<ReturnType<typeof access.listMembers>> = [];
  let records: Awaited<ReturnType<typeof access.listRecords>> = [];
  let policy: Awaited<ReturnType<typeof clm.getRiskPolicy>> | null = null;
  let rules: Awaited<ReturnType<typeof clm.listRiskRules>>["items"] = [];
  let monitoring: Awaited<ReturnType<typeof clm.getMonitoringSettings>> | null = null;
  let preferences: Awaited<ReturnType<typeof clm.listNotificationPreferences>> = [];
  let emailTestOnly = true;
  let scopeError: string | null = null;
  try {
    members = await access.listMembers(actor);
    records = await access.listRecords(actor);
    policy = await clm.getRiskPolicy(actor);
    rules = (await clm.listRiskRules(actor, parsePage(new URLSearchParams("limit=100")))).items;
    monitoring = await clm.getMonitoringSettings(actor);
    preferences = await clm.listNotificationPreferences(actor);
    const catalog = await clm.listIntegrations(actor);
    emailTestOnly = catalog.items.find((item) => item.kind === "EMAIL")?.testOnly ?? true;
  } catch (error) {
    if (isAppError(error) && (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED")) {
      scopeError = error.message;
    } else {
      throw error;
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1>{item.label}</h1>
      <p className="mt-2 text-ink-muted">{item.description}</p>

      <ul className="mt-6 grid gap-3">
        <li>
          <Card className="flex gap-3">
            <User aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-strong" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-h4">Account</h2>
                <Badge>{view.roleLabel}</Badge>
              </div>
              <p className="mt-1 text-small text-ink">{view.name}</p>
              <p className="text-small text-ink-muted">{view.email}</p>
            </div>
          </Card>
        </li>
        <li>
          <Card className="flex gap-3">
            <Building2 aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-strong" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-h4">Organization</h2>
                <Badge>{view.organizationName ?? "None selected"}</Badge>
              </div>
              <p className="mt-1 text-small text-ink-muted">
                Tenant scope is taken from this session. Changing an id in a URL or request body
                does not change the organization.
              </p>
              {monitoring && (
                <TimezoneForm
                  timezone={monitoring.timezone}
                  today={monitoring.today}
                  canManage={can(actor, "settings:manage")}
                />
              )}
            </div>
          </Card>
        </li>
        <li>
          <Card className="flex gap-3">
            <Bell aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-strong" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-h4">Notifications</h2>
                <Badge>{emailTestOnly ? "In-app · email test only" : "In-app · email"}</Badge>
              </div>
              <p className="mt-1 text-small text-ink-muted">
                Approval reminders, signing updates, obligation reminders, renewal alerts, and
                escalations. Email uses the configured provider. Console mail is not a live
                connection.
              </p>
              {preferences.length > 0 ? (
                <NotificationPreferencesForm
                  preferences={JSON.parse(JSON.stringify(preferences)) as typeof preferences}
                  emailTestOnly={emailTestOnly}
                />
              ) : null}
            </div>
          </Card>
        </li>
      </ul>

      {scopeError ? (
        <Alert className="mt-6" tone="warning" title="Organization required">
          {scopeError}
        </Alert>
      ) : (
        <>
          <section className="mt-8">
            <div className="mb-3 flex items-center gap-2">
              <Shield aria-hidden className="size-4 text-primary-strong" />
              <h2 className="text-h4">Members</h2>
            </div>
            <Table caption="Organization members">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Email</TableHeaderCell>
                  <TableHeaderCell>Role</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.membershipId}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{member.role}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="mt-8">
            <h2 className="text-h4">Workspace records</h2>
            <p className="mt-1 text-small text-ink-muted">
              Sample tenant rows used to prove organization isolation. Later modules will follow the
              same rule.
            </p>
            <PermissionNote actor={view} />
            <CreateRecordForm actor={view} />
            <div className="mt-4">
              <Table caption="Workspace records in the current organization">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Title</TableHeaderCell>
                    <TableHeaderCell>Id</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2}>No records in this organization.</TableCell>
                    </TableRow>
                  ) : (
                    records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.title}</TableCell>
                        <TableCell className="font-mono text-caption">{record.id}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          {policy && (
            <RiskPolicyForm
              canReview={can(actor, "risk:review")}
              initial={JSON.parse(JSON.stringify(policy)) as typeof policy}
              rules={JSON.parse(JSON.stringify(rules)) as typeof rules}
            />
          )}
        </>
      )}
    </div>
  );
}
