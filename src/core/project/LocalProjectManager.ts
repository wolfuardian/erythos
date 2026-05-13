/**
 * LocalProjectManager — wraps FileSystemDirectoryHandle + ProjectFile logic.
 *
 * Implements the ProjectManager interface for local file system projects (v0.1
 * behaviour, 100% unchanged). All call sites that directly use
 * FileSystemDirectoryHandle must go through this class.
 *
 * G1 refactor: moved from ProjectManager.ts to isolate the FS-handle surface.
 * ESLint rule enforces that FileSystemDirectoryHandle only appears in
 * LocalProject* files and ProjectHandleStore (see eslint.config.js).
 *
 * Spec: docs/cloud-project-spec.md § ProjectManager 抽象 + § Phase G 切分 § G1
 */

declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: 'read' | 'readwrite';
    }): Promise<FileSystemDirectoryHandle>;
  }
}

import { createSignal, type Accessor } from 'solid-js';
import type { AssetPath, BlobURL } from '../../utils/branded';
import { asAssetPath, asBlobURL } from '../../utils/branded';
import type { ProjectFile } from './ProjectFile';
import { inferFileType } from './ProjectFile';
import * as ProjectHandleStore from './ProjectHandleStore';
import type { ProjectEntry, ProjectStatus } from './ProjectHandleStore';
import { generateUUID } from '../../utils/uuid';
import type { ProjectManager, ProjectIdentifier, AssetMeta, SaveResult } from './ProjectManager';
import { SceneDocument } from '../scene/SceneDocument';
import { createEmptyScene } from '../scene/io/types';

type Listener = () => void;
type FileChangedListener = (path: AssetPath, newURL: BlobURL) => void;

export class LocalProjectManager implements ProjectManager {
  /** Satisfies ProjectManager interface — always 'local' for this impl. */
  readonly type = 'local' as const;

  private _handle: FileSystemDirectoryHandle | null = null;
  private _files: ProjectFile[] = [];
  private _listeners = new Set<Listener>();
  private _fileChangedListeners = new Set<FileChangedListener>();
  private _urlCache = new Map<AssetPath, BlobURL>();
  private _currentId: string | null = null;

  private readonly _currentScenePath: Accessor<AssetPath>;
  private readonly _setCurrentScenePath: (path: AssetPath) => void;

  constructor() {
    const [currentScenePath, setCurrentScenePath] = createSignal<AssetPath>(
      asAssetPath('scenes/scene.erythos'),
    );
    this._currentScenePath = currentScenePath;
    this._setCurrentScenePath = setCurrentScenePath;
  }

  // ── ProjectManager interface ────────────────────────────────────────────────

  get identifier(): ProjectIdentifier {
    if (!this._handle) throw new Error('No project open');
    return { kind: 'local', handle: this._handle };
  }

  /**
   * Load the active scene blob from disk.
   * Reads the file at currentScenePath() and deserialises it.
   * Throws if no project is open or the file doesn't exist.
   *
   * Note: for G1 this is a thin wrapper; callers may still use readFile directly
   * during the transition. G2 will route AutoSave through saveScene uniformly.
   */
  async loadScene(): Promise<SceneDocument> {
    const path = this._currentScenePath();
    const file = await this.readFile(path);
    const text = await file.text();
    const doc = new SceneDocument();
    doc.deserialize(JSON.parse(text) as Parameters<typeof doc.deserialize>[0]);
    return doc;
  }

  /**
   * Persist the scene blob to disk.
   * Local projects don't have server-side versioning; `baseVersion` is ignored.
   * Returns `{ ok: true, version: 1 }` on success.
   */
  async saveScene(scene: SceneDocument, _baseVersion: number): Promise<SaveResult> {
    const path = this._currentScenePath();
    try {
      await this.writeFile(path, JSON.stringify(scene.serialize()));
      return { ok: true, version: 1 };
    } catch {
      // FS errors (handle revoked, quota exceeded, etc.) bubble as offline-alike.
      return { ok: false, reason: 'offline' };
    }
  }

  /**
   * List all asset files in the project.
   * Returns the same set as getFiles(), mapped to AssetMeta shape.
   */
  async listAssets(): Promise<AssetMeta[]> {
    return this._files.map(f => ({
      path: f.path,
      name: f.name,
      type: f.type,
    }));
  }

  /**
   * Resolve a project:// URL to a Blob.
   * Strips the 'project://' prefix and reads the file at the resulting path.
   */
  async resolveAsset(url: string): Promise<Blob> {
    const prefix = 'project://';
    const path = url.startsWith(prefix)
      ? asAssetPath(url.slice(prefix.length))
      : asAssetPath(url);
    return this.readFile(path);
  }

  /**
   * Close the project and revoke all cached blob URLs.
   * Implements ProjectManager.close() (async for interface compat; local is sync).
   */
  async close(): Promise<void> {
    this._revokeAllCachedURLs();
    this._handle = null;
    this._files = [];
    this._currentId = null;
    this.emit();
  }

  // ── Local-only API (FileSystemDirectoryHandle surface) ──────────────────────

  /** Reactive accessor for the currently active scene path */
  get currentScenePath(): Accessor<AssetPath> {
    return this._currentScenePath;
  }

  /** Update the currently active scene path */
  setCurrentScenePath(path: AssetPath): void {
    this._setCurrentScenePath(path);
  }

  get name(): string | null {
    return this._handle?.name ?? null;
  }

  get isOpen(): boolean {
    return this._handle !== null;
  }

