export function parseArgs(argv = process.argv.slice(2)) {
  const map = new Map();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const value = argv[i + 1] && !argv[i + 1].startsWith('--')
      ? argv[++i]
      : true;
    map.set(token, value);
  }
  return {
    get(name, fallback = null) {
      return map.has(name) ? map.get(name) : fallback;
    },
    has(name) {
      return map.has(name);
    }
  };
}

export function requireContentId(value) {
  if (!value || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) {
    throw new Error(
      '--content 必须是 2~64 位小写字母/数字/连字符，例如 watering-newbie'
    );
  }
  return value;
}
