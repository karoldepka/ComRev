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
    // Vercel build servers have no git repo — fall back to Vercel system env vars.
    // These are populated when the Vercel project is connected to a Git provider.
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
