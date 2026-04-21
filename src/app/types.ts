import type { Component } from 'solid-js';

export interface EditorDef {
  id: string;
  label: string;
  category: 'Scene' | 'Object' | 'App';
  component: Component;
}
