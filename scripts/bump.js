// Usage: node scripts/bump.js [major|minor|patch]
import { readFileSync, writeFileSync, existsSync } from 'fs';

const part = process.argv[2] || 'patch';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);

switch (part) {
  case 'major': pkg.version = `${major + 1}.0.0`; break;
  case 'minor': pkg.version = `${major}.${minor + 1}.0`; break;
  case 'patch': pkg.version = `${major}.${minor}.${patch + 1}`; break;
  default: console.error(`Unknown part: ${part}`); process.exit(1);
}

writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

// Also update package-lock.json
if (existsSync('package-lock.json')) {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  lock.version = pkg.version;
  if (lock.packages?.['']) lock.packages[''].version = pkg.version;
  writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
}

// For minor/major: create marker so pre-commit hook skips patch increment
if (part !== 'patch') {
  writeFileSync('.version-bumped', '');
}

console.log(pkg.version);
