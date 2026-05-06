#!/usr/bin/env node
/**
 * scripts/worktree.mjs — AD worktree lifecycle helper
 *
 * Usage:
 *   node scripts/worktree.mjs create <branch>   Create worktree + new branch from main HEAD
 *   node scripts/worktree.mjs cleanup <branch>  Remove worktree + delete branch
 *   node scripts/worktree.mjs cleanup <branch> --force   Force-remove even with unmerged commits
 *
 * Worktree location: <sibling of main repo>/<repoName>.worktrees/<branchSlug>
 * e.g. feat/script-worktree → C:/z/erythos.worktrees/feat-script-worktree
 *
 * Refs:
 *   - PR #689: Write tool calls must use the printed absolute worktree path — not main repo path
 *   - commit 9f51a94: .gitignore .claude/worktrees/ to prevent staged residue
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path of the main (common) repo regardless of whether
 * this script is invoked from a worktree or the main repo.
 *
 * git rev-parse --show-toplevel returns the *current* worktree path (wrong if
 * called from a worktree).  --git-common-dir always points at the shared .git/
 * data directory, whose parent is the main repo.
 */
function getMainRepoRoot() {
  const commonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim();
  // commonDir is either ".git" (relative, when in main repo) or an absolute path
  const abs = path.isAbsolute(commonDir) ? commonDir : path.resolve(commonDir);
  return path.dirname(abs);
}

/**
 * Convert a branch name to a filesystem-safe slug.
 * feat/script-worktree  →  feat-script-worktree
 */
function branchToSlug(branch) {
  return branch.replaceAll('/', '-');
}

/**
 * Derive the conventional worktree path for a given branch.
 * Sibling convention: <parentOfMainRepo>/<repoName>.worktrees/<slug>
 */
function getWorktreePath(branch) {
  const mainRoot = getMainRepoRoot();
  const repoName = path.basename(mainRoot);
  const parentDir = path.dirname(mainRoot);
  return path.join(parentDir, `${repoName}.worktrees`, branchToSlug(branch));
}

/** Run a command, inherit stdio (so git output is visible), throw on failure. */
function run(cmd, opts = {}) {
  const result = spawnSync(cmd, { shell: true, stdio: 'inherit', ...opts });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/** Run a command silently, return stdout string or null on failure. */
function capture(cmd) {
  const result = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

/**
 * create <branch>
 * - Creates worktree at conventional path
 * - Checks out a new branch from main HEAD
 */
function create(branch) {
  const worktreePath = getWorktreePath(branch);

  if (existsSync(worktreePath)) {
    console.error(`Error: path already exists: ${worktreePath}`);
    process.exit(1);
  }

  console.log(`Creating worktree for branch "${branch}"…`);
  console.log(`  path: ${worktreePath}`);
  run(`git worktree add "${worktreePath}" -b "${branch}" main`);

  console.log('');
  console.log('Worktree ready.');
  console.log('');
  console.log('='.repeat(72));
  console.log(`WORKTREE PATH: ${worktreePath}`);
  console.log('='.repeat(72));
  console.log('');
  console.log('  AD Write tool reminder:');
  console.log(`  All Write/Edit calls MUST use the absolute path above.`);
  console.log(`  Writing to C:/z/erythos/... instead drops files into main repo.`);
  console.log(`  (Lesson: PR #689)`);
  console.log('');
}

/**
 * cleanup <branch> [--force]
 * - Removes worktree (--force flag if requested)
 * - Deletes branch (-d normally, -D with --force)
 * - Warns but does NOT block if there are unmerged commits
 */
function cleanup(branch, force) {
  const worktreePath = getWorktreePath(branch);

  // Check for unmerged commits: commits in branch not in main
  const unpushed = capture(`git rev-list main..${branch} --count`);
  if (unpushed !== null && unpushed !== '0') {
    console.warn(`Warning: branch "${branch}" has ${unpushed} commit(s) not merged into main.`);
    if (!force) {
      console.warn('  Proceeding with cleanup (worktree remove + branch -d).');
      console.warn('  Note: git branch -d will refuse if branch is unmerged.');
      console.warn('  Use --force to bypass (git worktree remove --force + git branch -D).');
    } else {
      console.warn('  --force specified: forcing removal.');
    }
    console.warn('');
  }

  if (existsSync(worktreePath)) {
    console.log(`Removing worktree: ${worktreePath}`);
    if (force) {
      run(`git worktree remove "${worktreePath}" --force`);
    } else {
      run(`git worktree remove "${worktreePath}"`);
    }
  } else {
    console.log(`Worktree path not found (already removed?): ${worktreePath}`);
    // Still try to prune stale entries
    run('git worktree prune');
  }

  // Delete branch
  const branchExists = capture(`git rev-parse --verify "${branch}"`);
  if (branchExists !== null) {
    console.log(`Deleting branch: ${branch}`);
    if (force) {
      run(`git branch -D "${branch}"`);
    } else {
      run(`git branch -d "${branch}"`);
    }
  } else {
    console.log(`Branch "${branch}" not found (already deleted?)`);
  }

  console.log('');
  console.log('Cleanup done.');
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

const [,, subcommand, branch, ...rest] = process.argv;
const force = rest.includes('--force');

if (!subcommand || !branch) {
  console.error('Usage:');
  console.error('  node scripts/worktree.mjs create <branch>');
  console.error('  node scripts/worktree.mjs cleanup <branch> [--force]');
  process.exit(1);
}

switch (subcommand) {
  case 'create':
    create(branch);
    break;
  case 'cleanup':
    cleanup(branch, force);
    break;
  default:
    console.error(`Unknown subcommand: "${subcommand}". Use create or cleanup.`);
    process.exit(1);
}
