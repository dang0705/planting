/** 当前配置治理首批纳管的 Provider；新增项必须先进入机器目录和架构审查。 */
export type ProviderCode =
  | "baidu_plant"
  | "taxonomy_authority"
  | "bailian_qwen_diagnosis"
  | "bailian_qwen_enrichment"
  | "qweather"
  | "wechat_pay"
  | "platform_notification"
  | "cloudbase_storage"
  | "cloudbase_cms"
  | "cloudbase_agent"
  | "cloudbase_mysql"
  | "cloudbase_auth";

/** AI 月预算策略；金额单位均为人民币元，具体值来自已冻结策略发布。 */
export interface AiBudgetPolicyRelease {
  /** 固定的 AI 预算策略合同版本，用于阻止不同版本的字段被误读或混用。 */
  contractVersion: "ai-budget-policy/v1";
  /** 配置目录中的稳定策略编码；此处固定指向 subscription 域的 AI 月预算策略。 */
  policyCode: "subscription.ai_budget";
  /** 不可变发布版本标识；策略变更必须产生新版本，便于按版本回放与回滚。 */
  releaseVersion: string;
  /** 金额统一使用人民币元；固定为 CNY，其他币种不得进入此合同。 */
  currency: "CNY";
  /** 单个自然月允许使用的 AI 总预算，单位为人民币元，必须是正整数。 */
  monthlyBudgetCny: number;
  /** 触发预算预警的金额，单位为人民币元；必须低于限制阈值。 */
  warningThresholdCny: number;
  /** 触发限制或停止新增消耗的金额，单位为人民币元；必须高于预警阈值且不超过月预算。 */
  restrictThresholdCny: number;
  /** 策略正文的 SHA-256 十六进制摘要（64 位小写字符），用于发布完整性核对，不是密钥。 */
  contentSha256: string;
  /** 发布生效时间，使用带 Z 的 ISO 8601 UTC 时间字符串，决定从何时采用本版本。 */
  effectiveAt: string;
}

/**
 * Provider 非密钥运行配置发布。
 * credentialRef 只指向 CloudBase 受控凭证；该合同禁止出现任何明文密钥属性。
 */
export interface ProviderConfigRelease {
  /** 固定的 Provider 配置合同版本，保证读取方按同一字段语义解释发布记录。 */
  contractVersion: "provider-config-release/v1";
  /** 已登记的第三方或平台能力提供方编码；未进入注册表的编码不得接入。 */
  providerCode: ProviderCode;
  /** 此发布允许消费的能力或策略编码集合；必须非空且去重，不能写入明文凭证。 */
  capabilityCodes: string[];
  /** 不可变配置发布版本；配置变更必须通过新版本发布并保留旧版本回放能力。 */
  releaseVersion: string;
  /** 非密钥配置正文的 SHA-256 十六进制摘要（64 位小写字符），用于校验配置未被篡改。 */
  configurationSha256: string;
  /** 端点配置档案的稳定名称；只描述路由档案，不应承载完整 URL、令牌或其他秘密。 */
  endpointProfile: string;
  /** CloudBase 受控凭证的引用（cloudbase-secret://...）；只能保存引用，禁止保存密钥原文。 */
  credentialRef: string;
  /** 建立 Provider 网络连接的超时时间，单位为毫秒。 */
  connectTimeoutMs: number;
  /** 等待 Provider 返回数据的超时时间，单位为毫秒。 */
  readTimeoutMs: number;
  /** 一次业务调用包含重试在内的总截止时间，单位为毫秒，不能被单次重试无限延长。 */
  totalDeadlineMs: number;
  /** 单次 Provider 调用允许的最大尝试次数（包含首次尝试），由重试策略解释其失败边界。 */
  maxAttempts: number;
  /** 退避策略的注册表编码，用于决定重试间隔，避免调用方自行猜测等待规则。 */
  backoffPolicy: string;
  /** 限流策略的注册表编码，用于限制调用速率并保护 Provider 与本系统。 */
  rateLimitPolicy: string;
  /** 熔断策略的注册表编码；Provider 连续失败时按该策略暂停调用并记录审计。 */
  circuitBreakerPolicy: string;
  /** 成本核算策略的注册表编码，用于把调用量折算为预算或点数。 */
  costPolicy: string;
  /** 有序的回退链编码；为空表示不启用回退，具体候选顺序由注册表解释。 */
  fallbackChain: string[];
  /** Provider 输出必须满足的合同版本，供适配器在公开响应前执行兼容性校验。 */
  outputContractVersion: string;
  /** 审计记录保留期限，单位为自然日；到期处置受审计与合规策略约束。 */
  auditRetentionDays: number;
  /** 发布生命周期状态；只有符合当前发布策略的版本才能被选为 active 配置。 */
  releaseStatus: "draft" | "verified" | "active" | "retired";
  /** 配置生效时间，使用 ISO 8601 UTC 字符串，决定版本何时可被请求快照选中。 */
  effectiveAt: string;
  /** 可选的失效时间，使用 ISO 8601 UTC 字符串；缺省表示未预先声明到期时间。 */
  expiresAt?: string;
}

/** 一条已解析的配置发布引用；请求快照只保存版本与 SHA，不复制配置正文。 */
export interface ConfigurationReleaseRef {
  /** 配置作用域编码，例如某个业务域或 Provider 能力范围，用于区分同名版本。 */
  scopeCode: string;
  /** 被请求快照锁定的不可变发布版本标识。 */
  releaseVersion: string;
  /** 该发布正文的 SHA-256 摘要；快照只保留摘要和版本，不复制配置正文。 */
  sha256: string;
}

/** 构建请求快照所需的完整输入。 */
export interface ConfigurationSnapshotInput {
  /** 本次请求需要锁定的策略发布引用列表；列表元素只含版本与摘要，不含策略正文。 */
  policyReleases: readonly ConfigurationReleaseRef[];
  /** 本次请求需要锁定的 Provider 发布引用列表；只允许读取已核验的发布引用。 */
  providerReleases: readonly ConfigurationReleaseRef[];
  /** 捕获快照的时间，使用 ISO 8601 UTC 字符串，作为本次请求的配置观察时点。 */
  capturedAt: string;
}

/** 请求生命周期内不可变的配置快照。 */
export interface ConfigurationSnapshot {
  /** 已按作用域、版本和摘要稳定排序并冻结的策略发布引用，保证请求内只读。 */
  policyReleases: readonly Readonly<ConfigurationReleaseRef>[];
  /** 已按作用域、版本和摘要稳定排序并冻结的 Provider 发布引用，保证请求内只读。 */
  providerReleases: readonly Readonly<ConfigurationReleaseRef>[];
  /** 生成快照时的 ISO 8601 UTC 时间；它标记配置决策的时间边界。 */
  capturedAt: string;
  /** 快照规范化内容的 SHA-256 摘要（64 位小写十六进制），用于跨节点一致性和审计回放。 */
  snapshotSha256: string;
}

/** 业务语义校验失败只返回稳定原因，不泄露配置正文。 */
export type ConfigurationSemanticValidation =
  | {
      /** 表示结构校验和跨字段业务语义均已通过；成功分支不会携带失败原因。 */
      valid: true;
    }
  | {
      /** 表示配置虽可能结构正确，但未满足跨字段业务约束。 */
      valid: false;
      /** 稳定、可审计的失败码；不携带配置正文、阈值详情或其他敏感运行信息。 */
      reason: "AI_BUDGET_THRESHOLD_ORDER_INVALID";
    };
