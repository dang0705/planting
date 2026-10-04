import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { serializeCanonicalJson, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import { lockMeasuredPotProfile, type MeasuredPotProfile } from '../domain/measured-pot-profile.js'

/** 调用方已验真的内部档案保存命令，不能直接作为公开请求体。 */
export interface MeasuredProfileSaveInput {
  /** identity解析的统一用户公开引用。 */ readonly userRef: string
  /** 用户明确编辑的既有植物公开引用。 */ readonly userPlantRef: string
  /** 用户读取时的聚合版本，控制所有档案编辑并发。 */ readonly expectedVersion: number
  /** 昵称原文，空字符串明确清除；物理容量为80个Unicode码点。 */ readonly nickname: string
  /** 已确认或明确未知的完整测量子结构。 */ readonly measuredPot: MeasuredPotProfile
  /** 上游已锁定完整度策略版本，本层不猜默认或发布策略。 */ readonly profileVersion: string
  /** 服务端UTC毫秒，不接受客户端时间。 */ readonly occurredAtMs: number
}
/** 仅为内部保存读回，不包含数据库内部键或其余受限档案。 */
export type MeasuredProfileSaveResult =
  | {
      /** 对象不归属、旧版本冲突或存储记录损坏时的内部拒绝类别。 */
      readonly status: 'not_found' | 'version_conflict' | 'unavailable'
    }
  | {
      /** 本次写入和读回一致；调用方仍需完成幂等记录并提交事务。 */ readonly status: 'saved'
      /** 原用户植物引用。 */ readonly userPlantRef: string
      /** 新聚合版本，不是子表版本。 */ readonly version: number
      /** 本次实际保存并经同事务读回核对的昵称原文。 */ readonly nickname: string
      /** 已保存的冻结测量事实。 */ readonly measuredPot: Readonly<MeasuredPotProfile>
    }
const maximumVersion = 4294967295
/** SQL无符号版本容量与服务端毫秒的无损交集检查。 */
function integer(value: unknown, maximum = 8640000000000000): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum
}
/** BIGINT时间列以字符串读取，拒绝宽松数字转换。 */
function time(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) { return null }
  const result = Number(value)
  return integer(result) ? result : null
}
/** 只验证原JSON可保留，不按任意非空对象推定完整档案。 */
function jsonObject(value: unknown): Record<string, CanonicalJsonValue> {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('档案盆器JSON不是对象')
  }
  return JSON.parse(serializeCanonicalJson(parsed as CanonicalJsonValue)) as Record<string, CanonicalJsonValue>
}
/** 在首次异步数据库读取前锁定输入，拒绝客户端扩展内部命令字段。 */
export function lockMeasuredProfileSaveInput(input: unknown): Readonly<MeasuredProfileSaveInput> {
  const value = JSON.parse(serializeCanonicalJson(input as CanonicalJsonValue)) as MeasuredProfileSaveInput
  const fields = ['userRef', 'userPlantRef', 'expectedVersion', 'nickname', 'measuredPot', 'profileVersion', 'occurredAtMs']
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length || Object.keys(value).some(k => !fields.includes(k))
    || typeof value.userRef !== 'string' || !/^usr_[A-Za-z0-9_-]{8,}$/u.test(value.userRef) || value.userRef.length > 64
    || typeof value.userPlantRef !== 'string' || !/^upl_[A-Za-z0-9_-]{8,}$/u.test(value.userPlantRef) || value.userPlantRef.length > 64
    || !integer(value.expectedVersion, maximumVersion) || value.expectedVersion === 0
    || typeof value.nickname !== 'string' || [...value.nickname].length > 80
    || typeof value.profileVersion !== 'string' || !/\S/u.test(value.profileVersion) || value.profileVersion.trim() !== value.profileVersion || [...value.profileVersion].length > 32
    || !integer(value.occurredAtMs)) {
    throw new TypeError('内部档案保存命令不满足归属引用、版本、昵称或策略合同')
  }
  return Object.freeze({ ...value, measuredPot: lockMeasuredPotProfile(value.measuredPot) })
}

