import { useId, useState, type FormEvent } from 'react';
import { Modal } from '@/components/Modal';
import { useAddProduct } from './hooks';

interface AddProductProps {
  /** Override the default trigger label. */
  triggerLabel?: string;
  /** Visual variant of the trigger button. */
  triggerVariant?: 'primary' | 'ghost';
}

interface FormState {
  name: string;
  priceUsd: string;
  description: string;
  stock: string;
}

const EMPTY: FormState = { name: '', priceUsd: '', description: '', stock: '' };

export const AddProduct = ({
  triggerLabel = '+ Add product',
  triggerVariant = 'primary',
}: AddProductProps) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const formId = useId();

  const { addProduct, saving, error, reset } = useAddProduct();

  const close = () => {
    setOpen(false);
    setForm(EMPTY);
    reset();
  };

  const set =
    <K extends keyof FormState>(key: K) =>
    (value: string) =>
      setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = form.name.trim();
    const priceCents = Math.round(Number(form.priceUsd) * 100);
    if (!name || !Number.isFinite(priceCents) || priceCents < 0) return;

    try {
      await addProduct({
        name,
        priceCents,
        description: form.description.trim() || undefined,
        stock: form.stock === '' ? undefined : Number(form.stock),
      });
      close();
    } catch {
      // Apollo surfaces the error via the hook's `error` value; keep the modal
      // open so the user can correct and retry.
    }
  };

  return (
    <>
      <button type="button" className={`btn btn--${triggerVariant}`} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Add product"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form={formId} className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save product'}
            </button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} noValidate aria-busy={saving}>
          <label className="field">
            <span>Name *</span>
            <input
              type="text"
              required
              maxLength={120}
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              aria-invalid={Boolean(error)}
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Price (USD) *</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                required
                placeholder="9.99"
                value={form.priceUsd}
                onChange={(e) => set('priceUsd')(e.target.value)}
                aria-invalid={Boolean(error)}
              />
            </label>

            <label className="field">
              <span>Stock</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="0"
                value={form.stock}
                onChange={(e) => set('stock')(e.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span>Description</span>
            <textarea
              rows={3}
              maxLength={500}
              placeholder="Optional. What makes this product great?"
              value={form.description}
              onChange={(e) => set('description')(e.target.value)}
            />
          </label>

          {error && (
            <p className="error" role="alert">
              {error.message}
            </p>
          )}
        </form>
      </Modal>
    </>
  );
};
