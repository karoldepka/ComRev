const { execSync } = require('child_process');
const appJson = require('./app.json');

function gitInfo() {
  try {
    const hash    = execSync('git rev-parse --short HEAD',               { encoding: 'utf8' }).trim();
    const fullHash = execSync('git rev-parse HEAD',                      { encoding: 'utf8' }).trim();
    const message = execSync('git log -1 --pretty=format:%s',           { encoding: 'utf8' }).trim();
    const date    = execSync('git log -1 --pretty=format:%ci',          { encoding: 'utf8' }).trim();
    const author  = execSync('git log -1 --pretty=format:%an',          { encoding: 'utf8' }).trim();
    const branch  = execSync('git rev-parse --abbrev-ref HEAD',         { encoding: 'utf8' }).trim();
    return { hash, fullHash, message, date, author, branch };
  } catch {
    return { hash: 'unknown', fullHash: 'unknown', message: '', date: '', author: '', branch: '' };
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