  /** ID of the currently open project entry (null if no project open) */
  get currentId(): string | null {
    return this._currentId;
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

  /**
   * Show a directory picker for the user to choose a parent folder for a new project.
   * Returns the chosen handle, or null if the user cancelled.
   * Centralises FileSystemDirectoryHandle usage in LocalProject* files (ESLint rule).
   */
  async pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
    try {
      return await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (e: any) {
      if (e.name === 'AbortError') return null;
      throw e;
    }
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

  /** Set active project handle and scan files (shared path for openRecent / addFromDisk) */
  async openHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    this._handle = handle;
    this._files = await this.collectFiles(handle);

    // bump lastOpened for the matching entry and capture currentId
    const entries = await ProjectHandleStore.loadProjects();
    for (const entry of entries) {
      try {
        const same = await (entry.handle as any).isSameEntry(handle);
        if (same) {
          this._currentId = entry.id;
          void ProjectHandleStore.saveProject({ ...entry, lastOpened: Date.now() });
          break;
        }
      } catch { /* ignore */ }
    }

    this.emit();
  }

  /** Open a recent project: request permission and return handle; caller calls onOpenProject → openHandle */
  async openRecent(id: string): Promise<FileSystemDirectoryHandle | null> {
    try {
      const entries = await ProjectHandleStore.loadProjects();
      const entry = entries.find(e => e.id === id);
      if (!entry) return null;
      const perm = await (entry.handle as any).requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return null;
      return entry.handle;
    } catch {
      return null;
    }
  }

  /** Remove a project from the recent list */
  async removeRecent(id: string): Promise<void> {
    await ProjectHandleStore.removeProject(id);
  }

  /**
   * Synchronously close the project without async (legacy path used by App closeProject).
   * Prefer close() for interface compatibility.
   */
  closeSync(): void {
    this._revokeAllCachedURLs();
    this._handle = null;
    this._files = [];
    this._currentId = null;
    this.emit();
  }

  /** Rescan directory */
  async rescan(): Promise<void> {
    if (!this._handle) return;
    this._files = await this.collectFiles(this._handle);
    this.emit();
  }

  /** Read a file within the project */
  async readFile(path: AssetPath): Promise<File> {
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
  async writeFile(path: AssetPath, data: string | ArrayBuffer): Promise<void> {
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

    // If this path was cached, revoke old URL, mint new one, and emit fileChanged
    if (this._urlCache.has(path)) {
      const oldURL = this._urlCache.get(path)!;
      URL.revokeObjectURL(oldURL);
      this._urlCache.delete(path);
      const file = await this.readFile(path);
      const newURL = asBlobURL(URL.createObjectURL(file));
      this._urlCache.set(path, newURL);
      this._emitFileChanged(path, newURL);
    }
  }

  /** Copy an external File into the project's correct folder, auto-suffixing on name clash */
  async importAsset(file: File): Promise<AssetPath> {
    const type = inferFileType(file.name);
    const folder = this.folderForType(type);
    const finalName = await this.findFreeName(folder, file.name);
    const path = asAssetPath(`${folder}/${finalName}`);
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

  /**
   * Create a new empty scene file at scenes/<name>.erythos.
   * Throws if a file with that name already exists.
   * Returns the path on success.
   */
  async createScene(name: string): Promise<AssetPath> {
    if (!this._handle) throw new Error('No project open');
    const filename = `${name}.erythos`;
    const scenesDir = await this._handle.getDirectoryHandle('scenes', { create: true });

    // Check for existing file — throw if already exists
    try {
      await scenesDir.getFileHandle(filename);
      throw new Error(`Scene "${name}" already exists`);
    } catch (e: any) {
      if (e.name !== 'NotFoundError') throw e;
      // NotFoundError means it's free — proceed
    }

    const fileHandle = await scenesDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(createEmptyScene()));
    await writable.close();

    await this.rescan();
    return asAssetPath(`scenes/${filename}`);
  }

  /**
   * Delete a file within the project by path.
   * Rescans after deletion.
   */
  async deleteFile(path: AssetPath): Promise<void> {
    if (!this._handle) throw new Error('No project open');
    const parts = path.split('/');
    let dir = this._handle;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i]);
    }
    await (dir as any).removeEntry(parts[parts.length - 1]);
    await this.rescan();
  }

  /**
   * Return a blob URL for the file at `path`, creating and caching one on first call.
   * Subsequent calls with the same path return the same URL (within the session).
   * Throws if no project is open or the file doesn't exist.
   * All cached URLs are revoked when the project is closed.
   */
  async urlFor(path: AssetPath): Promise<BlobURL> {
    if (!this._handle) throw new Error('No project open');
    const cached = this._urlCache.get(path);
    if (cached !== undefined) return cached;
    const file = await this.readFile(path);
    const url = asBlobURL(URL.createObjectURL(file));
    this._urlCache.set(path, url);
    return url;
  }

  /** Subscribe to fileChanged event (fires when a cached file is updated via writeFile) */
  onFileChanged(fn: FileChangedListener): () => void {
    this._fileChangedListeners.add(fn);
    return () => this._fileChangedListeners.delete(fn);
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
      const rawPath = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') {
        await this.scanDir(handle as FileSystemDirectoryHandle, rawPath, files);
      } else {
        // Mint at the FS read boundary: rawPath is a plain string assembled from dir entry names
        files.push({ path: asAssetPath(rawPath), name, type: inferFileType(name) });
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

  private _emitFileChanged(path: AssetPath, newURL: BlobURL): void {
    for (const fn of this._fileChangedListeners) fn(path, newURL);
  }

  private _revokeAllCachedURLs(): void {
    for (const url of this._urlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this._urlCache.clear();
  }
}
