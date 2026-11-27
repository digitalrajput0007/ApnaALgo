import React, { useEffect, useState } from 'react';

export interface NumericInputProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  allowDecimal?: boolean;
  decimals?: number;
  disabled?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  title?: string;
  className?: string;
  showRangeHint?: boolean;
}

function sanitizeDraft(raw: string, allowDecimal: boolean): string {
  const normalized = raw.replace(/,/g, '.');
  if (!allowDecimal) {
    return normalized.replace(/[^\d]/g, '');
  }
  let seenDot = false;
  let out = '';
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch >= '0' && ch <= '9') {
      out += ch;
    } else if (ch === '.' && !seenDot) {
      seenDot = true;
      out += ch;
    }
  }
  return out;
}

function formatCommitted(
  n: number,
  allowDecimal: boolean,
  decimals?: number
): number {
  if (!allowDecimal) return Math.round(n);
  if (typeof decimals === 'number' && decimals >= 0) {
    const factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
  }
  return Math.round(n * 10000) / 10000;
}

/**
 * Mobile-friendly editable numeric field.
 * Uses type="text" + inputMode="numeric|decimal" so mobile keyboards allow
 * backspacing, clearing, and typing multi-digit custom values freely without
 * fighting keystrokes. Enforces min/max bounds cleanly on blur or Enter, while
 * committing immediately whenever the typed value is valid within bounds.
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  min,
  max,
  allowDecimal = false,
  decimals,
  disabled = false,
  id,
  name,
  placeholder,
  ariaLabel,
  title,
  className = '',
  showRangeHint = true,
}) => {
  const [draft, setDraft] = useState<string>(() =>
    Number.isFinite(value) ? String(value) : ''
  );
  const [focused, setFocused] = useState(false);

  // Sync external updates (presets, reset defaults, symbol switches) only when not actively editing
  useEffect(() => {
    if (!focused) {
      setDraft(Number.isFinite(value) ? String(value) : '');
    }
  }, [value, focused]);

  const parsedCurrent =
    draft === '' || draft === '.'
      ? Number.NaN
      : allowDecimal
      ? parseFloat(draft)
      : parseInt(draft, 10);

  const isOutOfBounds =
    focused &&
    draft !== '' &&
    draft !== '.' &&
    Number.isFinite(parsedCurrent) &&
    ((min !== undefined && parsedCurrent < min) ||
      (max !== undefined && parsedCurrent > max));

  const commitDraft = () => {
    setFocused(false);
    const trimmed = draft.trim();
    if (trimmed === '' || trimmed === '.') {
      setDraft(Number.isFinite(value) ? String(value) : '');
      return;
    }
    const rawNum = allowDecimal ? parseFloat(trimmed) : parseInt(trimmed, 10);
    if (!Number.isFinite(rawNum)) {
      setDraft(Number.isFinite(value) ? String(value) : '');
      return;
    }
    let clamped = rawNum;
    if (min !== undefined && clamped < min) clamped = min;
    if (max !== undefined && clamped > max) clamped = max;
    const finalVal = formatCommitted(clamped, allowDecimal, decimals);
    setDraft(String(finalVal));
    if (finalVal !== value) {
      onChange(finalVal);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = sanitizeDraft(e.target.value, allowDecimal);
    setDraft(cleaned);

    if (cleaned === '' || cleaned === '.' || cleaned.endsWith('.')) {
      return;
    }

    const parsed = allowDecimal ? parseFloat(cleaned) : parseInt(cleaned, 10);
    if (!Number.isFinite(parsed)) return;

    const withinMin = min === undefined || parsed >= min;
    const withinMax = max === undefined || parsed <= max;
    if (withinMin && withinMax) {
      const committed = formatCommitted(parsed, allowDecimal, decimals);
      if (committed !== value) {
        onChange(committed);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitDraft();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setFocused(false);
      setDraft(Number.isFinite(value) ? String(value) : '');
      e.currentTarget.blur();
    }
  };

  const rangeLabel =
    min !== undefined && max !== undefined
      ? `${min}–${max}`
      : min !== undefined
      ? `≥ ${min}`
      : max !== undefined
      ? `≤ ${max}`
      : null;

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type="text"
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
        pattern={allowDecimal ? '[0-9]*[.]?[0-9]*' : '[0-9]*'}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={isOutOfBounds || undefined}
        title={title}
        onFocus={() => setFocused(true)}
        onChange={handleChange}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        className={`${className}${
          isOutOfBounds
            ? ' !border-amber-500 dark:!border-amber-400 !ring-2 !ring-amber-500/25'
            : ''
        }`}
      />
      {showRangeHint && isOutOfBounds && rangeLabel && (
        <span className="mt-0.5 block text-[10px] font-mono tabular-nums text-amber-600 dark:text-amber-400">
          Allowed: {rangeLabel}
        </span>
      )}
    </div>
  );
};
