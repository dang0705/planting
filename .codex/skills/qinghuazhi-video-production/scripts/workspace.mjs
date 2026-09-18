import {
  resolve,
  isAbsolute
} from 'node:path';
import {
  fileURLToPath
} from 'node:url';

export const DEFAULT_VIDEO_WORKSPACE =
  'qinghuazhi-video-workspace';

export const SKILL_ROOT =
  fileURLToPath(
    new URL('..', import.meta.url)
  );

export function hostProjectRoot() {
  const configured =
    String(
      process.env.QINGHUAZHI_VIDEO_HOST_ROOT ??
      ''
    ).trim();

  if (configured) {
    return isAbsolute(configured)
      ? resolve(configured)
      : resolve(process.cwd(), configured);
  }

  // <host>/.agents/skills/qinghuazhi-video-production
  return resolve(
    SKILL_ROOT,
    '../../..'
  );
}

export function videoWorkspaceRoot() {
  const configured =
    String(
      process.env.QINGHUAZHI_VIDEO_WORKSPACE ??
      DEFAULT_VIDEO_WORKSPACE
    ).trim();

  if (!configured) {
    throw new Error(
      'QINGHUAZHI_VIDEO_WORKSPACE 不能为空'
    );
  }

  return isAbsolute(configured)
    ? resolve(configured)
    : resolve(
        hostProjectRoot(),
        configured
      );
}

export function workspacePath(...parts) {
  return resolve(
    videoWorkspaceRoot(),
    ...parts
  );
}

export function hostPath(...parts) {
  return resolve(
    hostProjectRoot(),
    ...parts
  );
}

export function resolveWorkspaceRelative(path) {
  if (!path) {
    throw new Error(
      '缺少 workspace-relative path'
    );
  }

  if (isAbsolute(path)) {
    return resolve(path);
  }

  return workspacePath(
    String(path).replace(/^\.?\//, '')
  );
}
