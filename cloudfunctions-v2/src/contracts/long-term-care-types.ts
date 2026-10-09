/** 计划的「加入手机日历」字段（long-term-care/v1 §9）；不含内部引用、链接或个人信息。 */
export type CareCalendarDto = {
  /** 中文日历标题，如「检查绿萝盆土」。 */
  title: string;
  /** 日历开始时刻（= 计划时间），带 Z 的 UTC。 */
  startAt: string;
  /** 日历结束时刻（开始 + 30 分钟），带 Z 的 UTC。 */
  endAt: string;
  /** 固定中文检查提示，不含个人信息。 */
  notes: string;
};

/** 品种绑定请求（long-term-care/v1 §1）。 */
export type PutCatalogBindingRequestDto = {
  /** Tropicals 目录引用，1～512 字符；须在目录中存在。 */
  catalogTaxonRef: string;
};

/** 品种绑定公开结果。 */
export type CatalogBindingResponseDto = {
  /** 当前生效的 Tropicals 目录引用。 */
  catalogTaxonRef: string;
  /** 绑定生效时刻，带 Z 的 UTC。 */
  boundAt: string;
};

/** 记录浇水请求（long-term-care/v1 §3）；本阶段只接受浇水。 */
export type CreateCareFactRequestDto = {
  /** 事实类型，本阶段固定为浇水。 */
  factType: "watering";
  /** 实际浇水时刻，带 Z 的 UTC；不得晚于现在、不得早于 7 天前。 */
  occurredAt: string;
  /** 浇入水量（毫升，0～10000 整数）；不知道为 null 或省略。 */
  amountMl?: number | null;
};

/** 浇水事实公开结果。 */
export type CareFactResponseDto = {
  /** 不可变事实公开引用（cft_）。 */
  factRef: string;
  /** 事实类型，固定为浇水。 */
  factType: "watering";
  /** 实际浇水时刻，带 Z 的 UTC。 */
  occurredAt: string;
  /** 浇入水量（毫升）；未知为 null。 */
  amountMl: number | null;
};

/** 养护计划公开投影。 */
export type CarePlanDto = {
  /** 计划公开引用（cpl_）。 */
  planRef: string;
  /** 计划类型，本阶段固定为检查盆土。 */
  planType: "check_soil";
  /** 计划时刻，带 Z 的 UTC。 */
  scheduledAt: string;
  /** 计划状态：待办、已完成、已取消、已过期。 */
  status: "planned" | "completed" | "cancelled" | "expired";
  /** 来源建议公开引用（cpr_）。 */
  sourceProposalRef: string;
  /** 完成时同时记录的浇水事实引用；没有为 null。 */
  completedFactRef: string | null;
  /** 加入手机日历所需字段。 */
  calendar: CareCalendarDto;
};

/** 计划列表公开结果。 */
export type CarePlanListResponseDto = {
  /** 当前页计划，按计划时刻升序。 */
  items: CarePlanDto[];
  /** 下一页不透明游标；没有更多为 null。 */
  nextCursor: string | null;
};

/** 确认建议请求（long-term-care/v1 §6），严格三选一。 */
export type ConfirmCareProposalRequestDto =
  | {
      /** 安排一次检查盆土计划。 */
      decision: "schedule_check";
      /** 用户自选计划时刻；省略取检查窗口最早端。 */
      scheduledAt?: string;
    }
  | {
      /** 用户已按建议浇水，直接记录浇水事实。 */
      decision: "record_watering";
      /** 实际浇水时刻，带 Z 的 UTC。 */
      occurredAt: string;
      /** 浇入水量（毫升）；未知为 null 或省略。 */
      amountMl?: number | null;
    }
  | {
      /** 不采纳本条建议。 */
      decision: "dismiss";
    };

/** 确认后的计划摘要（不含来源建议与完成事实）。 */
export type CareConfirmationPlanDto = {
  /** 计划的公开引用，不暴露内部主键。 */
  planRef: string;
  /** 计划类型，固定为检查盆土。 */
  planType: "check_soil";
  /** 计划时刻，带 Z 的 UTC。 */
  scheduledAt: string;
  /** 新建计划的状态，固定为待办。 */
  status: "planned";
  /** 加入手机日历所需字段。 */
  calendar: CareCalendarDto;
};

