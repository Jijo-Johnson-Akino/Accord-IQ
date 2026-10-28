import { Alert, Card, EmptyState } from "@accordiq/ui";
import { requireNavItem } from "../lib/navigation";

export function ModulePlaceholder({ href }: { href: string }) {
  const item = requireNavItem(href);

  return (
    <div className="mx-auto max-w-3xl">
      <h1>{item.label}</h1>
      <p className="mt-2 text-ink-muted">{item.description}</p>
      <Alert className="mt-6" tone="info" title="Not connected yet">
        This section is part of the workspace shell. Data and actions will appear here once the
        corresponding backend phase ships. Nothing on this page writes or loads records.
      </Alert>
      <Card className="mt-6 p-0">
        <EmptyState
          icon={item.icon}
          headingLevel="h2"
          title={`No ${item.label.toLowerCase()} yet`}
          description="This empty state is expected. It is not a failed request."
        />
      </Card>
    </div>
  );
}
