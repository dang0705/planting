/**
 * 青花植后端公开引用的不透明类型。
 * 这些值是高熵字符串，不等于数据库 BIGINT 内部主键；品牌字段只在编译期存在。
 */
export type PublicRef<Kind extends string> = string & {
  /** 仅供 TypeScript 编译期区分不同公开引用种类；运行时不生成该属性，禁止把它当作数据库字段。 */
  readonly __publicRefKind: Kind;
};

/** 平台无关的统一用户公开引用；外部边界只使用不透明引用，不暴露数据库内部键。 */
export type UserRef = PublicRef<"user">;
/** 用户植物公开引用；用于把养护、问诊等长期业务归属到具体用户植物。 */
export type UserPlantRef = PublicRef<"user-plant">;
/** 游客会话公开引用；只代表临时游客上下文，不代表统一用户身份。 */
export type GuestSessionRef = PublicRef<"guest-session">;
/** 游客植物案例公开引用；用于认领前的临时案例关联和幂等重放。 */
export type GuestPlantCaseRef = PublicRef<"guest-plant-case">;
/** 游客认领命令公开引用；同键同参重放必须回读同一个引用。 */
export type GuestClaimRef = PublicRef<"guest-claim">;
/** 已发布植物规范身份公开引用；不等同于用户植物，也不能单独授予用户归属。 */
export type PlantIdentityRef = PublicRef<"plant-identity">;
/** 领域事件公开引用；用于事件去重、审计和跨域关联，不是数据库主键。 */
export type EventRef = PublicRef<"event">;

/** http-api/v1 允许对外暴露的稳定错误类别。 */
export type PublicErrorType =
  | "VALIDATION_FAILED"
  | "PRINCIPAL_INVALID"
  | "CAPABILITY_DENIED"
  | "IDENTITY_BINDING_CONFLICT"
  | "IDENTITY_LAST_BINDING_REQUIRED"
  | "NOT_FOUND"
  | "USER_PLANT_NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "GUEST_SESSION_EXPIRED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "IDEMPOTENCY_CONFLICT"
  | "USER_PLANT_VERSION_CONFLICT"
  | "CAPABILITY_SNAPSHOT_EXPIRED"
  | "GUEST_SESSION_NOT_CLAIMABLE"
  | "AI_QUOTA_INSUFFICIENT"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

/** 公开错误只有稳定类别和可面向用户的中文消息。 */
export type ErrorResponseDto = {
  /** 对外错误信封；响应只允许保留稳定错误信息，禁止携带堆栈、SQL 或内部追踪标识。 */
  error: {
    /** 面向客户端的稳定错误类别，客户端据此决定展示或重试策略。 */
    type: PublicErrorType;
    /** 可直接面向用户的中文提示；不得包含数据库主键、平台主体标识或内部实现细节。 */
    message: string;
  };
};

/** 游客主体不能拥有统一用户、会员、积分或用户植物。 */
export type GuestPrincipalDto = {
  /** 主体判别字段，固定为 guest，禁止伪装成已登录用户或服务主体。 */
  principalType: "guest";
  /** 当前游客会话的不透明公开引用；仅用于临时上下文，不能反推出 user_id。 */
  guestSessionRef: GuestSessionRef;
  /** 游客认证机制，固定为 CloudBase 匿名认证；不代表任何平台 OpenID。 */
  authProvider: "cloudbase_anonymous";
  /** 游客主体签发时间，使用带 Z 的 ISO 8601 UTC 字符串。 */
  issuedAt: string;
  /** 游客主体过期时间，使用 ISO 8601 UTC 字符串；达到该时间后必须拒绝继续使用。 */
  expiresAt: string;
};

