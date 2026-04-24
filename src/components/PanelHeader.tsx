import type { Component, JSX } from 'solid-js';
import { useArea } from '../app/AreaContext';
import { EditorSwitcher } from './EditorSwitcher';
import { editors } from '../app/editors';

export interface PanelHeaderProps {
  title: string;
  actions?: JSX.Element;
}

const PanelHeader: Component<PanelHeaderProps> = (props) => {
  const area = useArea();

  return (
    <div
      data-devid="panel-header"
      style={{
      background: 'var(--bg-header)',
      'border-bottom': '1px solid var(--border-subtle)',
      height: '24px',
      padding: '0 10px',
      'box-sizing': 'border-box',
      color: 'var(--text-muted)',
      'font-size': 'var(--font-size-xs)',
      'text-transform': 'uppercase',
      'letter-spacing': '0.5px',
      'flex-shrink': '0',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'space-between',
      gap: '6px',
    }}>
      <span>{props.title}</span>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
        {props.actions}
        {area && (
          <EditorSwitcher
            editors={editors}
            currentId={area.editorType}
            onSelect={area.setEditorType}
          />
        )}
      </div>
    </div>
  );
};

export { PanelHeader };
