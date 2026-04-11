/**
 * ProjectManager — browser-side in-memory implementation.
 *
 * NOTE (上報區): 檔案系統操作需要 server API。
 * 目前用 in-memory Map 實作完整 interface。
 * 換成真實檔案系統時，只需在此替換 _projects Map
 * 為 Fetch 呼叫（例如 POST /api/projects），呼叫端無需改動。
 *
 * 真實 runtime 目錄結構（規格定義，尚未實作）：
 *   runtime/project_{name}/assets/scenes/
 *   runtime/project_{name}/assets/models/
 *   runtime/project_{name}/assets/textures/
 */

export interface ProjectInfo {
  name: string;
  path: string;
}

export class ProjectManager {
  private _projects: Map<string, ProjectInfo> = new Map();

  /**
   * 建立新專案。
   * 若名稱已存在則 throw。
   */
  async createProject(name: string): Promise<void> {
    if (!name || name.trim() === '') {
      throw new Error('Project name cannot be empty');
    }
    const key = name.trim();
    if (this._projects.has(key)) {
      throw new Error(`Project "${key}" already exists`);
    }
    const info: ProjectInfo = {
      name: key,
      path: `runtime/project_${key}`,
    };
    this._projects.set(key, info);
  }

  /**
   * 列出所有已建立的專案名稱。
   * 對應真實 runtime/ 下所有 project_ 開頭的目錄。
   */
  async listProjects(): Promise<string[]> {
    return Array.from(this._projects.keys());
  }

  /**
   * 開啟已存在的專案，回傳 ProjectInfo。
   * 若專案不存在則 throw。
   */
  async openProject(name: string): Promise<ProjectInfo> {
    const info = this._projects.get(name);
    if (!info) {
      throw new Error(`Project "${name}" not found`);
    }
    return { ...info };
  }
}