/** 登录主体已由 identity 域解析为平台无关的统一用户。 */
export type UserPrincipalDto = {
  /** 主体判别字段，固定为 user，表示已经解析到统一用户。 */
  principalType: "user";
  /** 平台无关的统一用户公开引用；所有业务归属只能使用它，不能使用平台主体标识。 */
  user_id: UserRef;
  /** 会话版本号，正整数；解绑或撤销会递增，用于拒绝旧会话和并发陈旧写入。 */
  sessionVersion: number;
  /** 本次会话实际通过的平台或手机号入口，仅记录认证来源，不作为业务主键。 */
  authenticatedVia: "wechat" | "douyin" | "xiaohongshu" | "phone";
  /** 登录主体签发时间，使用带 Z 的 ISO 8601 UTC 字符串。 */
  issuedAt: string;
  /** 登录主体过期时间，使用 ISO 8601 UTC 字符串；过期后需重新完成身份解析。 */
  expiresAt: string;
};

/** 内部服务主体共有字段；scope 必须由具体服务分支收窄。 */
type ServicePrincipalBaseDto = {
  /** 主体判别字段，固定为 service，表示这是受信服务调用而非用户请求。 */
  principalType: "service";
  /** 服务主体签发时间，使用带 Z 的 ISO 8601 UTC 字符串。 */
  issuedAt: string;
  /** 服务主体过期时间，使用 ISO 8601 UTC 字符串；过期后必须重新签发。 */
  expiresAt: string;
};

/** CloudBase 小青 Agent 可调用的用户范围工具权限。 */
export type CloudBaseAgentServicePrincipalDto = ServicePrincipalBaseDto & {
  /** 服务来源固定为 CloudBase Agent，只能使用该服务注册的最小权限。 */
  service: "cloudbase_agent";
  /** Agent 可调用的最小 scope 集合；每项代表一个受控工具能力，不能由用户输入扩展。 */
  scopes: Array<
    | "identity.resolve"
    | "user-plant.context.read"
    | "user-plant.agent-context.read"
    | "subscription.ai-quota.reserve"
    | "subscription.ai-quota.settle"
    | "subscription.ai-quota.release"
  >;
};

/** 调度器仅能领取和提交 CMS 补缺任务。 */
export type SchedulerServicePrincipalDto = ServicePrincipalBaseDto & {
  /** 服务来源固定为调度器，只能领取和提交植物知识补缺任务。 */
  service: "scheduler";
  /** 调度器可使用的最小补缺任务权限集合，不能访问用户身份或用户植物数据。 */
  scopes: Array<
    | "plant-knowledge.enrichment.lease"
    | "plant-knowledge.enrichment.submit"
  >;
};

/** 支付回调服务只拥有验签后的回调接收能力。 */
export type PaymentCallbackServicePrincipalDto = ServicePrincipalBaseDto & {
  /** 服务来源固定为支付回调接收器，表示已进入支付回调专用信任边界。 */
  service: "payment_callback";
  /** 唯一允许的支付回调接收 scope；回调必须先验签，不能直接改变权益。 */
  scopes: Array<"subscription.payment-callback.receive">;
};

/** 可靠事件投递器只拥有奖励事实消费能力。 */
export type OutboxDispatcherServicePrincipalDto = ServicePrincipalBaseDto & {
  /** 服务来源固定为可靠事件投递器，只负责消费已提交的奖励事实。 */
  service: "outbox_dispatcher";
  /** 唯一允许的奖励事件消费 scope；不能直接伪造或计算奖励结果。 */
  scopes: Array<"subscription.reward-event.consume">;
};

/** 内部服务主体必须由服务签名、nonce 和该服务最小 scope 共同验证。 */
export type ServicePrincipalDto =
  | CloudBaseAgentServicePrincipalDto
  | SchedulerServicePrincipalDto
  | PaymentCallbackServicePrincipalDto
  | OutboxDispatcherServicePrincipalDto;

/** 请求主体联合类型；路由必须先完成主体判别，再按分支执行权限和归属校验。 */
export type PrincipalDto = GuestPrincipalDto | UserPrincipalDto | ServicePrincipalDto;

type UserPlantBaseDto = {
  /** 用户植物公开引用；它把植物长期事实、计划和时间线归属于当前 user_id。 */
  user_plant_id: UserPlantRef;
  /** 用户植物生命周期状态；deleting/deleted 期间不得继续创建新的业务事实。 */
  lifecycle: "active" | "archived" | "deleting" | "deleted";
  /** 乐观锁版本号，正整数；写入必须携带期望版本以防并发覆盖。 */
  version: number;
  /** 用户植物创建时间，使用带 Z 的 ISO 8601 UTC 字符串。 */
  createdAt: string;
  /** 用户植物最近一次状态或资料变更时间，使用 ISO 8601 UTC 字符串。 */
  updatedAt: string;
};

