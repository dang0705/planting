import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlDiagnosisQuestionSnapshotRepository } from '../../src/diagnosis/repository/mysql-diagnosis-question-snapshot-repository.js'
import { createHash } from 'node:crypto'
import { createIdempotentDiagnosisAnswerService, calculateDiagnosisAnswerRequestHash } from '../../src/diagnosis/application/idempotent-diagnosis-answers.js'
import { submitDiagnosisAnswersInTransaction, type SubmitDiagnosisAnswersInput } from '../../src/diagnosis/application/submit-diagnosis-answers.js'
import { createMysqlHttpIdempotencyRepository, createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository, type HttpIdempotencySqlRow } from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'
import { toSqlParameters, withReadConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { createSubmitDiagnosisAnswersService } from '../../src/diagnosis/application/submit-diagnosis-answers.js'
import { createMysqlDiagnosisAnswerRepository } from '../../src/diagnosis/repository/mysql-diagnosis-answer-repository.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
import { lockQuestionPackageSnapshot } from '../../src/diagnosis/domain/question-package-snapshot.js'

/** unit_real_data / L3：真实MySQL8.4、指定会话表和019迁移；父归属表为最小夹具，不验收完整建库链或HTTP。 */
const container = `qhz-diag-snapshot-${process.pid}`
let db: Connection
let source: ReturnType<typeof createMysql2ConnectionSource>
const root = findProjectRoot()
const catalog = JSON.parse(readFileSync(join(root, 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'), 'utf8')) as {
  fixed: { yellow_leaf: unknown[] }
}
const snapshotInput = { questionPackageReleaseRef: 'question-yellow/v1', mode: 'yellow_leaf', questionCount: 4, packageQuestions: catalog.fixed.yellow_leaf }
function docker(args: string[]) {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.status !== 0) { throw new Error(result.stderr) }
  return result.stdout.trim()
}
beforeAll(async () => {
  docker(['run','-d','--name',container,'--tmpfs','/var/lib/mysql','-p','127.0.0.1::3306','-e','MYSQL_ALLOW_EMPTY_PASSWORD=yes','mysql:8.4'])
  const port = Number(docker(['port',container,'3306/tcp']).split(':').at(-1))
  let ready = false
  for (let i = 0; i < 100; i += 1) {
    try {
      db = await createConnection({ host:'127.0.0.1',port,user:'root',password:'' })
      await db.query('SELECT 1'); ready = true; break
    } catch { await db?.end().catch(() => undefined); await new Promise(r => setTimeout(r,250)) }
  }
  if (!ready) { throw new Error('隔离MySQL未就绪') }
  await db.query('CREATE DATABASE qhz_diag_snapshot'); await db.query('USE qhz_diag_snapshot')
  await db.query('CREATE TABLE users (id BIGINT UNSIGNED PRIMARY KEY, public_user_id VARCHAR(64), status VARCHAR(24))')
  await db.query('CREATE TABLE user_plants (id BIGINT UNSIGNED PRIMARY KEY, user_internal_id BIGINT UNSIGNED, public_user_plant_id VARCHAR(64), lifecycle_status VARCHAR(24), UNIQUE(user_internal_id,id))')
  await db.query('CREATE TABLE guest_plant_cases (id BIGINT UNSIGNED PRIMARY KEY)')
  await db.query('CREATE TABLE authenticated_ephemeral_plant_cases (id BIGINT UNSIGNED PRIMARY KEY)')
  const ddl = readFileSync(join(root,'docs/backend-v2/schema/004_care_diagnosis.sql'),'utf8')
  for (const name of ['diagnosis_sessions','temporary_diagnosis_sessions','diagnosis_answers']) {
    const start = ddl.indexOf('CREATE TABLE `'+name+'` ('); const end = ddl.indexOf(';',start)
    if (start < 0 || end < 0) { throw new Error('指定会话表缺失') }
    await db.query(ddl.slice(start,end+1))
  }
  const ephemeralMigration = readFileSync(join(root,'docs/backend-v2/schema/017_care_v2_ephemeral_and_derivations.sql'),'utf8')
  const ephemeralStart = ephemeralMigration.indexOf('ALTER TABLE `temporary_diagnosis_sessions`')
  if (ephemeralStart < 0) { throw new Error('指定临时会话归属迁移缺失') }
  await db.query(ephemeralMigration.slice(ephemeralStart,ephemeralMigration.indexOf(';',ephemeralStart)+1))
  await db.query("INSERT INTO users VALUES (1,'usr-owner','active'),(2,'usr-other','active');")
  await db.query("INSERT INTO user_plants VALUES (1,1,'upl-owner','active'),(2,2,'upl-other','active'),(3,1,'upl-archived','archived');")
  await db.query("INSERT INTO diagnosis_sessions (diagnosis_ref,user_internal_id,user_plant_internal_id,symptom_type,question_package_release_ref,status,started_at_ms,created_at_ms,updated_at_ms) VALUES ('legacy',1,1,'yellow_leaf','question-yellow/v1','active',1000,1000,1000)")
  const migration = readFileSync(join(root,'docs/backend-v2/schema/019_diagnosis_question_package_snapshots.sql'),'utf8')
  // 仅执行019明确列出的语句；DELIMITER由客户端解释，不能当SQL发送。
  const [tables, triggers] = migration.split('DELIMITER $$')
  for (const statement of tables!.split(';').map(s=>s.trim()).filter(Boolean)) { await db.query(statement) }
  for (const statement of triggers!.split('DELIMITER ;')[0]!.split('$$').map(s=>s.trim()).filter(Boolean)) { await db.query(statement) }
  const foundationDdl=readFileSync(join(root,'docs/backend-v2/schema/008_foundation.sql'),'utf8')
  const idempotencyStart=foundationDdl.indexOf('CREATE TABLE `http_idempotency_records` (')
  if(idempotencyStart<0) {throw new Error('共享幂等表缺失')}
  await db.query(foundationDdl.slice(idempotencyStart,foundationDdl.indexOf(';',idempotencyStart)+1))
  source = createMysql2ConnectionSource({ host:'127.0.0.1',port,user:'root',password:'',database:'qhz_diag_snapshot' })
},40_000)
afterAll(async () => { await db?.end(); spawnSync('docker',['rm','-f',container],{encoding:'utf8'}) })

async function append(diagnosisRef: string, userRef = 'usr-owner', userPlantRef = 'upl-owner') {
  const connection = await source.getConnection(); await connection.beginTransaction()
  try {
    const result = await createMysqlDiagnosisQuestionSnapshotRepository(source).append({ transactionContext:true,connection }, {
      diagnosisRef,userRef,userPlantRef,snapshot:lockQuestionPackageSnapshot(snapshotInput),startedAtMs:2000,
    })
    await connection.commit(); return result
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

describe('真实数据库锁定题包快照', () => {
  test('旧行计数保持，缺快照不补当前题包', async () => {
    const [rows] = await db.query('SELECT COUNT(*) AS n FROM diagnosis_sessions WHERE diagnosis_ref=\'legacy\' AND question_package_snapshot_json IS NULL AND question_package_snapshot_sha256 IS NULL')
    expect(rows).toEqual([{ n:1 }])
    expect(await createMysqlDiagnosisQuestionSnapshotRepository(source).read('usr-owner','upl-owner','legacy')).toEqual({ status:'missing_snapshot' })
  })
  test('真实创建与读回完整快照、摘要和版本，公开读取不返回内部主键', async () => {
    expect(await append('snapshot-one')).toBe('created')
    expect(await createMysqlDiagnosisQuestionSnapshotRepository(source).read('usr-owner','upl-owner','snapshot-one')).toEqual({ status:'found',snapshot:lockQuestionPackageSnapshot(snapshotInput) })
  })
  test('跨用户、跨植物与归档植物不能新建或读回他人题包', async () => {
    await append('snapshot-owner-check')
    expect(await append('wrong-owner','usr-other','upl-owner')).toBe('not_found')
    expect(await append('archived','usr-owner','upl-archived')).toBe('not_found')
    const repo = createMysqlDiagnosisQuestionSnapshotRepository(source)
    expect(await repo.read('usr-other','upl-owner','snapshot-owner-check')).toEqual({ status:'not_found' })
    expect(await repo.read('usr-owner','upl-other','snapshot-owner-check')).toEqual({ status:'not_found' })
  })
  test('拒绝重复创建，原快照不被覆盖', async () => {
    await append('snapshot-duplicate')
    await expect(append('snapshot-duplicate')).rejects.toMatchObject({ code:'ER_DUP_ENTRY' })
    expect((await createMysqlDiagnosisQuestionSnapshotRepository(source).read('usr-owner','upl-owner','snapshot-duplicate')).status).toBe('found')
  })
  test('SQL拒绝改写题目、摘要、发布引用和症状，但允许状态推进', async () => {
    await append('snapshot-protected')
    for (const sql of ["question_package_snapshot_json=JSON_OBJECT()", "question_package_snapshot_sha256=REPEAT('b',64)", "question_package_release_ref='other'", "symptom_type='wilting_droop'", "user_internal_id=2,user_plant_internal_id=2"]) {
      await expect(db.query(`UPDATE diagnosis_sessions SET ${sql} WHERE diagnosis_ref='snapshot-protected'`)).rejects.toMatchObject({ sqlState:'45000' })
    }
    await db.query("UPDATE diagnosis_sessions SET status='completed',completed_at_ms=3000,updated_at_ms=3000 WHERE diagnosis_ref='snapshot-protected'")
  })
  test('临时会话同样拒绝快照替换；没有快照的新会话被拒绝', async () => {
    await db.query('INSERT INTO guest_plant_cases VALUES (1),(2)')
    await db.query('INSERT INTO authenticated_ephemeral_plant_cases VALUES (1)')
    const locked = lockQuestionPackageSnapshot(snapshotInput)
    await db.execute('INSERT INTO temporary_diagnosis_sessions (diagnosis_ref,guest_plant_case_internal_id,symptom_type,question_package_release_ref,status,expires_at_ms,created_at_ms,updated_at_ms,question_package_snapshot_json,question_package_snapshot_sha256) VALUES (?,1,?,?,\'active\',4000,2000,2000,CAST(? AS JSON),?)', ['tmp-one','yellow_leaf','question-yellow/v1',JSON.stringify(locked.snapshot),locked.snapshotSha256])
    await expect(db.query("UPDATE temporary_diagnosis_sessions SET question_package_snapshot_json=JSON_OBJECT() WHERE diagnosis_ref='tmp-one'")).rejects.toMatchObject({ sqlState:'45000' })
    await expect(db.query("UPDATE temporary_diagnosis_sessions SET guest_plant_case_internal_id=2 WHERE diagnosis_ref='tmp-one'")).rejects.toMatchObject({ sqlState:'45000' })
    await expect(db.query("UPDATE temporary_diagnosis_sessions SET guest_plant_case_internal_id=NULL,authenticated_ephemeral_case_internal_id=1 WHERE diagnosis_ref='tmp-one'")).rejects.toMatchObject({ sqlState:'45000' })
    await expect(db.query("INSERT INTO diagnosis_sessions (diagnosis_ref,user_internal_id,user_plant_internal_id,symptom_type,question_package_release_ref,status,started_at_ms,created_at_ms,updated_at_ms) VALUES ('new-without-snapshot',1,1,'yellow_leaf','question-yellow/v1','active',1000,1000,1000)")).rejects.toMatchObject({ sqlState:'45000' })
  })
  test('损坏内容摘要在实际Repository读取时拒绝，不靠字段存在判成功', async () => {
    const connection = await source.getConnection()
    const locked = lockQuestionPackageSnapshot(snapshotInput)
    try {
      await connection.execute('INSERT INTO diagnosis_sessions (diagnosis_ref,user_internal_id,user_plant_internal_id,symptom_type,question_package_release_ref,status,started_at_ms,created_at_ms,updated_at_ms,question_package_snapshot_json,question_package_snapshot_sha256) VALUES (?,1,1,?,?,\'active\',2000,2000,2000,CAST(? AS JSON),?)',['bad-hash','yellow_leaf','question-yellow/v1',JSON.stringify(locked.snapshot),'a'.repeat(64)])
    } finally { connection.release() }
    expect(await createMysqlDiagnosisQuestionSnapshotRepository(source).read('usr-owner','upl-owner','bad-hash')).toEqual({ status:'invalid_snapshot' })
  })
})

/** 真实MySQL：原归属会话→锁定题包→整包证据→整包SQL追加→读回；不验收HTTP/CMS或完整迁移链。 */
function answerInput(diagnosisRef:string) {
  const questions=catalog.fixed.yellow_leaf as {questionKey:string;options:{optionKey:string}[]}[]
  return {userRef:'usr-owner',userPlantRef:'upl-owner',diagnosisRef,occurredAtMs:2500,
    submitted:{requestMode:'answer_submit',answers:questions.map(q=>({questionKey:q.questionKey,
      optionKey:q.options.find(option=>option.optionKey==='air_environment_unknown')?.optionKey??q.options[0]!.optionKey}))}}
}
function answerService() {
  return createSubmitDiagnosisAnswersService({driver:createMysqlTransactionDriver(source,()=>undefined),repository:createMysqlDiagnosisAnswerRepository()})
}
async function answerCount(ref:string) {
  const [rows]=await db.execute('SELECT COUNT(*) AS n FROM diagnosis_answers a JOIN diagnosis_sessions s ON s.id=a.diagnosis_session_internal_id WHERE s.diagnosis_ref=?',[ref])
  return (rows as {n:number}[])[0]!.n
}
describe('真实数据库整包答案保存',()=>{
  test('首次四题持久化读回，相同重放不新增；不同答案不能覆盖',async()=>{
    await append('answers-once');const run=answerService();const input=answerInput('answers-once')
    expect(await run(input)).toEqual({status:'recorded',answerCount:4})
    expect(await run({...input,occurredAtMs:2600})).toEqual({status:'replayed',answerCount:4})
    const changed=structuredClone(input);changed.submitted.answers[0]!.optionKey='often_wet'
    expect(await run(changed)).toEqual({status:'conflict'});expect(await answerCount('answers-once')).toBe(4)
  })
  test('真实并发整包提交只有一个首次写入，另一个读回重放',async()=>{
    await append('answers-concurrent');const run=answerService();const input=answerInput('answers-concurrent')
    const results=await Promise.all([run(input),run(input)])
    expect(results.map(r=>r.status).sort()).toEqual(['recorded','replayed']);expect(await answerCount('answers-concurrent')).toBe(4)
  })
  test('跨用户或跨植物拒绝，不新增答案；归档植物拒绝',async()=>{
    await append('answers-owner');const run=answerService();const input=answerInput('answers-owner')
    expect(await run({...input,userRef:'usr-other'})).toEqual({status:'not_found'})
    expect(await run({...input,userPlantRef:'upl-other'})).toEqual({status:'not_found'})
    expect(await run({...input,diagnosisRef:"' OR '1'='1"})).toEqual({status:'not_found'})
    await db.query("UPDATE user_plants SET lifecycle_status='archived' WHERE id=1")
    try {expect(await run(input)).toEqual({status:'not_found'})}
    finally {await db.query("UPDATE user_plants SET lifecycle_status='active' WHERE id=1")}
    expect(await answerCount('answers-owner')).toBe(0)
  })
  test('复合证据缺失时零写入，旧会话缺快照也不能生成答案',async()=>{
    await append('answers-invalid');const run=answerService();const input=answerInput('answers-invalid')
    input.submitted.answers[0]!.optionKey='care_behavior_timeline'
    expect(await run(input)).toEqual({status:'invalid_timeline_evidence'});expect(await answerCount('answers-invalid')).toBe(0)
    expect(await run(answerInput('legacy'))).toEqual({status:'missing_snapshot'})
  })
  test('真实插入后发生错误时回滚四题，不留下部分答案或伪报已保存',async()=>{
    await append('answers-rollback');const actual=createMysqlDiagnosisAnswerRepository()
    const repo={...actual,appendAnswers:async(...args:Parameters<typeof actual.appendAnswers>)=>{await actual.appendAnswers(...args);throw new Error('写入后失败探针')}}
    const run=createSubmitDiagnosisAnswersService({driver:createMysqlTransactionDriver(source,()=>undefined),repository:repo})
    await expect(run(answerInput('answers-rollback'))).rejects.toThrow('写入后失败探针')
    expect(await answerCount('answers-rollback')).toBe(0)
  })
  test('已完成会话不允许首次写入；损坏正文不能仅凭摘要重放',async()=>{
    await append('answers-completed');await db.execute("UPDATE diagnosis_sessions SET status='completed' WHERE diagnosis_ref=?",['answers-completed'])
    expect(await answerService()(answerInput('answers-completed'))).toEqual({status:'session_not_active'})
    await append('answers-corrupt');const run=answerService();const input=answerInput('answers-corrupt');await run(input)
    await db.execute("UPDATE diagnosis_answers a JOIN diagnosis_sessions s ON s.id=a.diagnosis_session_internal_id SET a.answer_json=JSON_OBJECT('bad',TRUE) WHERE s.diagnosis_ref=?",['answers-corrupt'])
    expect(await run(input)).toEqual({status:'conflict'})
  })
})

/** 真MySQL共享账本；响应只是已注明的协议制品，不代表正式诊断HTTP DTO。 */
function idempotentInput(ref:string,key:string) {
  const input=answerInput(ref)
  return {...input,idempotency:{principalType:'user' as const,principalScopeHash:createHash('sha256').update(input.userRef).digest('hex'),
    httpMethod:'POST',normalizedPath:'/api/v2/diagnosis/sessions/{diagnosisSessionRef}/answers',operationId:'answerDiagnosisQuestion',
    idempotencyKeyHash:createHash('sha256').update(key).digest('hex'),requestHash:calculateDiagnosisAnswerRequestHash(input),createdAtMs:2500,expiresAtMs:5000}}
}
function idempotentDependencies() {
  const driver=createMysqlTransactionDriver(source,()=>undefined)
  const ledger=createMysqlHttpIdempotencyRepository<Parameters<ReturnType<typeof createMysqlDiagnosisAnswerRepository>['lockOwned']>[0]>({
    executeQuery:(tx,sql,params)=>tx.connection.query(sql,toSqlParameters(params)) as unknown as Promise<readonly HttpIdempotencySqlRow[]>,
    executeWrite:(tx,sql,params)=>tx.connection.execute(sql,toSqlParameters(params))})
  const readOnly=createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository({executeQuery:(sql,params)=>withReadConnection(source,
    conn=>conn.query(sql,toSqlParameters(params))) as unknown as Promise<readonly HttpIdempotencySqlRow[]>})
  return {driver,idempotencyRepository:ledger,commitUnknownRepository:readOnly,
    submitInTransaction:(tx:Parameters<ReturnType<typeof createMysqlDiagnosisAnswerRepository>['lockOwned']>[0],input:SubmitDiagnosisAnswersInput)=>submitDiagnosisAnswersInTransaction(createMysqlDiagnosisAnswerRepository(),tx,input),
    projectPublicResponse:(result:{status:string})=>result.status==='recorded'||result.status==='replayed'
      ?{status:200,body:{data:{answersAccepted:true}}}:{status:400,body:{error:{type:'VALIDATION_FAILED',message:'答案无法保存'}}}}
}
describe('真实共享幂等与答案同事务',()=>{
  test('同键首次和重放响应完全一致；异参冲突，答案只保存四行',async()=>{
    await append('ledger-once');const run=createIdempotentDiagnosisAnswerService(idempotentDependencies());const input=idempotentInput('ledger-once','ledger-once')
    const first=await run(input);expect(first.status).toBe(200);expect(await run(input)).toEqual(first)
    const changed=structuredClone(input);changed.submitted.answers[0]!.optionKey='often_wet';changed.idempotency.requestHash=calculateDiagnosisAnswerRequestHash(changed)
    expect((await run(changed)).status).toBe(409);expect(await answerCount('ledger-once')).toBe(4)
  })
  test('同键真实并发共享首次结果，领域工作只执行一次',async()=>{
    await append('ledger-concurrent');const deps=idempotentDependencies();let calls=0
    const run=createIdempotentDiagnosisAnswerService({...deps,submitInTransaction:async(tx,input)=>{calls+=1;return deps.submitInTransaction(tx,input)}})
    const input=idempotentInput('ledger-concurrent','ledger-concurrent');const results=await Promise.all([run(input),run(input)])
    expect(results[0]).toEqual(results[1]);expect(results[0]!.status).toBe(200);expect(calls).toBe(1);expect(await answerCount('ledger-concurrent')).toBe(4)
  })
  test('幂等完成后抛错仍回滚业务和账本，不保留processing记录',async()=>{
    await append('ledger-rollback');const deps=idempotentDependencies();const original=deps.idempotencyRepository.completionFirstResult
    const failingLedger={...deps.idempotencyRepository,completionFirstResult:async(...args:Parameters<typeof original>)=>{await original(...args);throw new Error('账本完成后失败')}}
    const input=idempotentInput('ledger-rollback','ledger-rollback');expect((await createIdempotentDiagnosisAnswerService({...deps,idempotencyRepository:failingLedger})(input)).status).toBe(503)
    expect(await answerCount('ledger-rollback')).toBe(0)
    const [rows]=await db.execute('SELECT COUNT(*) AS n FROM http_idempotency_records WHERE idempotency_key_hash=?',[input.idempotency.idempotencyKeyHash]);expect(rows).toEqual([{n:0}])
  })
  test('真实COMMIT后丢失确认，使用新连接读回首次结果而不重新执行',async()=>{
    await append('ledger-unknown');const deps=idempotentDependencies();const original=deps.driver.commitTransaction;let calls=0
    const run=createIdempotentDiagnosisAnswerService({...deps,driver:{...deps.driver,commitTransaction:async tx=>{await original(tx);throw new DatabaseCommitResultUnknownError('已提交但确认丢失')}},
      submitInTransaction:async(tx,input)=>{calls+=1;return deps.submitInTransaction(tx,input)}})
    expect((await run(idempotentInput('ledger-unknown','ledger-unknown'))).status).toBe(200)
    expect(calls).toBe(1);expect(await answerCount('ledger-unknown')).toBe(4)
  })
})
