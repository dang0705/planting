import type { UserPlantDto, UserPlantRef, UserPrincipalDto } from '../../contracts/types.js'
import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import { UserPlantPersistenceError } from '../repository/mysql-user-plant-repository.js'

const successHTTPStatusCode = Number('200')
const notFoundHTTPStatusCode = Number('404')

/** 读取单株用户植物所需的最小归属查询端口。 */
export type GetUserPlantRepository<TTransaction extends TransactionExecutionContext> = {
  /** 仅当统一用户与用户植物公开引用同时匹配且状态可见时返回公开投影。 */
  readonly getOwnedUserPlant: (
    transaction: TTransaction,
    userRef: UserPrincipalDto['user_id'],
    userPlantRef: UserPlantRef
  ) => Promise<UserPlantDto>
}

/** 单株读取用例输入；Principal 必须先由 identity 域解析，而非取自请求正文。 */
export type GetUserPlantApplicationInput = {
  /** 已认证并解析为统一 user_id 的登录主体。 */
  readonly principal: UserPrincipalDto
  /** 用户选择读取的高熵植物公开引用。 */
  readonly userPlantRef: UserPlantRef
}

/** 单株用户植物读取用例依赖。 */
export type GetUserPlantApplicationDependencies<TTransaction extends TransactionExecutionContext> =
  {
    /** 为 Repository 查询提供受控的单次数据库事务。 */
    readonly driver: DatabaseTransactionDriver<TTransaction>
    /** user-plant 域唯一归属查询端口。 */
    readonly repository: GetUserPlantRepository<TTransaction>
  }

/** GET 成功响应；只包含用户植物合同允许公开的投影字段。 */
export type GetUserPlantSuccessResponse = {
  /**
   * 单株读取成功时交给 HTTP 适配层的状态码；固定为 200，禁止由调用方覆盖。
   * 该字段不是业务数据，也不会写入数据库。
   */
  readonly status: number
  /** HTTP v1 固定成功信封。 */
  readonly body: {
    /** 当前登录用户有权读取的用户植物公开投影。 */
    readonly data: UserPlantDto
  }
}

/** 不存在、越权或生命周期不可见时完全相同的脱敏错误响应。 */
export type GetUserPlantNotFoundResponse = {
  /**
   * 用户植物不存在、归属不符或处于不可见生命周期时统一使用的 HTTP 状态码；固定为 404。
   * 不得区分越权、deleting 与 deleted，避免通过响应探测他人植物是否存在。
   */
  readonly status: number
  /** HTTP v1 固定错误信封，不包含是否属于其他用户等信息。 */
  readonly body: {
    /**
     * 稳定公开错误对象；只描述“当前主体不可访问该用户植物”，不包含 SQL、数据库主键、
     * 所有者标识或内部生命周期状态。
     */
    readonly error: {
      /** 资源不可见时统一返回的错误类型。 */
      readonly type: 'USER_PLANT_NOT_FOUND'
      /** 不泄露植物存在性或所属人的中文说明。 */
      readonly message: '用户植物不存在或不可访问'
    }
  }
}

/** 单株读取用例只返回公开成功投影或统一脱敏 not-found。 */
export type GetUserPlantApplicationResponse =
  | GetUserPlantSuccessResponse
  | GetUserPlantNotFoundResponse

/** 构造对外统一的用户植物不可见错误。 */
function userPlantNotFoundResponse(): GetUserPlantNotFoundResponse {
  return {
    status: notFoundHTTPStatusCode,
    body: {
      error: {
        type: 'USER_PLANT_NOT_FOUND',
        message: '用户植物不存在或不可访问'
      }
    }
  }
}

/**
 * 创建单株用户植物读取应用服务。
 *
 * 身份认证由请求链/identity 提前完成；本用例只使用其中的统一 user_id 与公开植物引用进行
 * owner-scoped 查询。跨用户、缺失、deleting 和 deleted 统一映射为相同 404，不暴露资源存在性。
 */
export function createGetUserPlantApplicationService<
  TTransaction extends TransactionExecutionContext
>(
  dependencies: GetUserPlantApplicationDependencies<TTransaction>
): (input: GetUserPlantApplicationInput) => Promise<GetUserPlantApplicationResponse> {
  return async input =>
    runDatabaseTransaction(dependencies.driver, async transaction => {
      try {
        const plant = await dependencies.repository.getOwnedUserPlant(
          transaction,
          input.principal.user_id,
          input.userPlantRef
        )
        return {
          status: successHTTPStatusCode,
          body: { data: plant }
        }
      } catch (error: unknown) {
        if (error instanceof UserPlantPersistenceError && error.type === 'USER_PLANT_NOT_FOUND') {
          return userPlantNotFoundResponse()
        }
        throw error
      }
    })
}
