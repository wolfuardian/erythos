/** 共用 style 物件（Properties Variant A Tint v2） */

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
  'border-radius': '0',
  color: 'var(--text-primary)',
  'font-weight': '500',
  'font-size': 'var(--font-size-sm)',
  padding: '2px 4px',
  'padding-bottom': '1px',
  height: '20px',
  outline: 'none',
  width: '100%',
} as const;

/** rest 時的底線（佔 2px 高度確保 focus 不跳動） */
export const textInputRest = {
  'border-bottom': '2px solid var(--border-medium)',
  'box-shadow': 'none',
} as const;

/** focus 時的底線 + glow */
export const textInputFocus = {
  'border-bottom': '2px solid var(--accent-blue)',
  'box-shadow': '0 0 0 1px color-mix(in srgb, var(--accent-blue) 40%, transparent)',
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