/** 昵称/测量事实专属SQL入口，只在同一显式事务内修改既有聚合，不自行提交或重试。 */
export function createMysqlMeasuredProfileRepository() {
  return {
    /** 归属锁→旧版本检查→局部保存→新版本读回，异常须由外层驱动整体回滚。 */
    async save(tx: MysqlTransactionContext<Mysql2QueryConnection>, input: unknown): Promise<MeasuredProfileSaveResult> {
      const command = lockMeasuredProfileSaveInput(input)
      if (tx.transactionContext !== true || !tx.connection) { throw new TypeError('档案保存需要显式事务') }
      const c = tx.connection
      const rows = await c.query(`SELECT CAST(p.id AS CHAR) AS plant_id,CAST(u.id AS CHAR) AS user_id,
        p.version,CAST(p.updated_at_ms AS CHAR) AS updated_at_ms
        FROM users u JOIN user_plants p ON p.user_internal_id=u.id
        WHERE BINARY u.public_user_id=BINARY ? AND BINARY p.public_user_plant_id=BINARY ?
        AND u.status='active' AND u._openid='' AND p._openid=''
        AND p.lifecycle_status IN ('active','archived') FOR UPDATE`, [command.userRef, command.userPlantRef])
      if (rows.length === 0) { return { status: 'not_found' } }
      if (rows.length !== 1) { return { status: 'unavailable' } }
      const p = rows[0]!, lastTime = time(p.updated_at_ms)
      if (typeof p.plant_id !== 'string' || !/^[1-9][0-9]*$/u.test(p.plant_id)
        || typeof p.user_id !== 'string' || !/^[1-9][0-9]*$/u.test(p.user_id)
        || !integer(p.version, maximumVersion) || p.version === 0 || lastTime === null) { return { status: 'unavailable' } }
      if (p.version !== command.expectedVersion || p.version === maximumVersion) { return { status: 'version_conflict' } }
      if (command.occurredAtMs < lastTime) { throw new RangeError('档案时间不能早于已有聚合更新') }
      const profiles = await c.query(`SELECT nickname,pot_profile_json,profile_completeness_version,
        CAST(profile_completed_at_ms AS CHAR) AS profile_completed_at_ms,version,
        CAST(created_at_ms AS CHAR) AS created_at_ms,CAST(updated_at_ms AS CHAR) AS updated_at_ms,_openid
        FROM user_plant_profiles WHERE user_internal_id=? AND user_plant_internal_id=? FOR UPDATE`, [p.user_id, p.plant_id])
      if (profiles.length > 1) { return { status: 'unavailable' } }
      if (profiles.length === 1) {
        const old = profiles[0]!, created = time(old.created_at_ms), updated = time(old.updated_at_ms)
        if (old._openid !== '' || typeof old.nickname !== 'string' || [...old.nickname].length > 80
          || !integer(old.version, maximumVersion) || old.version === 0 || old.version === maximumVersion
          || typeof old.profile_completeness_version !== 'string' || !/\S/u.test(old.profile_completeness_version)
          || created === null || updated === null || updated < created || command.occurredAtMs < updated
          || (old.profile_completed_at_ms !== null && time(old.profile_completed_at_ms) === null)) { return { status: 'unavailable' } }
        try { jsonObject(old.pot_profile_json) } catch { return { status: 'unavailable' } }
      }
      const changed = await c.execute(`UPDATE user_plants SET version=version+1,updated_at_ms=?
        WHERE id=? AND user_internal_id=? AND version=?`, [command.occurredAtMs, p.plant_id, p.user_id, command.expectedVersion])
      if (changed.affectedRows !== 1) { throw new Error('档案聚合版本写入未确定') }
      const potJson = serializeCanonicalJson(command.measuredPot as unknown as CanonicalJsonValue)
      const saved = profiles.length === 0
        ? await c.execute(`INSERT INTO user_plant_profiles(user_internal_id,user_plant_internal_id,nickname,
            pot_profile_json,profile_completeness_version,profile_completed_at_ms,version,created_at_ms,updated_at_ms)
            VALUES(?,?,?,JSON_OBJECT('measuredPot',CAST(? AS JSON)),?,NULL,1,?,?)`,
          [p.user_id, p.plant_id, command.nickname, potJson, command.profileVersion, command.occurredAtMs, command.occurredAtMs])
        : await c.execute(`UPDATE user_plant_profiles SET nickname=?,pot_profile_json=JSON_SET(pot_profile_json,'$.measuredPot',CAST(? AS JSON)),
            version=version+1,updated_at_ms=? WHERE user_internal_id=? AND user_plant_internal_id=?`,
          [command.nickname, potJson, command.occurredAtMs, p.user_id, p.plant_id])
      if (saved.affectedRows !== 1) { throw new Error('档案事实写入未确定') }
      const readback = await c.query(`SELECT f.nickname,f.pot_profile_json,p.version
        FROM user_plant_profiles f JOIN user_plants p ON p.id=f.user_plant_internal_id AND p.user_internal_id=f.user_internal_id
        WHERE f.user_internal_id=? AND f.user_plant_internal_id=? FOR SHARE`, [p.user_id, p.plant_id])
      if (readback.length !== 1 || readback[0]!.nickname !== command.nickname || readback[0]!.version !== command.expectedVersion + 1) {
        throw new Error('档案公开读回与本次写入不一致')
      }
      const measured = lockMeasuredPotProfile(jsonObject(readback[0]!.pot_profile_json).measuredPot)
      if (serializeCanonicalJson(measured as unknown as CanonicalJsonValue) !== potJson) { throw new Error('档案测量事实读回不一致') }
      return Object.freeze({ status: 'saved', userPlantRef: command.userPlantRef, version: command.expectedVersion + 1, nickname: command.nickname, measuredPot: measured })
    }
  }
}
