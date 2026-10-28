"use client";

import { useState } from "react";
import { Copy, Download, Trash2 } from "lucide-react";
import { Button, DropdownMenu, Field, Input, Modal, Select, Tooltip, useToast } from "@accordiq/ui";

export function InteractiveDemo() {
  const [open, setOpen] = useState(false);
  const { notify } = useToast();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => setOpen(true)}>Open modal</Button>

      <DropdownMenu
        label="Actions"
        items={[
          {
            label: "Copy link",
            icon: Copy,
            onSelect: () => notify({ tone: "success", title: "Link copied" }),
          },
          { label: "Download", icon: Download, href: "#downloads" },
          { label: "Unavailable action", disabled: true },
          {
            label: "Delete",
            icon: Trash2,
            tone: "danger",
            onSelect: () =>
              notify({
                tone: "error",
                title: "Delete failed",
                description: "This is a demo notification. Errors stay until dismissed.",
              }),
          },
        ]}
      />

      <Tooltip content="Tooltips supplement visible labels">
        <Button variant="ghost">Hover or focus me</Button>
      </Tooltip>

      <Button
        variant="secondary"
        onClick={() =>
          notify({
            tone: "info",
            title: "Heads up",
            description: "Toasts are announced politely and dismiss after 6 seconds.",
          })
        }
      >
        Show notification
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Rename contract"
        description="Modals trap focus, close with Escape, and return focus to the trigger."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                notify({ tone: "success", title: "Contract renamed" });
              }}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Contract title" required>
            <Input defaultValue="Master Services Agreement" />
          </Field>
          <Field label="Type">
            <Select defaultValue="msa">
              <option value="msa">Master services agreement</option>
              <option value="nda">Non-disclosure agreement</option>
              <option value="sow">Statement of work</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
