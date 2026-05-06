import type { Component } from 'solid-js';

interface FolderIconProps {
  open?: boolean;
  size?: number;
}

export const FolderIcon: Component<FolderIconProps> = (props) => {
  const s = () => props.size ?? 14;
  return (
    <svg width={s()} height={s()} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" stroke-width="1.1"
      stroke-linecap="round" stroke-linejoin="round">
      {props.open ? (
        <>
          <path d="M2 5h4l1.5 1.5h6.5v1.5H2.5z"/>
          <path d="M2.5 8h11l-1.5 4H1z"/>
        </>
      ) : (
        <path d="M2 5h4l1.5 1.5H14V12H2z"/>
      )}
    </svg>
  );
};