/** 确认建议公开结果。 */
export type CareConfirmationResponseDto = {
  /** 被确认或忽略的建议公开引用。 */
  proposalRef: string;
  /** 建议最终状态：已确认或已忽略。 */
  proposalStatus: "confirmed" | "dismissed";
  /** 安排检查时生成的计划；否则为 null。 */
  plan: CareConfirmationPlanDto | null;
  /** 记录浇水时生成的事实引用；否则为 null。 */
  factRef: string | null;
};

/** 完成计划请求（long-term-care/v1 §7）。 */
export type CompleteCarePlanRequestDto = {
  /** 最后读到的计划版本；不符返回版本冲突。 */
  version: number;
  /** 完成（done）或跳过（skipped）。 */
  outcome: "done" | "skipped";
  /** 完成时看到的盆土状态；跳过时不得携带。 */
  soil?: {
    /** 盆土状态，四态之一：湿、润、干、不确定。 */
    state: "wet" | "moist" | "dry" | "uncertain";
    /** 观察范围：表土或根区。 */
    scope: "surface" | "root_zone";
  };
  /** 完成时同时浇了水；跳过时不得携带。 */
  watering?: {
    /** 实际浇水时刻，带 Z 的 UTC。 */
    occurredAt: string;
    /** 浇入水量（毫升）；未知为 null 或省略。 */
    amountMl?: number | null;
  };
};

/** 完成计划公开结果。 */
export type CarePlanResponseDto = {
  /** 计划的公开引用，不暴露内部主键。 */
  planRef: string;
  /** 计划新状态：已完成或已取消（跳过）。 */
  status: "completed" | "cancelled";
  /** 更新后的计划版本。 */
  version: number;
  /** 同时记录的浇水事实引用；没有为 null。 */
  factRef: string | null;
  /** 加入手机日历所需字段（保留原计划时刻）。 */
  calendar: CareCalendarDto;
};

/** 养护摘要公开结果（long-term-care/v1 §4）；只读。 */
export type CareSummaryResponseDto = {
  /** 最近一次浇水事实；没有为 null。 */
  lastWatering: {
    /** 浇水事实的公开引用，不暴露内部主键。 */
    factRef: string;
    /** 实际浇水时刻，带 Z 的 UTC。 */
    occurredAt: string;
    /** 浇入水量（毫升）；未知为 null。 */
    amountMl: number | null;
  } | null;
  /** 最近一次长期浇水建议；没有为 null。 */
  latestWateringAdvice: {
    /** 计算结果公开引用。 */
    resultRef: string;
    /** 建议结果的生成时刻，带 Z 的 UTC。 */
    generatedAt: string;
    /** 结果状态：就绪、缺证据或暂不可用。 */
    status: "ready" | "insufficient_evidence" | "temporarily_unavailable";
    /** 最终建议的行动代码，供前端映射展示文案。 */
    action: string;
    /** 检查窗口（与浇水结果详情同形）；没有为 null。 */
    checkWindow: Record<string, unknown> | null;
    /** 关联建议；没有可确认行动为 null。 */
    proposal: {
      /** 建议的公开引用，不暴露内部主键。 */
      proposalRef: string;
      /** 建议状态：待确认、已确认、已忽略、已过期。 */
      status: "proposed" | "confirmed" | "dismissed" | "expired";
      /** 建议有效截止时刻；未确定为 null。 */
      validUntil: string | null;
    } | null;
  } | null;
  /** 最近一条待办计划；没有为 null。 */
  nextPlan: CareConfirmationPlanDto | null;
  /** 档案就绪情况，供前端提示补全。 */
  profileReadiness: {
    /** 是否已保存实测内盆。 */
    hasMeasuredPot: boolean;
    /** 是否已绑定 Tropicals 品种。 */
    hasCatalogBinding: boolean;
  };
};
