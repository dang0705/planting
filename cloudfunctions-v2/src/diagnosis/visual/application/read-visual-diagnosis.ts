import type { UserPlantListRules } from '../../../configuration/business-policies/index.js'
import type { UserPrincipalDto } from '../../../contracts/types.js'
import { PublicRequestError } from '../../../foundation/http/request-chain.js'
import type { PolicyRulesPort } from '../../../foundation/policy/require-policy.js'
import {
  projectVisualListItem,
  projectVisualSessionResponse,
  type VisualDiagnosisListItem,
  type VisualDiagnosisSessionResponse
} from '../domain/visual-session-record.js'
import { decodeVisualListCursor, type MysqlVisualDiagnosisRepository, type VisualSqlContext } from '../repository/mysql-visual-diagnosis-repository.js'

/**
 * 取视觉诊断结果与历史（回放，diagnosis-visual-api.md §2.3）。
 *
 * 通俗说明：像订单详情和订单列表——只读本人的记录，直接返回当时保存的结构化结果，
 * 不会重新调用模型；他人的或不存在的一律 404（不区分），公开响应只有合同白名单字段。
 */

/** 读取用例依赖。 */
export interface ReadVisualDiagnosisDependencies {
  /** 在一条只读连接上执行。 */
  readonly withReadContext: <T>(work: (context: VisualSqlContext) => Promise<T>) => Promise<T>
  /** 视觉诊断仓储（只用到下列方法）。 */
  readonly repository: Pick<MysqlVisualDiagnosisRepository, 'readUserInternalId' | 'readOwnedSession' | 'listOwnedSessions'>
  /** 读取列表分页策略（user-plant/list_rules 的 timelinePageSize，与植物时间线同口径）。 */
  readonly readListRules: PolicyRulesPort<UserPlantListRules>
}

/** 历史列表响应。 */
export interface VisualDiagnosisListResponse {
  /** 本页诊断（按创建时间倒序）。 */
  readonly items: readonly VisualDiagnosisListItem[]
  /** 下一页游标；没有更多时省略。 */
  readonly nextCursor?: string
}

const notFound = () => new PublicRequestError(404, 'NOT_FOUND', '诊断不存在')

/** 创建读取用例。 */
export function createReadVisualDiagnosisUseCases(deps: ReadVisualDiagnosisDependencies) {
  return {
    /** 取单个诊断的状态与结果。 */
    get: async (input: { readonly principal: UserPrincipalDto; readonly visualDiagnosisRef: string }): Promise<VisualDiagnosisSessionResponse> => {
      const row = await deps.withReadContext(async context => {
        const userInternalId = await deps.repository.readUserInternalId(context, input.principal.user_id)
        return userInternalId === null
          ? null
          : deps.repository.readOwnedSession(context, { userInternalId, visualDiagnosisRef: input.visualDiagnosisRef })
      })
      if (row === null) {
        throw notFound()
      }
      return projectVisualSessionResponse(row)
    },
    /** 本人诊断历史；可按用户植物筛选。 */
    list: async (input: {
      readonly principal: UserPrincipalDto
      readonly userPlantRef: string | null
      readonly cursor: string | null
    }): Promise<VisualDiagnosisListResponse> => {
      if (input.cursor !== null && decodeVisualListCursor(input.cursor) === null) {
        throw new PublicRequestError(400, 'VALIDATION_FAILED', '分页游标不合法')
      }
      const rules = await deps.readListRules()
      if (rules === null) {
        throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')
      }
      const page = await deps.withReadContext(async context => {
        const userInternalId = await deps.repository.readUserInternalId(context, input.principal.user_id)
        return userInternalId === null
          ? { rows: [], nextCursor: null }
          : deps.repository.listOwnedSessions(context, {
              userInternalId,
              userPlantRef: input.userPlantRef,
              cursor: input.cursor,
              limit: rules.timelinePageSize.default
            })
      })
      return {
        items: page.rows.map(projectVisualListItem),
        ...(page.nextCursor === null ? {} : { nextCursor: page.nextCursor })
      }
    }
  }
}
