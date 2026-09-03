import { X } from "lucide-react";
import { useModalBehavior } from "./useModalBehavior";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  useModalBehavior(open, onClose);
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="app-dialog compact-dialog confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <header>
          <h2 id="confirm-dialog-title">{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </header>
        <p id="confirm-dialog-message">{message}</p>
        <footer>
          <button autoFocus className="secondary-button" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className={danger ? "danger-button" : "primary-button"}
            type="button"
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