/** 当前身份未确认时不得夹带已确认身份引用。 */
export type UnconfirmedUserPlantDto = UserPlantBaseDto & {
  /** 当前尚未确认规范植物身份；该分支不得携带 confirmedIdentityRef。 */
  identityStatus: "unidentified" | "candidate_pending";
};

/** 只有确认态才必须携带已发布的规范植物身份引用。 */
export type ConfirmedUserPlantDto = UserPlantBaseDto & {
  /** 当前已确认规范植物身份；只有此状态允许携带 confirmedIdentityRef。 */
  identityStatus: "confirmed";
  /** 已发布植物规范身份公开引用；只能引用通过身份域确认的植物主数据。 */
  confirmedIdentityRef: PlantIdentityRef;
};

/** 用户植物公开投影；通过身份状态区分未确认和已确认两种互斥形状。 */
export type UserPlantDto = UnconfirmedUserPlantDto | ConfirmedUserPlantDto;

/** 新建用户植物聚合的初始乐观锁版本。 */
// oxlint-disable-next-line no-magic-numbers -- user-plant/v1 已冻结的合同字面量。
export const USER_PLANT_INITIAL_VERSION = 1 as const;

/**
 * 创建用户植物请求固定为空对象。
 * 身份、能力、数量上限、幂等键和初始字段全部来自服务端可信上下文或 HTTP Header。
 */
export type CreateUserPlantRequestDto = Record<string, never>;

/** 登录用户明确加入花园后返回的新建用户植物初始公开投影。 */
export type CreateUserPlantResponseDto = {
  /** 服务端生成的高熵用户植物公开引用；不是数据库 BIGINT 内部主键。 */
  user_plant_id: UserPlantRef;
  /** 新建用户植物固定处于 active 生命周期。 */
  lifecycle: "active";
  /** 未经用户确认植物身份时固定为暂未识别。 */
  identityStatus: "unidentified";
  /** 新聚合的初始乐观锁版本，固定为 USER_PLANT_INITIAL_VERSION。 */
  version: typeof USER_PLANT_INITIAL_VERSION;
  /** 服务端生成的 UTC 创建时间。 */
  createdAt: string;
  /** 初次创建时与 createdAt 相同的 UTC 更新时间。 */
  updatedAt: string;
};

/** 创建用户植物成功信封；不返回 user_id、内部主键或能力快照。 */
export type CreateUserPlantSuccessDto = {
  /** 创建成功后的用户植物初始公开投影。 */
  data: CreateUserPlantResponseDto;
};

/** 游客案例可新建用户植物，或绑定当前用户已经拥有的植物。 */
export type ClaimGuestSessionCommandDto = {
  /** 待认领的游客会话公开引用；服务端必须校验它属于当前认证主体且未过期。 */
  guestSessionRef: GuestSessionRef;
  /** 待认领的游客植物案例公开引用；服务端必须校验案例属于该会话且只能成功认领一次。 */
  guestPlantCaseRef: GuestPlantCaseRef;
  /** 认领目标的判别对象；只能选择新建用户植物或绑定已有用户植物其中一种。 */
  target:
    | {
        /** 固定判别值，表示认领时创建新的用户植物归属记录。 */
        type: "new_user_plant";
      }
    | {
        /** 固定判别值，表示把案例绑定到当前用户已有的用户植物。 */
        type: "existing_user_plant";
        /** 目标用户植物公开引用；服务端必须再次校验当前用户的归属，不能仅信任请求值。 */
        user_plant_id: UserPlantRef;
      };
  /** 客户端重试用的幂等键；同一会话、同一命令键只能产生一次认领结果，不能放入秘密信息。 */
  idempotencyKey: string;
};

/** 游客认领结果中允许返回的临时对象类别；不携带任何对象内容或内部键。 */
export type ClaimedGuestObjectKind =
  | "identification_candidate"
  | "fixed_diagnosis_result"
  | "independent_watering_advice"
  | "soil_visual_evidence";

