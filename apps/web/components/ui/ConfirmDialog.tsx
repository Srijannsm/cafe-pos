"use client";

import { Modal } from "./Modal";
import { Button } from "./Button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirm/cancel pattern on top of Modal, for any destructive action
 * (delete a modifier, deactivate staff, void an order, ...) that
 * currently fires immediately with no "are you sure?" step.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      {description && <p className="body-md mb-6 text-ink-secondary">{description}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
