/** 闭区间数值（如建议浇入毫升数）；min 不大于 max。 */
export type CareNumericRangeDto = {
  /** 区间下端，非负数。 */
  min: number;
  /** 区间上端，非负数且不小于下端。 */
  max: number;
};

/** 浇水检查窗口公开投影（watering-assessment/v1）；端点为空表示开放。 */
export type WateringCheckWindowDto = {
  /** 窗口用途固定为复查盆土，不承诺届时需要浇水。 */
  purpose: "soil_check";
  /** 最早检查时刻，带 Z 的 UTC；预报不足时为 null。 */
  earliestAt: string | null;
  /** 最晚检查时刻，带 Z 的 UTC；预报不足时为 null。 */
  latestAt: string | null;
  /** 环境预报覆盖到的截止时刻，带 Z 的 UTC。 */
  coverageEndAt: string;
  /** 植物所在地时区；Provider 未提供时为 null。 */
  timezone: string | null;
  /** 最早检查的当地日期 YYYY-MM-DD；无时区或无端点时为 null。 */
  earliestDate: string | null;
  /** 最晚检查的当地日期 YYYY-MM-DD；无时区或无端点时为 null。 */
  latestDate: string | null;
};

/** 浇水能力详情公开投影（watering-assessment/v1）。 */
export type WateringAssessmentDetailsDto = {
  /** 最终行动：暂不可用、暂停、检查排水、可以浇水、稍后检查、立即检查、优先检查或缺证据。 */
  action: "temporarily_unavailable" | "pause_watering" | "review_drainage" | "water_allowed" | "check_later" | "check_now" | "priority_check" | "insufficient_evidence";
  /** 盆土安全门状态：湿、积水、达到目标干燥或未知。 */
  soilState: "wet" | "waterlogged" | "target_dry" | "unknown";
  /** 盆土观察范围：表土或根区；无观察为 null。 */
  soilScope: "surface" | "root_zone" | null;
  /** 干燥进度相对基线的位置；无法判断为 null。 */
  dryingWindowState: "before" | "within" | "overdue" | "uncertain" | null;
  /** 检查盆土窗口；无起点时为 null。 */
  checkWindow: WateringCheckWindowDto | null;
  /** 建议浇入水量区间（毫升）；不满足条件时为 null。 */
  amountMl: CareNumericRangeDto | null;
  /** 净补水量区间（毫升）；仅在给出水量时存在。 */
  netDeficitMl: CareNumericRangeDto | null;
  /** 缺失证据代码列表，供前端提示补充信息。 */
  missingEvidence: string[];
};

/** 统一养护能力结果（care-capability-result/v1），浇水能力。 */
export type WateringCapabilityResultDto = {
  /** 能力类型，本合同固定为浇水。 */
  capabilityType: "watering";
  /** 统一外壳合同版本。 */
  contractVersion: "care-capability-result/v1";
  /** 结果可用性：就绪、缺证据或暂不可用。 */
  status: "ready" | "insufficient_evidence" | "temporarily_unavailable";
  /** 置信等级；MVP 浇水固定为低。 */
  confidence: "low" | "medium" | "high";
  /** 脱敏的中文依据说明列表。 */
  evidenceSummary: string[];
  /** 可供用户选择的中文建议列表，不产生计划或提醒。 */
  recommendedActions: string[];
  /** 结果生成时刻，带 Z 的 UTC。 */
  generatedAt: string;
  /** 结果有效截止时刻；未确定为 null。 */
  validUntil: string | null;
  /** 能力详情结构版本。 */
  detailsSchemaVersion: "watering-assessment/v1";
  /** 浇水能力详情：最终行动、盆土状态、检查窗口与水量区间。 */
  details: WateringAssessmentDetailsDto;
};

/** `POST /api/v2/care/watering-advice` 成功数据（watering-advice/v1）。 */
export type CareCapabilityResponseDto = {
  /** 已追加保存的计算结果公开引用（cres_ 前缀），可读回。 */
  resultRef: string;
  /** 长期植物且行动可确认时的建议引用（cpr_）；临时案例不携带。 */
  proposalRef?: string | null;
  /** 公开浇水结果；不含输入快照、策略版本、摘要或内部引用。 */
  result: WateringCapabilityResultDto;
};
