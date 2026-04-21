import type { Component } from 'solid-js';

export interface EditorDef {
  id: string;
  label: string;
  category: 'Scene' | 'Object' | 'App';
  component: Component;
}

export interface Area {
  id: string;          // 穩定 id，目前從 Dockview panel.id 衍生；未來 #465 會改成 UUID
  editorType: string;  // EditorDef['id']
}
