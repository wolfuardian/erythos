#!/usr/bin/env node
/**
 * new-command.mjs — scaffold a Set*PropertyCommand (boilerplate generator)
 *
 * Usage:
 *   node scripts/new-command.mjs <ClassName> <module> <ComponentType>
 *
 * Example:
 *   node scripts/new-command.mjs SetCameraProperty camera CameraComponent
 *
 * Generates: src/core/commands/<ClassName>Command.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const USAGE = `Usage: node scripts/new-command.mjs <ClassName> <module> <ComponentType>
Example: node scripts/new-command.mjs SetCameraProperty camera CameraComponent`;

const [, , className, moduleName, componentType] = process.argv;

if (!className || !moduleName || !componentType) {
  console.error('Error: missing arguments.\n');
  console.error(USAGE);
  process.exit(1);
}

const fileName = `${className}Command.ts`;
const outPath = path.join(REPO_ROOT, 'src', 'core', 'commands', fileName);

if (fs.existsSync(outPath)) {
  console.error(`Error: file already exists: ${outPath}`);
  console.error('Remove it first if you want to regenerate.');
  process.exit(1);
}

const propAlias = `${componentType.replace(/Component$/, '')}Prop`;
const valAlias = `${componentType.replace(/Component$/, '')}Val`;

const content = `import type { ${componentType} } from '../scene/SceneFormat';
import { Command } from '../Command';
import type { Editor } from '../Editor';
import { asNodeUUID } from '../../utils/branded';
import type { NodeUUID } from '../../utils/branded';

type ${propAlias} = keyof ${componentType};
type ${valAlias} = ${componentType}[${propAlias}];

export class ${className}Command extends Command {
  readonly type = '${className}';
  updatable = true;

  private uuid: NodeUUID;
  private prop: ${propAlias};
  private oldValue: ${valAlias};
  private newValue: ${valAlias};

  constructor(editor: Editor, uuid: string, prop: ${propAlias}, newValue: ${valAlias}, oldValue: ${valAlias}) {
    super(editor);
    this.uuid = asNodeUUID(uuid);
    this.prop = prop;
    this.newValue = newValue;
    this.oldValue = oldValue;
  }

  execute(): void {
    const node = this.editor.sceneDocument.getNode(this.uuid);
    if (!node) return;
    const comp = node.components?.${moduleName} as ${componentType} | null;
    if (!comp) return;
    this.editor.sceneDocument.updateNode(this.uuid, {
      components: { ...node.components, ${moduleName}: { ...comp, [this.prop]: this.newValue } },
    });
  }

  undo(): void {
    const node = this.editor.sceneDocument.getNode(this.uuid);
    if (!node) return;
    const comp = node.components?.${moduleName} as ${componentType} | null;
    if (!comp) return;
    this.editor.sceneDocument.updateNode(this.uuid, {
      components: { ...node.components, ${moduleName}: { ...comp, [this.prop]: this.oldValue } },
    });
  }

  canMerge(cmd: Command): boolean {
    return (
      cmd instanceof ${className}Command &&
      cmd.uuid === this.uuid &&
      cmd.prop === this.prop
    );
  }

  update(cmd: Command): void {
    if (cmd instanceof ${className}Command) {
      this.newValue = cmd.newValue;
    }
  }
}
`;

fs.writeFileSync(outPath, content, 'utf-8');
console.log(`Created: ${outPath}`);