/** 游客案例认领的严格公开结果；只返回白名单摘要，禁止泄露命令、用户或租约内部状态。 */
export type GuestClaimResultDto = {
  /** 唯一公开认领引用；同键同参重放必须稳定回读该值。 */
  claimRef: GuestClaimRef;
  /** 最终归属的用户植物公开引用；不暴露数据库内部 BIGINT。 */
  userPlantId: UserPlantRef;
  /** 已获得派生归属的临时对象类别白名单；不返回对象 ID、内容、模型输出或内部状态。 */
  claimedObjectKinds: ClaimedGuestObjectKind[];
  /** 是否为同键同参请求的结果重放。 */
  replayed: boolean;
};

/** 可触发奖励资格裁决的领域事件类型；事件本身不携带最终积分或 AI 点数。 */
export type RewardEventType =
  | "user_plant.profile_completed.v1"
  | "care.soil_check_completed.v1"
  | "care.fertilizing_check_completed.v1"
  | "diagnosis.fixed_package_completed.v1"
  | "knowledge.contribution_released.v1";

/** 生产域只提交奖励资格事实，不能提交积分或 AI 点数。 */
export type RewardableDomainEventDto = {
  /** 领域事件公开引用；用于跨域去重和审计关联，不能替代数据库内部自增键。 */
  eventId: EventRef;
  /** 产生奖励资格的业务事实类型；subscription 只能按已登记类型裁决。 */
  eventType: RewardEventType;
  /** 事件合同版本，当前固定为 1；升级事件字段时必须发布新版本而不是静默改变含义。 */
  eventVersion: 1;
  /** 产生事实的业务域；奖励域据此校验生产者权限和事件合同。 */
  producerDomain: "user-plant" | "care" | "diagnosis" | "plant-knowledge";
  /** 统一用户公开引用；奖励资格最终归属于用户，不能使用微信、抖音或小红书主体标识。 */
  userRef: UserRef;
  /** 可选的用户植物公开引用；仅植物范围事件携带，出现时必须属于 userRef 对应用户。 */
  userPlantRef?: UserPlantRef;
  /** 产生事实的聚合公开引用；只用于审计关联，不得暴露数据库内部主键。 */
  aggregateRef: string;
  /** 业务发生实例的去重引用；同一事实重试时保持不变，避免重复触发奖励。 */
  occurrenceRef: string;
  /** 产生该事件时采用的奖励策略版本，用于回放；不能由客户端篡改。 */
  policyVersion: string;
  /** 业务事实发生时间，使用带 Z 的 ISO 8601 UTC 字符串，不等同于服务接收时间。 */
  occurredAt: string;
  /** 仅承载该事件所需的原始业务事实；禁止注入积分、金额、AI 额度、凭证或未授权用户数据。 */
  payload: Record<string, unknown>;
  /** payload 规范化内容的 SHA-256 摘要（64 位小写十六进制），用于完整性和重放校验。 */
  payloadHash: string;
};

/** 允许使用奖励额度支付的生成式 AI 能力范围；不是任意模型名或 Provider 名。 */
export type UserGenerativeCapability =
  | "USER_AGENT_TEXT"
  | "USER_DIAGNOSIS_TEXT"
  | "USER_DIAGNOSIS_VISUAL";

/**
 * capability-snapshot/v1 已冻结的产品能力代码。
 * 未登记能力必须拒绝；未来新增付费能力需发布新的目录版本并同步升级 Schema。
 */
export type ProductCapability =
  | "PLANT_IDENTIFICATION"
  | "FIXED_DIAGNOSIS"
  | "INDEPENDENT_WATERING"
  | "SOIL_VISUAL_EVIDENCE"
  | "USER_PLANT_CREATE"
  | "POINTS_LEVEL_QUERY"
  | "REWARDED_AI"
  /** 小青文本对话；仅试用或会员直接具备，免费用户须经 REWARDED_AI 的奖励额度范围授权。 */
  | "USER_AGENT_TEXT"
  /** 生成式文本问诊；必须绑定合法的用户植物上下文。 */
  | "USER_DIAGNOSIS_TEXT"
  /** 生成式视觉问诊；必须同时通过私有资产与用户植物归属校验。 */
  | "USER_DIAGNOSIS_VISUAL";

