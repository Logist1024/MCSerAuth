'use client';

import type { SkinVariant } from '@mcserauth/shared';
import { useRef, useState, type FormEvent } from 'react';

const MAX_TEXTURE_BYTES = 1024 * 1024;

interface TextureUploadFormProps {
  /** Unique input id prefix (e.g. `skin` / `cape`). */
  idPrefix: string;
  fileLabel: string;
  submitLabel: string;
  busyLabel: string;
  /** Optional helper text under the picker. */
  hint?: string;
  /** Accepted MIME list for the OS file picker. */
  accept?: string;
  /** True while this form's upload is in flight. */
  busy?: boolean;
  /** True while any texture upload is in flight. */
  disabled?: boolean;
  /** Shows the classic/slim selector when both props are provided. */
  variant?: SkinVariant;
  onVariantChange?: (variant: SkinVariant) => void;
  /** Resolves true when the upload succeeded so the input can be reset. */
  onSubmit: (file: File) => Promise<boolean>;
}

/**
 * Image picker shared by the skin/cape uploads and the site icon editor.
 * Content validation (dimensions, animation, size) stays on the API; this form
 * only guards against submitting an empty selection.
 */
export default function TextureUploadForm({
  idPrefix,
  fileLabel,
  submitLabel,
  busyLabel,
  hint,
  accept = 'image/png',
  busy = false,
  disabled = false,
  variant,
  onVariantChange,
  onSubmit,
}: TextureUploadFormProps) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const variantSelector =
    variant !== undefined && onVariantChange !== undefined
      ? { value: variant, onChange: onVariantChange }
      : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (file === null) {
      setError(`请选择 ${fileLabel}`);
      return;
    }

    setError(null);
    const uploaded = await onSubmit(file);
    if (uploaded) {
      setFile(null);
      if (input.current !== null) {
        input.current.value = '';
      }
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      {variantSelector !== null ? (
        <div className="field">
          <label htmlFor={`${idPrefix}-variant`}>皮肤模型</label>
          <select
            id={`${idPrefix}-variant`}
            value={variantSelector.value}
            disabled={disabled}
            onChange={(event) => variantSelector.onChange(event.target.value as SkinVariant)}
          >
            <option value="classic">Steve（经典手臂）</option>
            <option value="slim">Alex（纤细手臂）</option>
          </select>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={`${idPrefix}-file`}>{fileLabel}</label>
        <input
          id={`${idPrefix}-file`}
          ref={input}
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={(event) => {
            const picked = event.target.files?.[0] ?? null;
            if (picked !== null && picked.size > MAX_TEXTURE_BYTES) {
              setFile(null);
              setError('文件不能超过 1 MiB');
              event.target.value = '';
              return;
            }
            setFile(picked);
            setError(null);
          }}
        />
        {hint !== undefined ? <span className="field-hint">{hint}</span> : null}
      </div>
      {error !== null ? <p className="bad small">{error}</p> : null}
      <div className="actions">
        <button className="button" type="submit" disabled={busy || disabled}>
          {busy ? busyLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
