const ALIASES = new Map([
  ['douyin', 'douyin'],
  ['dy', 'douyin'],
  ['抖音', 'douyin'],
  ['xiaohongshu', 'xiaohongshu'],
  ['xhs', 'xiaohongshu'],
  ['小红书', 'xiaohongshu'],
  ['wechat_channels', 'wechat_channels'],
  ['wechat-channels', 'wechat_channels'],
  ['channels', 'wechat_channels'],
  ['视频号', 'wechat_channels'],
  ['微信视频号', 'wechat_channels']
]);

export const DEFAULT_PLATFORMS = [
  'douyin',
  'xiaohongshu',
  'wechat_channels'
];

export function parsePlatforms(value) {
  if (!value) return [...DEFAULT_PLATFORMS];

  const result = [];

  for (const raw of String(value).split(',')) {
    const token = raw.trim();
    if (!token) continue;

    const mapped = ALIASES.get(token.toLowerCase()) ?? ALIASES.get(token);
    if (!mapped) {
      throw new Error(`未知平台：${token}。支持：抖音 / 小红书 / 视频号`);
    }
    if (!result.includes(mapped)) result.push(mapped);
  }

  if (!result.length) throw new Error('--platforms 不能为空');
  return result;
}
