import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * `aria-labelledby` target. Defaults to a generated id linked to the title;
   * pass an explicit value if the title is rendered by the consumer instead.
   */
  labelledById?: string;
}

/**
 * Accessible modal built on the native `<dialog>` element.
 *
 * Why `<dialog>` instead of a custom div + portal:
 *   - The browser provides focus trapping for free (the previously-focused
 *     element is restored on `close()`).
 *   - ESC fires the `cancel` event automatically, so we don't ship our own
 *     keyboard handlers.
 *   - `showModal()` raises the dialog into the top-layer above any stacking
 *     context — no `z-index` arithmetic and no portal required.
 *
 * Backdrop clicks are detected by checking that the click target lives
 * outside the inner panel (clicks on the `::backdrop` bubble up with the
 * `<dialog>` itself as `event.target`). The listener is attached imperatively
 * so the inert attribute / focus management remain owned by the browser.
 */
export function Modal({ open, onClose, title, children, footer, labelledById }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  // Mirror the latest `onClose` into a ref so the effect below doesn't need
  // to re-bind every render when consumers pass a fresh function identity.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const fallbackId = useId();
  const titleId = labelledById ?? `${fallbackId}-title`;

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return undefined;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.modal__panel')) onCloseRef.current();
    };
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    dlg.addEventListener('click', handleClick);
    dlg.addEventListener('cancel', handleCancel);
    return () => {
      dlg.removeEventListener('click', handleClick);
      dlg.removeEventListener('cancel', handleCancel);
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="modal" aria-labelledby={titleId}>
      <div className="modal__panel" role="document">
        <header className="modal__header">
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
