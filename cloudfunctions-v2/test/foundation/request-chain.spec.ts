import { describe, expect, test } from 'vitest'

import {
  公开请求错误,
  执行请求链,
  type 请求链配置,
  type 请求链步骤,
  type 请求链审计事件
} from '../../src/foundation/http/request-chain.js'

type 测试主体 = {
  /** 测试使用的统一用户公开引用；不代表数据库内部主键。 */
  user_id: string
}

type 测试原始请求 = {
  /** 模拟已由 HTTP 适配器接收、尚未经过限制的正文。 */
  body: { action: string }
}

type 测试身份凭据 = {
  /** 原始令牌的不可逆摘要；这里只用于证明阶段间传值。 */
  tokenDigest: string
}

type 测试命令 = {
  /** 经 DTO 校验后进入应用层的操作名称。 */
  action: string
}

type 测试领域决策 = {
  /** 领域规则批准后得到的动作名称。 */
  approvedAction: string
}

type 测试持久化结果 = {
  /** Repository 读回后可用于构造公开 DTO 的高熵引用。 */
  publicRef: string
}

type 测试公开数据 = {
  /** 对外返回的用户植物高熵引用。 */
  userPlantRef: string
}

type 测试请求链配置 = 请求链配置<
  测试原始请求,
  { action: string },
  测试身份凭据,
  测试主体,
  { action: string },
  测试命令,
  测试领域决策,
  测试持久化结果,
  测试公开数据
>

const 成功状态码 = 200
const 参数错误状态码 = 400
const 身份错误状态码 = 401
const 资源不存在状态码 = 404

/** 创建一个记录执行顺序的真实请求链步骤包装器。 */
function 执行步骤<T输入, T输出>(
  名称: string,
  已执行步骤: string[],
  运行: (输入: T输入) => T输出 | Promise<T输出>
): 请求链步骤<T输入, T输出> {
  return {
    kind: 'execute',
    run: async 输入 => {
      已执行步骤.push(名称)
      return await 运行(输入)
    }
  }
}

/** 创建默认成功链；各假边界只暴露顺序和短路行为，不模拟数据库实现细节。 */
function 创建默认请求链(已执行步骤: string[], 审计事件: 请求链审计事件[] = []): 测试请求链配置 {
  return {
    原始请求: { body: { action: 'create' } },
    请求限制: 执行步骤<测试原始请求, { action: string }>('请求限制', 已执行步骤, 输入 => 输入.body),
    身份校验: 执行步骤<{ action: string }, 测试身份凭据>('身份校验', 已执行步骤, () => ({
      tokenDigest: 'digest'
    })),
    主体解析: 执行步骤<测试身份凭据, 测试主体>('主体解析', 已执行步骤, () => ({
      user_id: 'usr_test'
    })),
    对象归属: 执行步骤<{ request: { action: string }; principal: 测试主体 }, void>(
      '对象归属',
      已执行步骤,
      () => undefined
    ),
    DTO校验: 执行步骤<{ action: string }, { action: string }>('DTO校验', 已执行步骤, 正文 => 正文),
    构造命令: 执行步骤<{ dto: { action: string }; principal: 测试主体 }, 测试命令>(
      '构造命令',
      已执行步骤,
      ({ dto }) => ({ action: dto.action })
    ),
    领域规则: 执行步骤<{ command: 测试命令; principal: 测试主体 }, 测试领域决策>(
      '领域规则',
      已执行步骤,
      ({ command }) => ({ approvedAction: command.action })
    ),
    事务持久化: 执行步骤<{ domainDecision: 测试领域决策; principal: 测试主体 }, 测试持久化结果>(
      '事务持久化',
      已执行步骤,
      ({ domainDecision }) => ({
        publicRef: `upl_${domainDecision.approvedAction}`
      })
    ),
    公开响应: 执行步骤<测试持久化结果, 测试公开数据>('公开响应', 已执行步骤, 持久化结果 => ({
      userPlantRef: 持久化结果.publicRef
    })),
    写入审计: async (事件: 请求链审计事件) => {
      已执行步骤.push('写入审计')
      审计事件.push(事件)
    }
  }
}

/**
 * Expected 来源：`docs/backend-v2/contracts/http-api.md` 的固定处理顺序与公开错误合同。
 * 测试层次：L3 / `unit_fake`。真实执行请求链模块；身份、归属、DTO、领域和事务边界使用可观测假实现。
 * 明确未覆盖：真实 HTTP 字节读取、真实 MySQL 提交/回滚、CloudBase 身份验证和远端审计持久化。
 */
