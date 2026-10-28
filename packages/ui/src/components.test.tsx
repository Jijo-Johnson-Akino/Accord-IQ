import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  buttonClasses,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Kbd,
  LoadingState,
  LogoMark,
  Select,
  Skeleton,
  SuccessState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tooltip,
  Wordmark,
} from "./index";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("logo", () => {
  it("exposes an accessible name by default", () => {
    const markup = html(<LogoMark />);
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="AccordIQ"');
  });

  it("is hidden from assistive tech when decorative", () => {
    const markup = html(<LogoMark decorative />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("aria-label");
  });

  it("uses the brand navy tile, and a white tile when reversed", () => {
    expect(html(<LogoMark />)).toContain('fill="#142C4E"');
    expect(html(<LogoMark tone="reversed" />)).toContain('fill="#FFFFFF"');
  });

  it("renders the wordmark as real text", () => {
    expect(html(<Wordmark />)).toContain("Accord<span");
  });
});

describe("button", () => {
  it("is type=button by default so it never submits a form by accident", () => {
    expect(html(<Button>Save</Button>)).toContain('type="button"');
  });

  it("disables itself and sets aria-busy while loading", () => {
    const markup = html(<Button loading>Save</Button>);
    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-busy="true"');
  });

  it("produces link-compatible class names", () => {
    expect(buttonClasses({ variant: "primary", size: "lg" })).toContain("bg-primary");
    expect(buttonClasses({ variant: "danger" })).toContain("bg-error");
  });

  it("keeps white text on filled buttons (regression: merge dropped text color)", () => {
    for (const variant of ["primary", "danger"] as const) {
      const classes = buttonClasses({ variant }).split(" ");
      expect(classes).toContain("text-surface");
      expect(classes).toContain("text-small");
    }
  });

  it("keeps the font size on badges next to their text color", () => {
    const markup = html(<Badge tone="info">Info</Badge>);
    expect(markup).toContain("text-caption");
    expect(markup).toContain("text-primary-strong");
  });
});

describe("form fields", () => {
  it("links label, hint and error to the control", () => {
    const markup = html(
      <Field label="Contract title" hint="Shown in lists" error="Title is required" required>
        <Input />
      </Field>,
    );
    const id = /for="([^"]+)"/.exec(markup)?.[1];
    expect(id).toBeTruthy();
    expect(markup).toContain(`id="${id}"`);
    expect(markup).toContain(`aria-describedby="${id}-hint ${id}-error"`);
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain("required");
  });

  it("omits aria-invalid and aria-describedby when there is nothing to describe", () => {
    const markup = html(
      <Field label="Name">
        <Input />
      </Field>,
    );
    // Match attributes (`name="`), not the `aria-invalid:` Tailwind variant in the class list.
    expect(markup).not.toContain('aria-invalid="');
    expect(markup).not.toContain('aria-describedby="');
  });

  it("renders a native select", () => {
    const markup = html(
      <Field label="Type">
        <Select>
          <option>NDA</option>
        </Select>
      </Field>,
    );
    expect(markup).toContain("<select");
    expect(markup).toContain("<option>NDA</option>");
  });
});

describe("feedback components", () => {
  it("announces errors assertively and other tones politely", () => {
    expect(html(<Alert tone="error">Failed</Alert>)).toContain('role="alert"');
    expect(html(<Alert tone="success">Saved</Alert>)).toContain('role="status"');
  });

  it("gives every state a role or accessible text", () => {
    expect(html(<ErrorState title="Could not load" />)).toContain('role="alert"');
    expect(html(<SuccessState title="Saved" />)).toContain('role="status"');
    expect(html(<EmptyState title="No contracts yet" />)).toContain("No contracts yet");
    expect(html(<LoadingState label="Loading contracts" />)).toContain("Loading contracts");
  });

  it("hides skeletons from assistive tech", () => {
    expect(html(<Skeleton className="h-4" />)).toContain('aria-hidden="true"');
  });

  it("pairs badge color with text, optionally a dot", () => {
    const markup = html(
      <Badge tone="success" dot>
        Active
      </Badge>,
    );
    expect(markup).toContain("Active");
    expect(markup).toContain("bg-success-soft");
  });
});

describe("table", () => {
  const markup = html(
    <Table caption="Recent contracts">
      <TableHead>
        <TableRow>
          <TableHeaderCell>Name</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableCell>MSA</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );

  it("has an accessible caption and a keyboard-scrollable region", () => {
    expect(markup).toContain("<caption");
    expect(markup).toContain('aria-label="Recent contracts"');
    expect(markup).toContain('tabindex="0"');
  });

  it("scopes header cells to columns", () => {
    expect(markup).toContain('scope="col"');
  });
});

describe("tooltip", () => {
  it("describes the trigger with the tooltip content", () => {
    const markup = html(
      <Tooltip content="Copy link">
        <button type="button">Copy</button>
      </Tooltip>,
    );
    const describedBy = /aria-describedby="([^"]+)"/.exec(markup)?.[1];
    expect(describedBy).toBeTruthy();
    expect(markup).toContain(`id="${describedBy}"`);
    expect(markup).toContain('role="tooltip"');
  });
});

describe("icon button", () => {
  it("requires an accessible name and has no visible text of its own", () => {
    const markup = html(
      <IconButton label="Search">
        <span>⌕</span>
      </IconButton>,
    );
    expect(markup).toContain('aria-label="Search"');
    expect(markup).toContain('type="button"');
  });
});

describe("breadcrumbs", () => {
  it("marks the last item as the current page", () => {
    const markup = html(
      <Breadcrumbs items={[{ href: "/dashboard", label: "Overview" }, { label: "Contracts" }]} />,
    );
    expect(markup).toContain('aria-label="Breadcrumb"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('href="/dashboard"');
    expect(markup).toContain("Contracts");
  });
});

describe("kbd", () => {
  it("renders a keyboard hint", () => {
    expect(html(<Kbd>Ctrl K</Kbd>)).toContain("<kbd");
  });
});
