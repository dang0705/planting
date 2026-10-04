import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findProjectRoot } from '../support/project-root.js'
import { projectWindowObstructions } from '../../src/care/light/project-window-obstructions.js'
import { propagateIsotropicWindowDiffuse } from '../../src/care/light/propagate-window-diffuse.js'
import { replayIndoorNaturalLight } from '../../src/care/application/replay-indoor-natural-light.js'

/** unit_fake：相似三角形投影及矩形集合差作为独立 Expected，不使用经验遮挡倍率。 */
describe('unit_fake 平行矩形遮挡物到实际窗洞', () => {
  const plant = { xM: 0, yM: 0, perpendicularDistanceM: 1 }
  const aperture = { reference: 'window', leftM: -1, rightM: 1, bottomM: 0, topM: 1 }
  const obstacle = { reference: 'wall', sourceRef: 'explicit-geometry-fixture', leftM: -2, rightM: 2, bottomM: 0, topM: 2, distanceBeyondWindowM: 1 }
  const calculate = (obstacles = [obstacle]) => projectWindowObstructions(plant, [aperture], obstacles)
  it('外部遮挡按d/(d+z)投影，完全覆盖时没有可见开口', () => {
    expect(calculate().projectedObstacles[0]).toMatchObject({ leftM: -1, rightM: 1, bottomM: 0, topM: 1 })
    expect(calculate().visibleApertures).toEqual([])
  })
  it('窗内物体同样投影，不能把室内和室外距离混同', () => {
    expect(calculate([{ ...obstacle, leftM: -0.5, rightM: 0.5, topM: 0.5, distanceBeyondWindowM: -0.5 }]).visibleApertures).toEqual([])
  })
  it('遮挡右半开口，散射为独立左右对称积分的一半', () => {
    const visibility=calculate([{ ...obstacle, leftM: 0 }])
    const result=propagateIsotropicWindowDiffuse({ skyModel:'isotropic',planeReference:'plant',plant,apertures:visibility.visibleApertures,dhiWattsPerM2:200 })
    expect(result.diffuseWattsPerM2).toBeCloseTo(100*Math.SQRT2/Math.PI*Math.atan(1/Math.SQRT2),10)
  })
  it('同一个遮挡重复覆盖不会二次衰减，也不修改输入', () => {
    const before=JSON.stringify(obstacle)
    expect(calculate([obstacle,{...obstacle,reference:'other'}]).visibleApertures).toEqual([])
    expect(JSON.stringify(obstacle)).toBe(before)
  })
  it('位置和距离是实际投影输入，远离窗口的相同遮挡不再覆盖全部开口', () => {
    expect(calculate([{ ...obstacle, distanceBeyondWindowM: 3 }]).visibleApertures.length).toBeGreaterThan(0)
    expect(projectWindowObstructions({...plant,xM:3},[aperture],[obstacle]).projectedObstacles[0]?.leftM).toBe(0.5)
  })
  it('显式空列表保留实际开口并集；连窗中间墙体不透光', () => {
    const result=projectWindowObstructions(plant,[{...aperture,reference:'left',rightM:-0.5},{...aperture,reference:'right',leftM:0.5}],[])
    expect(result.visibleApertures).toHaveLength(2)
    expect(result.visibleApertures.every(a=>a.rightM<=-0.5||a.leftM>=0.5)).toBe(true)
  })
  it.each([-1,-2,NaN,Infinity])('拒绝目标平面及目标后方的遮挡距离%s',distanceBeyondWindowM=>{
    expect(()=>calculate([{...obstacle,distanceBeyondWindowM}])).toThrow()
  })
  it('缺几何来源、重复引用、非法矩形或未知列表都拒绝',()=>{
    expect(()=>calculate([{...obstacle,sourceRef:''}])).toThrow()
    expect(()=>calculate([obstacle,obstacle])).toThrow()
    expect(()=>calculate([{...obstacle,rightM:-2}])).toThrow()
    expect(()=>calculate(null as never)).toThrow()
  })
})

/** unit_real_data：真实Provider制品→SunCalc和DHI→共同可见窗洞→传播；遮挡几何明确为构造，未验证现场。 */
describe('unit_real_data 双通道共用遮挡几何',()=>{
  const raw=JSON.parse(readFileSync(join(findProjectRoot(),'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'),'utf8'))
  const context={series:'hourly' as const,sourceRef:'saved-open-meteo-fixture',fetchedAtMs:Date.parse('2026-10-04T11:14:48Z')}
  const target={latitudeDeg:31.23,longitudeDeg:121.47,plane:{reference:'window',tiltDeg:90,azimuthDeg:180},plantReference:'plant',plant:{xM:0,yM:0,perpendicularDistanceM:1},apertures:[{reference:'window',leftM:-1,rightM:1,bottomM:0,topM:1}],skyModel:'isotropic' as const}
  const losses={glass:{sourceRef:'explicit-experiment',direct:{lower:1,upper:1},diffuse:{lower:1,upper:1}},curtain:{sourceRef:'explicit-experiment',direct:{lower:1,upper:1},diffuse:{lower:1,upper:1}}}
  it('完全遮挡同时阻断直射与散射，不再把外部无建筑当作事实',()=>{
    // 上海白天南向宽窗实际制品含正DNI；宽高避免原窄窗把全部直射提前挡掉。
    const wideTarget={...target,apertures:[{...target.apertures[0]!,leftM:-10,rightM:10,topM:8}]}
    expect(replayIndoorNaturalLight(raw,context,wideTarget,losses).intervals.some(i=>(i.directWattsPerM2?.upper??0)>0)).toBe(true)
    const result=replayIndoorNaturalLight(raw,context,{...wideTarget,obstacles:[{reference:'wall',sourceRef:'synthetic-position',leftM:-20,rightM:20,bottomM:0,topM:16,distanceBeyondWindowM:1}]},losses)
    expect(result.obstructionScope).toBe('explicit_parallel_rectangles')
    expect(result.visibility?.visibleApertures).toEqual([])
    result.intervals.forEach(i=>{if(i.directWattsPerM2){expect(i.directWattsPerM2.upper).toBe(0)}if(i.diffuseWattsPerM2){expect(i.diffuseWattsPerM2.upper).toBe(0)}})
  })
  it('未提供遮挡输入保持未评估，不偷偷变成确认无遮挡',()=>{
    const result=replayIndoorNaturalLight(raw,context,target,losses)
    expect(result.obstructionScope).toBe('not_evaluated')
    expect(result.visibility).toBeNull()
    expect(result.productionAdmission).toBe(false)
  })
})
