import type { Component, JSX } from 'solid-js';

export interface PanelHeaderProps {
  title: string;
  actions?: JSX.Element;
}

const PanelHeader: Component<PanelHeaderProps> = (props) => {
  return (
    <div style={{
      background: 'var(--bg-header)',
      'border-bottom': '1px solid var(--border-subtle)',
      padding: '6px 10px',
      color: 'var(--text-muted)',
      'font-size': 'var(--font-size-xs)',
      'text-transform': 'uppercase',
      'letter-spacing': '0.5px',
      'flex-shrink': '0',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'space-between',
    }}>
      <span>{props.title}</span>
      {props.actions}
    </div>
  );
};

export { PanelHeader };
