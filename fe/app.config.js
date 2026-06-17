const { execSync } = require('child_process');
const appJson = require('./app.json');

function gitInfo() {
  try {
    const hash     = execSync('git rev-parse --short HEAD',      { encoding: 'utf8' }).trim();
    const fullHash = execSync('git rev-parse HEAD',              { encoding: 'utf8' }).trim();
    const message  = execSync('git log -1 --pretty=format:%s',  { encoding: 'utf8' }).trim();
    const date     = execSync('git log -1 --pretty=format:%ci', { encoding: 'utf8' }).trim();
    const author   = execSync('git log -1 --pretty=format:%an', { encoding: 'utf8' }).trim();
    const branch   = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();

    let dirty = '';
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
      if (status) dirty = '+uncommitted';
    } catch { /* ignore */ }

    return { hash: hash + dirty, fullHash, message, date, author, branch };
  } catch {
    // No git available (Vercel cloud build).
    // Try the pre-generated file uploaded alongside the source.
    try {
      return require('./git-build-info.json');
    } catch { /* file not present */ }

    // Last resort: Vercel system env vars (requires GitHub integration).
    const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
    return {
      hash: sha ? sha.slice(0, 7) : 'unknown',
      fullHash: sha || 'unknown',
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? '',
      date: '',
      author: process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME ?? '',
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? '',
    };
  }
}

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo?.extra,
      buildInfo: gitInfo(),
    },
  },
};
