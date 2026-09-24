import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  capProgressByStatus,
  isHeartbeatFresh,
  summarizeModulesProgress,
  summarizeTicketProgress
} from './progress.mjs';
import { applyVerifiedClickUpSnapshot } from './clickup-status-sync.mjs';

const trackerDirectory = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH_ARGUMENT_INDEX = 1;

/** 按 heartbeat 内容识别 ClickUp keeper；优先现用代理名，旧名只作兼容回退。 */
export function selectClickUpKeeperHeartbeat(heartbeats = []) {
  const currentHeartbeat = heartbeats.find(
    (heartbeat) => heartbeat.agent === 'clickup_status_keeper_gpt6'
  );
  if (currentHeartbeat) return currentHeartbeat;

  return heartbeats.find(
    (heartbeat) => heartbeat.agent?.startsWith('clickup_status_keeper_luna')
  );
}

const scriptPathArgument = process.argv[SCRIPT_PATH_ARGUMENT_INDEX];
const isDirectInvocation = scriptPathArgument
  ? path.resolve(scriptPathArgument) === fileURLToPath(import.meta.url)
  : false;

const statusPath = path.join(trackerDirectory, 'module-status.json');
const heartbeatDirectory = path.join(trackerDirectory, 'heartbeats');
const staleAfterMs = 35 * 60 * 1000;

const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
const now = new Date();
const heartbeatFiles = fs.existsSync(heartbeatDirectory)
  ? fs.readdirSync(heartbeatDirectory).filter((name) => name.endsWith('.json')).sort()
  : [];

const heartbeats = heartbeatFiles.map((name) => {
  const heartbeat = JSON.parse(fs.readFileSync(path.join(heartbeatDirectory, name), 'utf8'));
  const isFresh = isHeartbeatFresh(heartbeat.status, heartbeat.updatedAt, now.getTime(), staleAfterMs);
  return { ...heartbeat, isFresh };
});

const heartbeatByTicket = new Map(heartbeats.map((heartbeat) => [heartbeat.ticketId, heartbeat]));
const agentRegistry = [];

const knownTicketIds = new Set(
  (status.modules ?? []).flatMap((module) => (module.tickets ?? []).map((ticket) => ticket.id))
);
const clickUpKeeperHeartbeat = selectClickUpKeeperHeartbeat(heartbeats);
const verifiedClickUpSnapshot = applyVerifiedClickUpSnapshot(status, clickUpKeeperHeartbeat, knownTicketIds);
Object.assign(status, verifiedClickUpSnapshot);
if (!Object.hasOwn(verifiedClickUpSnapshot, 'clickUpSyncError')) {
  delete status.clickUpSyncError;
}

function hasProgress(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function inferModel(agentName) {
  if (agentName.endsWith('_terra')) return 'gpt-5.6-terra / medium';
  if (agentName.endsWith('_luna')) return 'gpt-6-luna / max';
  return '以运行时代理清单为准';
}

for (const module of status.modules ?? []) {
  for (const ticket of module.tickets ?? []) {
    const heartbeat = heartbeatByTicket.get(ticket.id);
    if (!heartbeat) continue;

    const oldProgress = hasProgress(ticket.progress) ? Number(ticket.progress) : null;
    const reportedProgress = hasProgress(heartbeat.progress) ? Number(heartbeat.progress) : null;
    // 代理重启不能让已有审计进度归零。只有显式声明 allowRegression 才允许证据驱动的降级。
    const mergedProgress = heartbeat.allowRegression
      ? reportedProgress
      : Math.max(oldProgress ?? 0, reportedProgress ?? 0);
    ticket.progress = capProgressByStatus(heartbeat.status, mergedProgress);
    ticket.agent = heartbeat.agent;
    ticket.status = heartbeat.isFresh
      ? `${heartbeat.status}：${heartbeat.summary}`
      : `心跳超时：${heartbeat.summary}`;
    ticket.lastUpdatedAt = heartbeat.updatedAt;

    agentRegistry.push({
      name: heartbeat.agent,
      path: `/root/${heartbeat.agent}`,
      model: heartbeat.model ?? inferModel(heartbeat.agent),
      status: heartbeat.isFresh ? heartbeat.status : 'heartbeat_stale',
      ticketIds: [heartbeat.ticketId],
      lastObservedAt: heartbeat.updatedAt,
      blockers: heartbeat.blockers ?? []
    });
  }

  const moduleProgress = summarizeTicketProgress(module.tickets ?? []);
  module.progress = moduleProgress.progress;
  module.reportedTicketCount = moduleProgress.reported;
  module.totalTicketCount = moduleProgress.total;
  const reportedTickets = (module.tickets ?? []).filter((ticket) => hasProgress(ticket.progress));
  if (reportedTickets.length > 0) {
    module.lastUpdatedAt = reportedTickets
      .map((ticket) => ticket.lastUpdatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? module.lastUpdatedAt;
  }

  const activeAgents = [...new Set((module.tickets ?? [])
    .map((ticket) => heartbeatByTicket.get(ticket.id))
    .filter((heartbeat) => heartbeat?.isFresh)
    .map((heartbeat) => heartbeat.agent))];
  module.agent = activeAgents.length > 0 ? activeAgents.join('、') : null;

  const currentPhaseHeartbeats = (module.tickets ?? [])
    .map((ticket) => heartbeatByTicket.get(ticket.id))
    .filter(Boolean);
  if (currentPhaseHeartbeats.length > 0 && currentPhaseHeartbeats.every((heartbeat) => heartbeat.status === 'done')) {
    module.status = '当前执行阶段已完成；后续阶段任务尚未启动';
  } else if (currentPhaseHeartbeats.some((heartbeat) => heartbeat.status === 'in_progress')) {
    module.status = '当前执行阶段进行中';
  }
}

status.generatedAt = now.toISOString();
status.overallProgress = summarizeModulesProgress(status.modules ?? []);
status.snapshotSource = 'docs/backend-v2/tracker/heartbeats/*.json（主代理汇总）';
status.trackerOwner = '主代理 /root（各 ticket 子代理写独立心跳；主代理校验、汇总并处理超时）';
status.agentRegistry = agentRegistry;

if (isDirectInvocation) {
  fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
  console.log(`已汇总 ${heartbeats.length} 个 ticket 心跳到 ${path.relative(process.cwd(), statusPath)}`);
}
