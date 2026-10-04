import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { lockQuestionPackageSnapshot } from '../../src/diagnosis/domain/question-package-snapshot.js'
import { createMysqlDiagnosisQuestionSnapshotRepository } from '../../src/diagnosis/repository/mysql-diagnosis-question-snapshot-repository.js'
import type { Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'

/** L1 / unit_fake：Expected来自快照合同；只替换mysql2连接，不证明实际SQL或归属记录。 */
const catalog = JSON.parse(readFileSync(join(findProjectRoot(),'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'),'utf8')) as { fixed:{ yellow_leaf:unknown[] } }
const locked = lockQuestionPackageSnapshot({questionPackageReleaseRef:'question-yellow/v1',mode:'yellow_leaf',questionCount:4,packageQuestions:catalog.fixed.yellow_leaf})
const value = { diagnosisRef:'diag-test',userRef:'usr-test',userPlantRef:'upl-test',snapshot:locked,startedAtMs:2000 }
function fixture() {
  const connection: Mysql2QueryConnection = {query:vi.fn().mockResolvedValue([]),execute:vi.fn().mockResolvedValue({affectedRows:1,insertId:1}),
    beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),destroy:vi.fn()}
  const getConnection = vi.fn(async()=>connection)
  return {connection,getConnection,repo:createMysqlDiagnosisQuestionSnapshotRepository({getConnection}),transaction:{transactionContext:true as const,connection}}
}
describe('题包快照Repository边界',()=>{
  test('写入绑定所有公开引用和完整快照，不拼接输入且不自行提交事务',async()=>{
    const f=fixture(); const injected={...value,diagnosisRef:"diag' --%"}
    expect(await f.repo.append(f.transaction,injected)).toBe('created')
    const calls=vi.mocked(f.connection.execute).mock.calls
    expect(calls[0]![0]).not.toContain(injected.diagnosisRef)
    expect(calls[0]![1][0]).toBe(injected.diagnosisRef)
    expect(calls[0]![1].slice(-3)).toEqual([locked.snapshotSha256,'usr-test','upl-test'])
    expect(f.getConnection).not.toHaveBeenCalled();expect(f.connection.commit).not.toHaveBeenCalled()
  })
  test.each([-1,NaN,9007199254740992])('非法时间在执行SQL前拒绝%#',async time=>{
    const f=fixture();await expect(f.repo.append(f.transaction,{...value,startedAtMs:time})).rejects.toThrow()
    expect(f.connection.execute).not.toHaveBeenCalled()
  })
  test('伪造摘要或公开引用在SQL前拒绝',async()=>{
    const f=fixture();await expect(f.repo.append(f.transaction,{...value,snapshot:{...locked,snapshotSha256:'a'.repeat(64)}})).rejects.toThrow()
    await expect(f.repo.append(f.transaction,{...value,userRef:''})).rejects.toThrow()
    expect(f.connection.execute).not.toHaveBeenCalled()
  })
  test('多行归属创建要求回滚，不把数据异常当成功',async()=>{
    const f=fixture();vi.mocked(f.connection.execute).mockResolvedValue({affectedRows:2,insertId:1})
    await expect(f.repo.append(f.transaction,value)).rejects.toThrow('必须回滚')
  })
  test('只读失败销毁连接并传播原错误，不当作不存在',async()=>{
    const f=fixture();const error=new Error('controlled read failure');vi.mocked(f.connection.query).mockRejectedValue(error)
    await expect(f.repo.read('usr-test','upl-test','diag-test')).rejects.toBe(error)
    expect(f.connection.destroy).toHaveBeenCalledOnce();expect(f.connection.release).not.toHaveBeenCalled()
  })
  test('技术主体或摘要配对损坏拒绝，成功空结果正常关闭连接',async()=>{
    const f=fixture()
    vi.mocked(f.connection.query).mockResolvedValue([{_openid:'platform-subject',question_package_snapshot_json:locked.snapshot,question_package_snapshot_sha256:locked.snapshotSha256,symptom_type:'yellow_leaf',question_package_release_ref:'question-yellow/v1'}])
    expect(await f.repo.read('usr-test','upl-test','diag-test')).toEqual({status:'invalid_snapshot'})
    vi.mocked(f.connection.query).mockResolvedValue([{_openid:'',question_package_snapshot_json:locked.snapshot,question_package_snapshot_sha256:null,symptom_type:'yellow_leaf',question_package_release_ref:'question-yellow/v1'}])
    expect(await f.repo.read('usr-test','upl-test','diag-test')).toEqual({status:'invalid_snapshot'})
    vi.mocked(f.connection.query).mockResolvedValue([])
    expect(await f.repo.read('usr-test','upl-test','diag-test')).toEqual({status:'not_found'})
    expect(f.connection.release).toHaveBeenCalledTimes(3)
  })
})
