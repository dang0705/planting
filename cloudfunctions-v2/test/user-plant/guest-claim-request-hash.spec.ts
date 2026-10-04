import { expect, test } from 'vitest'
import { computeGuestClaimRequestHash } from '../../src/user-plant/domain/guest-claim-request-hash.js'

/** L1/unit_fake：规范语义来自已冻结命令登记合同；哈希常量由独立请求字面值生成，不读被测输出。 */
test('已有目标按固定字段顺序产生规范摘要', () => {
 expect(computeGuestClaimRequestHash({ guestSessionRef: 'gst_guestclaim_session001', guestPlantCaseRef: 'gpc_guestclaim_case001', target: { user_plant_id: 'upl_guestclaim_existing001', type: 'existing_user_plant' } })).toBe('e029bce1f6b017ec076d2246b03813ae7e4673e5eb998abf3cba1d64aa0f172c')
})
test('新建目标只编码用户新建意图', () => {
 expect(computeGuestClaimRequestHash({ guestSessionRef: 'gst_guestclaim_session001', guestPlantCaseRef: 'gpc_guestclaim_case001', target: { type: 'new_user_plant' } })).toBe('ce0e37ac03b760e23b83437306f3af9ac78d16858a9432821420a668a8698fb0')
})
