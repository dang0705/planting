/**
 * Repository 可以接收、但应用层不能自行构造的事务执行上下文。
 * 具体 MySQL 适配器可以在交叉类型中追加受控连接引用，业务代码不得读取连接细节。
 */
export type 事务执行上下文 = {
  /** 标记该对象来自事务驱动，防止把普通对象误当成受控事务上下文。 */
  readonly transactionContext: true
}

/** 回滚失败时交给结构化日志或告警适配器的内部事件。 */
export type 回滚失败事件<T事务 extends 事务执行上下文> = {
  /** 当前发生回滚失败的事务上下文；不得进入公开响应。 */
  transaction: T事务
  /** 最初触发回滚的业务或提交异常。 */
  originalError: unknown
  /** 数据库驱动在回滚时抛出的异常。 */
  rollbackError: unknown
}

/**
 * 数据库适配器必须实现的最小事务驱动。
 *
 * Foundation 只编排生命周期，不向应用层暴露 SQL、连接池或驱动私有对象。
 */
export type 数据库事务驱动<T事务 extends 事务执行上下文> = {
  /** 从受控连接池开始一个新事务；失败时不得执行回调。 */
  开始事务: () => T事务 | Promise<T事务>
  /** 提交当前事务；提交失败会进入回滚尝试。 */
  提交事务: (事务: T事务) => void | Promise<void>
  /** 回滚当前事务；不得对尚未成功开始的事务调用。 */
  回滚事务: (事务: T事务) => void | Promise<void>
  /** 记录回滚失败的内部可观测事件；禁止把原始错误写入公开响应。 */
  记录回滚失败: (事件: 回滚失败事件<T事务>) => void | Promise<void>
}

/**
 * 在唯一事务生命周期内执行 Repository 工作。
 *
 * 成功只提交一次；业务或提交失败都会尝试回滚。回滚失败会被单独记录，但不会覆盖
 * 最初异常，使上层可以稳定映射和重试最先发生的失败。
 */
export async function 执行数据库事务<T事务 extends 事务执行上下文, T结果>(
  驱动: 数据库事务驱动<T事务>,
  工作: (事务: T事务) => T结果 | Promise<T结果>
): Promise<T结果> {
  const 事务 = await 驱动.开始事务()

  try {
    const 结果 = await 工作(事务)
    await 驱动.提交事务(事务)
    return 结果
  } catch (原始错误: unknown) {
    try {
      await 驱动.回滚事务(事务)
    } catch (回滚错误: unknown) {
      await 驱动.记录回滚失败({
        transaction: 事务,
        originalError: 原始错误,
        rollbackError: 回滚错误
      })
    }
    throw 原始错误
  }
}
