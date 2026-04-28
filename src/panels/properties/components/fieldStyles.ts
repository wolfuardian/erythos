/** 共用 style 物件（Properties Variant A · Tint v2） */

/** 父分組欄位列（padding-left: 14px） */
export const fieldRow = {
  display: 'grid',
  'grid-template-columns': '64px 1fr',
  'align-items': 'center',
  padding: '3px 0',
  'padding-left': '14px',
  'column-gap': '6px',
} as const;

/** 子分組欄位列（deep tint 內，padding-left: 28px） */
export const subFieldRow = {
  display: 'grid',
  'grid-template-columns': '64px 1fr',
  'align-items': 'center',
  padding: '3px 0',
  'padding-left': '28px',
  'column-gap': '6px',
} as const;

export const fieldLabel = {
  'font-size': 'var(--font-size-sm)',
  color: 'var(--text-secondary)',
  'font-weight': '400',
} as const;

/**
 * Name 輸入欄基礎樣式（Variant A · Tint v2 DNA）
 * rest/focus 狀態差異由 onFocus/onBlur signal 動態切換。
 * 底線樣式（border-bottom）而非 border-radius 盒。
 */
export const textInputBase = {
  flex: '1',
  background: 'var(--bg-input)',
  border: 'none',
  'border-bottom': '1px solid var(--border-medium)',
  'border-radius': '0',
  color: 'var(--text-primary)',
  'font-size': 'var(--font-size-sm)',
  'font-family': 'var(--font-family)',
  padding: '2px 4px',
  height: '20px',
  outline: 'none',
  width: '100%',
} as const;

/** rest：僅底線，無額外 shadow */
export const textInputRest = {} as const;

/**
 * focus：2px 藍底線 + 1px blue glow
 * 注意：mockup SoT 定義為 accent-blue（非 accent-gold/border-focus）
 */
export const textInputFocus = {
  'border-bottom': '2px solid var(--accent-blue)',
  'padding-bottom': '1px',
  'box-shadow': '0 0 0 1px color-mix(in srgb, var(--accent-blue) 40%, transparent)',
} as const;

export const xyzRow = {
  display: 'grid',
  'grid-template-columns': '1fr 1fr 1fr',
  gap: '4px',
  'margin-top': '2px',
} as const;

/** 父分組 label+field 橫列（padding-left: 14px） */
export const groupLabelRow = {
  display: 'grid',
  'grid-template-columns': '64px 1fr',
  'align-items': 'center',
  'column-gap': '6px',
  padding: '3px 0',
  'padding-left': '14px',
} as const;

/** 子分組 label+field 橫列（deep tint 內，padding-left: 28px） */
export const subGroupLabelRow = {
  display: 'grid',
  'grid-template-columns': '64px 1fr',
  'align-items': 'center',
  'column-gap': '6px',
  padding: '3px 0',
  'padding-left': '28px',
} as const;