describe('后端 v2 公共 HTTP 请求链', () => {
  test('成功请求严格按固定顺序执行并只返回白名单 data', async () => {
    const 已执行步骤: string[] = []
    const 审计事件: 请求链审计事件[] = []

    const 配置: 测试请求链配置 = {
      原始请求: { body: { action: 'create' } },
      请求限制: 执行步骤<测试原始请求, { action: string }>(
        '请求限制',
        已执行步骤,
        输入 => 输入.body
      ),
      身份校验: 执行步骤<{ action: string }, 测试身份凭据>('身份校验', 已执行步骤, () => ({
        tokenDigest: 'digest'
      })),
      主体解析: 执行步骤<测试身份凭据, 测试主体>('主体解析', 已执行步骤, () => ({
        user_id: 'usr_test'
      })),
      对象归属: 执行步骤<{ request: { action: string }; principal: 测试主体 }, void>(
        '对象归属',
        已执行步骤,
        () => undefined
      ),
      DTO校验: 执行步骤<{ action: string }, { action: string }>(
        'DTO校验',
        已执行步骤,
        正文 => 正文
      ),
      构造命令: 执行步骤<{ dto: { action: string }; principal: 测试主体 }, 测试命令>(
        '构造命令',
        已执行步骤,
        ({ dto }) => ({ action: dto.action })
      ),
      领域规则: 执行步骤<{ command: 测试命令; principal: 测试主体 }, 测试领域决策>(
        '领域规则',
        已执行步骤,
        ({ command }) => ({ approvedAction: command.action })
      ),
      事务持久化: 执行步骤<{ domainDecision: 测试领域决策; principal: 测试主体 }, 测试持久化结果>(
        '事务持久化',
        已执行步骤,
        ({ domainDecision }) => ({
          publicRef: `upl_${domainDecision.approvedAction}`
        })
      ),
      公开响应: 执行步骤<测试持久化结果, 测试公开数据>('公开响应', 已执行步骤, 持久化结果 => ({
        userPlantRef: 持久化结果.publicRef
      })),
      写入审计: async 事件 => {
        已执行步骤.push('写入审计')
        审计事件.push(事件)
      }
    }
    const 结果 = await 执行请求链(配置)

    expect(结果).toEqual({
      status: 200,
      body: { data: { userPlantRef: 'upl_create' } }
    })
    expect(已执行步骤).toEqual([
      '请求限制',
      '身份校验',
      '主体解析',
      '对象归属',
      'DTO校验',
      '构造命令',
      '领域规则',
      '事务持久化',
      '公开响应',
      '写入审计'
    ])
    expect(审计事件).toEqual([{ outcome: 'allowed' }])
  })

  test('身份失败后立即停止且不进入主体、归属、DTO或业务步骤', async () => {
    const 已执行步骤: string[] = []

    const 结果 = await 执行请求链({
      ...创建默认请求链(已执行步骤),
      身份校验: 执行步骤('身份校验', 已执行步骤, () => {
        throw new 公开请求错误(身份错误状态码, 'PRINCIPAL_INVALID', '身份凭证无效')
      })
    })

    expect(结果).toEqual({
      status: 401,
      body: { error: { type: 'PRINCIPAL_INVALID', message: '身份凭证无效' } }
    })
    expect(已执行步骤).toEqual(['请求限制', '身份校验', '写入审计'])
  })

  test('对象不属于当前用户时统一返回 USER_PLANT_NOT_FOUND', async () => {
    const 已执行步骤: string[] = []

    const 结果 = await 执行请求链({
      ...创建默认请求链(已执行步骤),
      对象归属: 执行步骤<{ request: { action: string }; principal: 测试主体 }, void>(
        '对象归属',
        已执行步骤,
        () => {
          throw new 公开请求错误(资源不存在状态码, 'USER_PLANT_NOT_FOUND', '用户植物不存在')
        }
      )
    })

    expect(结果).toEqual({
      status: 404,
      body: { error: { type: 'USER_PLANT_NOT_FOUND', message: '用户植物不存在' } }
    })
    expect(已执行步骤).toEqual(['请求限制', '身份校验', '主体解析', '对象归属', '写入审计'])
  })

  test('DTO 校验失败后不构造命令或执行领域与事务', async () => {
    const 已执行步骤: string[] = []

    const 结果 = await 执行请求链({
      ...创建默认请求链(已执行步骤),
      DTO校验: 执行步骤('DTO校验', 已执行步骤, () => {
        throw new 公开请求错误(参数错误状态码, 'VALIDATION_FAILED', '请求参数不合法')
      })
    })

    expect(结果).toEqual({
      status: 400,
      body: { error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' } }
    })
    expect(已执行步骤).toEqual([
      '请求限制',
      '身份校验',
      '主体解析',
      '对象归属',
      'DTO校验',
      '写入审计'
    ])
  })

  test('未分类内部异常只返回泛化错误且审计内容不携带原始异常', async () => {
    const 已执行步骤: string[] = []
    const 审计事件: 请求链审计事件[] = []

    const 结果 = await 执行请求链({
      ...创建默认请求链(已执行步骤, 审计事件),
      事务持久化: 执行步骤<{ domainDecision: 测试领域决策; principal: 测试主体 }, 测试持久化结果>(
        '事务持久化',
        已执行步骤,
        () => {
          throw new Error('mysql password=super-secret')
        }
      )
    })

    expect(结果).toEqual({
      status: 500,
      body: { error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' } }
    })
    expect(JSON.stringify(结果)).not.toContain('super-secret')
    expect(审计事件).toEqual([{ outcome: 'failed', errorType: 'INTERNAL_ERROR' }])
    expect(JSON.stringify(审计事件)).not.toContain('super-secret')
  })

  test('不需要对象归属校验的路由必须显式声明中文原因', async () => {
    const 已执行步骤: string[] = []

    const 结果 = await 执行请求链({
      ...创建默认请求链(已执行步骤),
      对象归属: {
        kind: 'not_applicable',
        reason: '该公开查询不读取任何用户植物对象'
      }
    })

    expect(结果.status).toBe(成功状态码)
    expect(已执行步骤).toEqual([
      '请求限制',
      '身份校验',
      '主体解析',
      'DTO校验',
      '构造命令',
      '领域规则',
      '事务持久化',
      '公开响应',
      '写入审计'
    ])
  })

  test('非适用步骤缺少可审计原因时失败关闭', async () => {
    const 已执行步骤: string[] = []
    const 非法步骤 = { kind: 'not_applicable', reason: '' } as 请求链步骤<unknown, void>

    const 结果 = await 执行请求链({
      ...创建默认请求链(已执行步骤),
      对象归属: 非法步骤
    })

    expect(结果).toEqual({
      status: 500,
      body: { error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' } }
    })
    expect(已执行步骤).toEqual(['请求限制', '身份校验', '主体解析', '写入审计'])
  })
})
