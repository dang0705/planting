-- 第九批 cloud1 diagnosis_sessions 迁移脚本 v1
-- 说明：
-- 1. 目标环境：当前唯一 CloudBase 环境 cloud1-2grufevs395a9d5e（alias=cloud1）
-- 2. 目标：把旧版 diagnosis_sessions 扩展到 diagnose-http 当前代码所依赖的轻量新版会话结构
-- 3. 本脚本当前仅落档，不自动执行
-- 4. 当前脚本按“现网仍是旧 schema”前提编写，适合首次迁移，不适合重复执行

ALTER TABLE diagnosis_sessions
  ADD COLUMN session_id VARCHAR(64) NULL COMMENT '新版会话ID' AFTER diagnosis_id,
  ADD COLUMN current_plant_identity_id VARCHAR(64) NULL COMMENT '当前主身份对象ID' AFTER plant_id,
  ADD COLUMN current_identity_resolution_status VARCHAR(64) NULL COMMENT '当前身份解析状态' AFTER current_plant_identity_id,
  ADD COLUMN current_route_primary_action VARCHAR(64) NULL COMMENT '当前主路由动作' AFTER current_identity_resolution_status,
  ADD COLUMN current_round_id VARCHAR(64) NULL COMMENT '当前轮次ID' AFTER current_route_primary_action,
  ADD COLUMN current_round_index TINYINT NOT NULL DEFAULT 0 COMMENT '当前轮次序号' AFTER current_round_id,
  ADD COLUMN latest_visual_call_batch_id VARCHAR(64) NULL COMMENT '最近视觉批次ID' AFTER current_round_index,
  ADD COLUMN outcome_type VARCHAR(64) NULL COMMENT '最终结论类型' AFTER latest_visual_call_batch_id,
  ADD COLUMN outcome_payload_json JSON NULL COMMENT '最终结论快照JSON' AFTER outcome_type,
  ADD COLUMN stop_reason VARCHAR(128) NULL COMMENT '停止原因' AFTER outcome_payload_json,
  ADD COLUMN session_status VARCHAR(64) NULL COMMENT '会话状态' AFTER stop_reason,
  ADD COLUMN runtime_snapshot_json JSON NULL COMMENT '运行时快照JSON' AFTER session_status,
  ADD COLUMN ended_at DATETIME NULL COMMENT '会话结束时间' AFTER runtime_snapshot_json;

UPDATE diagnosis_sessions
SET
  session_id = COALESCE(session_id, diagnosis_id),
  current_round_index = COALESCE(NULLIF(current_round_index, 0), follow_up_round, 0),
  outcome_type = CASE
    WHEN outcome_type IS NOT NULL THEN outcome_type
    WHEN final_problem_key IS NOT NULL THEN 'problematic'
    ELSE outcome_type
  END,
  session_status = CASE
    WHEN session_status IS NOT NULL THEN session_status
    WHEN final_problem_key IS NOT NULL THEN 'completed'
    WHEN needs_follow_up = 1 THEN 'awaiting_follow_up'
    ELSE 'active'
  END,
  ended_at = CASE
    WHEN ended_at IS NOT NULL THEN ended_at
    WHEN final_problem_key IS NOT NULL THEN updated_at
    ELSE ended_at
  END
WHERE session_id IS NULL
   OR current_round_index = 0
   OR outcome_type IS NULL
   OR session_status IS NULL
   OR ended_at IS NULL;

ALTER TABLE diagnosis_sessions
  ADD UNIQUE KEY uk_session_id (session_id),
  ADD KEY idx_session_status (session_status),
  ADD KEY idx_current_identity (current_plant_identity_id),
  ADD KEY idx_latest_visual_batch (latest_visual_call_batch_id);
