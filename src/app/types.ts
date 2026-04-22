import type { Component } from 'solid-js';

export interface EditorDef {
  id: string;
  label: string;
  category: 'Scene' | 'Object' | 'App';
  component: Component;
}

export interface Area {
  id: string;          // 穩定 id（UUID），#465 追蹤
  editorType: string;  // EditorDef['id']
}
