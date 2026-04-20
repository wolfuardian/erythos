/** 共用 style 物件（Properties Twilight inset） */

export const fieldRow = {
  display: 'grid',
  'grid-template-columns': '64px 1fr',
  'align-items': 'center',
  padding: '3px 0',
  'padding-left': '14px',
  'column-gap': '6px',
} as const;

export const fieldLabel = {
  'font-size': 'var(--font-size-sm)',
  color: 'var(--text-secondary)',
  'font-weight': '400',
} as const;

/** Name 輸入欄（rest 狀態基礎樣式；focus 由 onFocus/onBlur signal 動態切換） */
export const textInputBase = {
  flex: '1',
  background: 'var(--bg-input)',
  border: 'none',
  'border-radius': '3px',
  color: 'var(--text-primary)',
  'font-weight': '500',
  'font-size': 'var(--font-size-sm)',
  padding: '0 8px',
  height: '22px',
  outline: 'none',
  width: '100%',
  'box-shadow': 'var(--shadow-input-inset)',
} as const;

/** rest：純 inset shadow，無底線 */
export const textInputRest = {
  'box-shadow': 'var(--shadow-input-inset)',
} as const;

/** focus：inset shadow + 1px gold outline ring */
export const textInputFocus = {
  'box-shadow': 'var(--shadow-input-inset), 0 0 0 1px color-mix(in srgb, var(--accent-gold) 50%, transparent)',
} as const;

export const xyzRow = {
  display: 'grid',
  'grid-template-columns': '1fr 1fr 1fr',
  gap: '4px',
  'margin-top': '2px',
} as const;

export const groupLabelRow = {
  display: 'grid',
  'grid-template-columns': '64px 1fr',
  'align-items': 'center',
  'column-gap': '6px',
  padding: '3px 0',
  'padding-left': '14px',
} as const;
