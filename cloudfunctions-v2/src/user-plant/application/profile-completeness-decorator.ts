import type { UserPlantDto } from '../../contracts/types.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import { evaluateProfileProgress } from '../domain/profile-progress.js'
import type { GetUserPlantApplicationInput, GetUserPlantApplicationResponse } from './get-user-plant.js'
import type { ListUserPlantsApplicationInput } from './list-user-plants.js'
import type { ProfileProgressSnapshot } from './read-profile-progress-snapshot.js'

/**
 * 档案完整度叠加层（user-plant-profile-completeness/v1 §3）：在单株读取、档案保存、列表的公开结果上“读时现算”加字段。
 * 类比：像前端在接口数据返回后再算一个派生字段（computed），不改原接口、不落库；保存接口的幂等重放也会在重放时刻重新计算。
 * 规则或品种绑定读取任一失败 → 省略字段、接口照常返回（不让详情页因进度条失败）。
 */
export interface ProfileCompletenessDecoratorDependencies {
  /** 同一请求锁定一次完整度快照；未接入或不可用为 null。 */ readonly readSnapshot?: (nowMs: number) => Promise<ProfileProgressSnapshot | null>
  /** 本人植物中存在品种绑定的公开引用集合。 */ readonly readCatalogBound: (userRef: string, userPlantRefs: readonly string[]) => Promise<ReadonlySet<string>>
  /** 服务端可信 UTC 毫秒时钟。 */ readonly now: () => number
}

/** 保存命令中计算完整度需要的最小形状：统一用户公开引用。 */
export interface SavedProfileOwner {
  /** 档案保存命令（只读取其中的用户归属）。 */ readonly command: SavedProfileOwnerCommand
}
/** 保存命令中的归属字段。 */
export interface SavedProfileOwnerCommand {
  /** identity 解析出的统一用户公开引用。 */ readonly userRef: string
}
/** 列表成功数据的形状（user-plant.md 列表合同）。 */
interface UserPlantListPage {
  /** 本页植物公开投影。 */ readonly items: readonly UserPlantDto[]
  /** 下一页游标；没有下一页为 null。 */ readonly nextCursor: string | null
}

/** 读取快照与绑定事实；任一失败返回 null（省略字段）。 */
async function loadFacts(dependencies: ProfileCompletenessDecoratorDependencies, userRef: string, refs: readonly string[]) {
  if (dependencies.readSnapshot === undefined || refs.length === 0) { return null }
  try {
    const nowMs = dependencies.now()
    const snapshot = await dependencies.readSnapshot(nowMs)
    if (snapshot === null) { return null }
    return { nowMs, snapshot, bound: await dependencies.readCatalogBound(userRef, refs) }
  } catch { return null }
}

/** 一株植物的完整度。 */
function completenessOf(plant: UserPlantDto, facts: NonNullable<Awaited<ReturnType<typeof loadFacts>>>) {
  return evaluateProfileProgress({ policy: facts.snapshot.policy, plantLightMaxAgeDays: facts.snapshot.plantLightMaxAgeDays, nowMs: facts.nowMs,
    facts: { catalogBound: facts.bound.has(plant.user_plant_id), profile: plant.profile } })
}

/** 单株读取：200 时增加 `completeness`。 */
export function withSingleCompleteness(dependencies: ProfileCompletenessDecoratorDependencies,
  getUserPlant: (input: GetUserPlantApplicationInput) => Promise<GetUserPlantApplicationResponse>) {
  return async (input: GetUserPlantApplicationInput): Promise<GetUserPlantApplicationResponse> => {
    const response = await getUserPlant(input)
    if (response.status !== 200 || !('data' in response.body)) { return response }
    const facts = await loadFacts(dependencies, input.principal.user_id, [response.body.data.user_plant_id])
    return facts === null ? response : { status: response.status, body: { data: { ...response.body.data, completeness: completenessOf(response.body.data, facts) } } }
  }
}

/** 档案保存：200 成功投影增加 `completeness`；错误与非 200 原样返回。 */
export function withSavedCompleteness<TInput extends SavedProfileOwner>(dependencies: ProfileCompletenessDecoratorDependencies,
  saveProfile: (input: TInput) => Promise<HttpIdempotencyPublicResponseSnapshot>) {
  return async (input: TInput): Promise<HttpIdempotencyPublicResponseSnapshot> => {
    const result = await saveProfile(input)
    if (result.status !== 200 || !('data' in result.body)) { return result }
    const plant = result.body.data as UserPlantDto
    const facts = await loadFacts(dependencies, input.command.userRef, [plant.user_plant_id])
    return facts === null ? result : { ...result, body: { data: { ...plant, completeness: completenessOf(plant, facts) } } }
  }
}

/** 列表：每项只增加 `completenessPercent`。 */
export function withListCompleteness(dependencies: ProfileCompletenessDecoratorDependencies,
  listUserPlants: (input: ListUserPlantsApplicationInput) => Promise<HttpIdempotencyPublicResponseSnapshot>) {
  return async (input: ListUserPlantsApplicationInput): Promise<HttpIdempotencyPublicResponseSnapshot> => {
    const result = await listUserPlants(input)
    if (result.status !== 200 || !('data' in result.body)) { return result }
    const page = result.body.data as UserPlantListPage
    const facts = await loadFacts(dependencies, input.principal.user_id, page.items.map(item => item.user_plant_id))
    if (facts === null) { return result }
    return { ...result, body: { data: { ...page, items: page.items.map(item => ({ ...item, completenessPercent: completenessOf(item, facts).percent })) } } }
  }
}