/**
 * 一次请求内固定使用的能力裁决快照公共字段。
 * snapshotRef 仅供后端服务之间关联审计记录，不得进入面向小程序的公开响应。
 */
type CapabilitySnapshotBaseDto = {
  /** 能力快照合同版本，当前固定为 capability-snapshot/v1。 */
  contractVersion: "capability-snapshot/v1";
  /** 高熵快照引用，仅供服务间审计关联和回放；不得进入面向小程序的公开响应。 */
  snapshotRef: string;
  /** 当前主体允许执行的产品能力代码集合；每项必须来自已发布能力目录。 */
  allowedCapabilities: ProductCapability[];
  /** 可由奖励额度支付的生成式能力集合；游客必须为空，且仍需通过额度和归属校验。 */
  rewardedAiScopes: UserGenerativeCapability[];
  /** 快照生成时间，使用带 Z 的 ISO 8601 UTC 字符串。 */
  generatedAt: string;
  /** 快照失效时间，使用 ISO 8601 UTC 字符串；必须晚于 generatedAt，失效后不可原地延长。 */
  validUntil: string;
  /** 生成该快照时采用的能力策略版本，用于审计和请求级回放。 */
  policyVersion: string;
};

/** 游客没有统一用户、会员权益或用户植物额度。 */
export type GuestCapabilitySnapshotDto = CapabilitySnapshotBaseDto & {
  /** 主体判别字段，固定为 guest；此分支禁止出现 user_id。 */
  subjectType: "guest";
  /** 游客权益层级，固定为 guest，不包含会员或试用权限。 */
  tier: "guest";
  /** 游客可拥有的 active 用户植物数量上限，固定为 0。 */
  activeUserPlantLimit: 0;
};

/** 登录用户能力快照必须明确关联平台无关的统一用户。 */
export type UserCapabilitySnapshotDto = CapabilitySnapshotBaseDto & {
  /** 主体判别字段，固定为 user，表示快照关联统一用户。 */
  subjectType: "user";
  /** 快照所属的统一用户公开引用；所有后续用户植物和额度检查都必须回到该用户。 */
  user_id: UserRef;
  /** 当前权益层级；free、trial、member 的能力和额度由已发布策略分别决定。 */
  tier: "free" | "trial" | "member";
  /** 当前主体可拥有的 active 用户植物数量上限，单位为株，必须由服务端执行。 */
  activeUserPlantLimit: number;
};

/** 身份域生成、各业务域只读消费的内部能力裁决合同。 */
export type CapabilitySnapshotDto =
  | GuestCapabilitySnapshotDto
  | UserCapabilitySnapshotDto;

/**
 * 客户端只声明要执行的产品动作和能力。
 * 点数、成本策略、预占和结算都由服务端决定，不能由客户端输入。
 */
export type PublicAiActionRequestDto = {
  /** 产品动作公开标识；用于动作合同、幂等和审计关联，不允许客户端借此指定成本。 */
  productActionId: string;
  /** 客户端请求执行的生成式能力；服务端必须与能力快照、用户植物和额度范围交叉校验。 */
  capability: UserGenerativeCapability;
};

/** 内部预占命令包含服务端算出的预算；它不是公开请求 DTO。 */
export type ReserveAiQuotaCommandDto = {
  /** 与一次用户产品动作对应的稳定标识；同一用户动作只能创建一个有效预占。 */
  productActionId: string;
  /** 计算预占额度时锁定的不可变成本策略版本；客户端不能自行指定或覆盖。 */
  costPolicyVersion: string;
  /** 本次预占覆盖的生成式能力；必须属于能力快照和奖励额度允许范围。 */
  capability: UserGenerativeCapability;
  /** 按成本策略预估的 AI 点数，必须为正整数并来自产品动作上限，而非模型适配器临时猜测。 */
  estimatedAmount: number;
  /** 受信应用服务生成的幂等键；同一 user_id、动作和键重复提交时必须返回一致结果或冲突。 */
  idempotencyKey: string;
};
