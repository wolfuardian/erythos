declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: 'read' | 'readwrite';
    }): Promise<FileSystemDirectoryHandle>;
  }
}

import type { ProjectFile } from './ProjectFile';
import { inferFileType } from './ProjectFile';
import * as ProjectHandleStore from './ProjectHandleStore';

type Listener = () => void;

export class ProjectManager {
  private _handle: FileSystemDirectoryHandle | null = null;
  private _files: ProjectFile[] = [];
  private _listeners = new Set<Listener>();

  get name(): string | null {
    return this._handle?.name ?? null;
  }

  get isOpen(): boolean {
    return this._handle !== null;
  }

  getFiles(): ProjectFile[] {
    return this._files;
  }

  /** Open project: user picks a directory */
  async open(): Promise<void> {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    this._handle = handle;
    await this.scan();
    void ProjectHandleStore.saveHandle(handle);
    this.emit();
  }

  /** Close project */
  close(): void {
    this._handle = null;
    this._files = [];
    void ProjectHandleStore.clearHandle();
    this.emit();
  }

  /** Restore last opened project from IndexedDB */
  async restore(): Promise<boolean> {
    try {
      const handle = await ProjectHandleStore.loadHandle();
      if (!handle) return false;

      const perm = await (handle as any).queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        this._handle = handle;
        await this.scan();
        this.emit();
        return true;
      }

      // Requires user gesture to requestPermission — defer to UI button
      return false;
    } catch {
      return false;
    }
  }

  /** Rescan directory */
  async rescan(): Promise<void> {
    if (!this._handle) return;
    await this.scan();
    this.emit();
  }

  /** Read a file within the project */
  async readFile(path: string): Promise<File> {
    if (!this._handle) throw new Error('No project open');
    const parts = path.split('/');
    let dir = this._handle;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i]);
    }
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
    return fileHandle.getFile();
  }

  /** Write a file within the project (auto-creates subdirectories) */
  async writeFile(path: string, data: string | ArrayBuffer): Promise<void> {
    if (!this._handle) throw new Error('No project open');
    const parts = path.split('/');
    let dir = this._handle;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1], {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  /** Subscribe to projectChanged event */
  onChange(fn: Listener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // -- Private --

  private async scan(): Promise<void> {
    if (!this._handle) return;
    this._files = [];
    await this.scanDir(this._handle, '');
  }

  private async scanDir(
    dir: FileSystemDirectoryHandle,
    prefix: string,
  ): Promise<void> {
    for await (const [name, handle] of (dir as any).entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') {
        await this.scanDir(handle as FileSystemDirectoryHandle, path);
      } else {
        this._files.push({ path, name, type: inferFileType(name) });
      }
    }
  }

  private emit(): void {
    for (const fn of this._listeners) fn();
  }
}
