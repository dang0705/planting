import Ajv, { type ValidateFunction } from "ajv";

import {
  capabilitySnapshotSchema,
  claimGuestSessionCommandSchema,
  createUserPlantRequestSchema,
  createUserPlantResponseSchema,
  errorResponseSchema,
  guestClaimResultSchema,
  guestPrincipalSchema,
  publicAiActionRequestSchema,
  reserveAiQuotaCommandSchema,
  rewardableDomainEventSchema,
  servicePrincipalSchema,
  userPlantSchema,
  userPrincipalSchema,
} from "./schemas.js";
import type {
  CapabilitySnapshotDto,
  ClaimGuestSessionCommandDto,
  CreateUserPlantRequestDto,
  CreateUserPlantResponseDto,
  ErrorResponseDto,
  GuestClaimResultDto,
  GuestPrincipalDto,
  PublicAiActionRequestDto,
  ReserveAiQuotaCommandDto,
  RewardableDomainEventDto,
  ServicePrincipalDto,
  UserPlantDto,
  UserPrincipalDto,
} from "./types.js";

export type * from "./types.js";
export {
  capabilitySnapshotSchema,
  claimGuestSessionCommandSchema,
  createUserPlantRequestSchema,
  createUserPlantResponseSchema,
  errorResponseSchema,
  guestClaimResultSchema,
  guestPrincipalSchema,
  publicAiActionRequestSchema,
  reserveAiQuotaCommandSchema,
  rewardableDomainEventSchema,
  servicePrincipalSchema,
  userPlantSchema,
  userPrincipalSchema,
} from "./schemas.js";

/**
 * 每个进程只需创建一次校验器集合；路由层把未知输入交给对应校验器，
 * 校验成功后再把值作为精确 DTO 交给应用层。
 */
export function createPublicContractValidators(): {
  /** 能力快照校验器；除结构外还检查 generatedAt 必须早于 validUntil。 */
  capabilitySnapshot: ValidateFunction<CapabilitySnapshotDto>;
  /** 游客主体校验器；禁止 user_id、会员权益和用户植物等登录态字段穿透。 */
  guestPrincipal: ValidateFunction<GuestPrincipalDto>;
  /** 公开错误响应校验器；只允许稳定错误类别和面向用户的脱敏消息。 */
  errorResponse: ValidateFunction<ErrorResponseDto>;
  /** 统一用户主体校验器；只接受 user_id，不接受任何平台主体标识作为业务归属。 */
  userPrincipal: ValidateFunction<UserPrincipalDto>;
  /** 内部服务主体校验器；按 service 分支限制最小 scope 集合。 */
  servicePrincipal: ValidateFunction<ServicePrincipalDto>;
  /** 用户植物公开投影校验器；保证未确认态与已确认身份引用互斥。 */
  userPlant: ValidateFunction<UserPlantDto>;
  /** 创建用户植物请求校验器；只接受严格空 JSON 对象。 */
  createUserPlantRequest: ValidateFunction<CreateUserPlantRequestDto>;
  /** 创建用户植物响应校验器；只接受服务端生成的固定初始投影。 */
  createUserPlantResponse: ValidateFunction<CreateUserPlantResponseDto>;
  /** 游客会话认领命令校验器；保证新建植物与绑定已有植物的目标形状互斥。 */
  claimGuestSession: ValidateFunction<ClaimGuestSessionCommandDto>;
  /** 游客认领公开结果校验器；拒绝数据库内部键、用户归属、proof、租约和请求哈希。 */
  guestClaimResult: ValidateFunction<GuestClaimResultDto>;
  /** 奖励资格领域事件校验器；拒绝 points、amount 等由 subscription 计算的结果字段。 */
  rewardableDomainEvent: ValidateFunction<RewardableDomainEventDto>;
  /** 公开 AI 动作请求校验器；客户端只能声明动作和能力，不能提交成本或点数。 */
  publicAiAction: ValidateFunction<PublicAiActionRequestDto>;
  /** 内部 AI 额度预占命令校验器；只接受服务端依据不可变成本策略计算的预算。 */
  reserveAiQuota: ValidateFunction<ReserveAiQuotaCommandDto>;
} {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const capabilitySnapshotShapeValidator = ajv.compile(capabilitySnapshotSchema);
  /**
   * JSON Schema 负责形状和枚举，包装器负责两个 ISO 时间字段的先后关系。
   * 两层都通过才允许把未知输入收窄为 CapabilitySnapshotDto。
   */
  const capabilitySnapshotValidator = ((data: unknown): data is CapabilitySnapshotDto => {
    if (!capabilitySnapshotShapeValidator(data)) {
      capabilitySnapshotValidator.errors = capabilitySnapshotShapeValidator.errors ?? null;
      return false;
    }
    if (Date.parse(data.generatedAt) >= Date.parse(data.validUntil)) {
      capabilitySnapshotValidator.errors = [
        {
          instancePath: "/validUntil",
          schemaPath: "#/timeOrder",
          keyword: "timeOrder",
          params: {},
          message: "必须晚于 generatedAt",
        },
      ];
      return false;
    }
    capabilitySnapshotValidator.errors = null;
    return true;
  }) as ValidateFunction<CapabilitySnapshotDto>;

  return {
    capabilitySnapshot: capabilitySnapshotValidator,
    errorResponse: ajv.compile(errorResponseSchema),
    guestPrincipal: ajv.compile(guestPrincipalSchema),
    userPrincipal: ajv.compile(userPrincipalSchema),
    servicePrincipal: ajv.compile(servicePrincipalSchema),
    userPlant: ajv.compile(userPlantSchema),
    createUserPlantRequest: ajv.compile(createUserPlantRequestSchema),
    createUserPlantResponse: ajv.compile(createUserPlantResponseSchema),
    claimGuestSession: ajv.compile(claimGuestSessionCommandSchema),
    guestClaimResult: ajv.compile(guestClaimResultSchema),
    rewardableDomainEvent: ajv.compile(rewardableDomainEventSchema),
    publicAiAction: ajv.compile(publicAiActionRequestSchema),
    reserveAiQuota: ajv.compile(reserveAiQuotaCommandSchema),
  };
}
