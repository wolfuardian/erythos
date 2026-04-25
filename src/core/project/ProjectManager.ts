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
import type { ProjectEntry, ProjectStatus } from './ProjectHandleStore';
import { generateUUID } from '../../utils/uuid';

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

  /** Get recent projects list from IndexedDB */
  async getRecentProjects(): Promise<ProjectEntry[]> {
    return ProjectHandleStore.loadProjects();
  }

  /** Create a new project: create directory + standard subfolders + open */
  async createProject(name: string, parentHandle: FileSystemDirectoryHandle): Promise<void> {
    const projectHandle = await parentHandle.getDirectoryHandle(name, { create: true });

    await projectHandle.getDirectoryHandle('scenes',   { create: true });
    await projectHandle.getDirectoryHandle('models',   { create: true });
    await projectHandle.getDirectoryHandle('textures', { create: true });
    await projectHandle.getDirectoryHandle('hdris',    { create: true });
    await projectHandle.getDirectoryHandle('prefabs',  { create: true });
    await projectHandle.getDirectoryHandle('other',    { create: true });

    const files = await this.collectFiles(projectHandle);
    const status = this.computeStatus(files);
    const id = await this.dedup(projectHandle);

    void ProjectHandleStore.saveProject({
      id,
      name: projectHandle.name,
      handle: projectHandle,
      lastOpened: Date.now(),
      status,
    });
    this.emit();
  }

  /** Add existing directory to list without opening */
  async addFromDisk(): Promise<void> {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });

    const files = await this.collectFiles(handle);
    const status = this.computeStatus(files);
    const id = await this.dedup(handle);

    void ProjectHandleStore.saveProject({
      id,
      name: handle.name,
      handle,
      lastOpened: Date.now(),
      status,
    });
    this.emit();
  }

  /** Open a recent project from stored handle */
  async openRecent(id: string): Promise<boolean> {
    try {
      const entries = await ProjectHandleStore.loadProjects();
      const entry = entries.find(e => e.id === id);
      if (!entry) return false;

      const perm = await (entry.handle as any).requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;

      this._handle = entry.handle;
      this._files = await this.collectFiles(entry.handle);

      const status = this.computeStatus(this._files);
      void ProjectHandleStore.saveProject({ ...entry, lastOpened: Date.now(), status });
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  /** Remove a project from the recent list */
  async removeRecent(id: string): Promise<void> {
    await ProjectHandleStore.removeProject(id);
  }

  /** Close project (does not remove from recent list) */
  close(): void {
    this._handle = null;
    this._files = [];
    this.emit();
  }

  /** Rescan directory */
  async rescan(): Promise<void> {
    if (!this._handle) return;
    this._files = await this.collectFiles(this._handle);
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
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  /** Copy an external File into the project's correct folder, auto-suffixing on name clash */
  async importAsset(file: File): Promise<string> {
    const type = inferFileType(file.name);
    const folder = this.folderForType(type);
    const finalName = await this.findFreeName(folder, file.name);
    const path = `${folder}/${finalName}`;
    const buffer = await file.arrayBuffer();
    await this.writeFile(path, buffer);
    await this.rescan();
    return path;
  }

  private folderForType(type: ProjectFile['type']): string {
    switch (type) {
      case 'scene':   return 'scenes';
      case 'glb':     return 'models';
      case 'texture': return 'textures';
      case 'hdr':     return 'hdris';
      case 'prefab':  return 'prefabs';
      default:        return 'other';
    }
  }

  private async findFreeName(folder: string, baseName: string): Promise<string> {
    const lastDot = baseName.lastIndexOf('.');
    const stem = lastDot >= 0 ? baseName.slice(0, lastDot) : baseName;
    const ext  = lastDot >= 0 ? baseName.slice(lastDot)    : '';

    const exists = async (name: string): Promise<boolean> => {
      if (!this._handle) return false;
      try {
        const dir = await this._handle.getDirectoryHandle(folder);
        await dir.getFileHandle(name);
        return true;
      } catch (e: any) {
        if (e.name === 'NotFoundError') return false;
        throw e; // 非 NotFound 的錯誤往上拋
      }
    };

    if (!(await exists(baseName))) return baseName;
    for (let i = 1; i <= 9999; i++) {
      const candidate = `${stem} (${i})${ext}`;
      if (!(await exists(candidate))) return candidate;
    }
    throw new Error(`Cannot find a free name for ${baseName} in ${folder}`);
  }

  /** Subscribe to projectChanged event */
  onChange(fn: Listener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // -- Private --

  private async collectFiles(handle: FileSystemDirectoryHandle): Promise<ProjectFile[]> {
    const files: ProjectFile[] = [];
    await this.scanDir(handle, '', files);
    return files;
  }

  private async scanDir(dir: FileSystemDirectoryHandle, prefix: string, files: ProjectFile[]): Promise<void> {
    for await (const [name, handle] of (dir as any).entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') {
        await this.scanDir(handle as FileSystemDirectoryHandle, path, files);
      } else {
        files.push({ path, name, type: inferFileType(name) });
      }
    }
  }

  private computeStatus(files: ProjectFile[]): ProjectStatus {
    return {
      hasScenes: files.some(f => f.path.startsWith('scenes/') && f.type === 'scene'),
      hasStructure: files.some(f =>
        f.path.startsWith('scenes/') || f.path.startsWith('models/') || f.path.startsWith('textures/'),
      ),
      hasErrorLog: files.some(f => f.name === 'error_log'),
    };
  }

  private async dedup(handle: FileSystemDirectoryHandle): Promise<string> {
    const existing = await ProjectHandleStore.loadProjects();
    for (const entry of existing) {
      try {
        if (await (handle as any).isSameEntry(entry.handle)) {
          return entry.id;
        }
      } catch { /* ignore */ }
    }
    return generateUUID();
  }

  private emit(): void {
    for (const fn of this._listeners) fn();
  }
}
