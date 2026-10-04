import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { lockQuestionPackageSnapshot } from '../../src/diagnosis/domain/question-package-snapshot.js'
import { projectPestQuestionPackage } from '../../src/diagnosis/http/pest-question-public-projection.js'
/** unit_real_data / L1：真实V1题目；Expected来自动态发布合同的用户安全提示与公开白名单，不证明HTTP。 */
const raw=JSON.parse(readFileSync(join(findProjectRoot(),'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'),'utf8'))
function snapshot(){return lockQuestionPackageSnapshot({questionPackageReleaseRef:'bpr_pest12345',mode:'specific_pest_visual',questionCount:1,packageQuestions:[raw.pestQuestions.find((q:{packageTopic:string})=>q.packageTopic==='whitefly_adults')]})}
describe('虫害题目安全提示公开投影',()=>{
 test('用户可见同意、风险与跳过提示，不公开内部关联和发布',()=>{const r=projectPestQuestionPackage(snapshot());expect(r.questionCount).toBe(1);const q=r.questions[0]!;expect(q.requiresExplicitConsent).toBe(true);expect(q.skipOptionEnabled).toBe(true);expect(q.riskNotice).toBe('需要轻碰叶片；如果植株脆弱、过敏或不方便操作，请直接跳过。');expect(q.safetyInstructions).toEqual(['先确认手部安全','只轻碰叶片边缘','不方便操作时请选择跳过']);expect(Object.keys(q).sort()).toEqual(['questionKey','text','inputKind','options','helpText','whyThisQuestion','riskLevel','riskNotice','safetyInstructions','requiresExplicitConsent','skipOptionEnabled'].sort());expect(JSON.stringify(r)).not.toMatch(/routeKey|mapsToModes|value|candidateModes|bpr_pest12345|contentSha/)})
 test.each(['riskNotice','safetyInstructions','requiresExplicitConsent','skipOptionEnabled'])('缺少%s拒绝而不是忽略安全提示',field=>{const input=structuredClone(raw.pestQuestions.find((q:{packageTopic:string})=>q.packageTopic==='whitefly_adults'));delete input[field];const pack=lockQuestionPackageSnapshot({questionPackageReleaseRef:'bpr_pest12345',mode:'specific_pest_visual',questionCount:1,packageQuestions:[input]});expect(()=>projectPestQuestionPackage(pack)).toThrow()})
 test('零题不冒充可作答题包，损坏快照也拒绝',()=>{const empty=lockQuestionPackageSnapshot({questionPackageReleaseRef:'bpr_pest12345',mode:'specific_pest_visual',questionCount:0,packageQuestions:[]});expect(()=>projectPestQuestionPackage(empty)).toThrow();const bad=structuredClone(snapshot());Object.assign(bad.snapshot.packageQuestions[0]!,{text:'改变'});expect(()=>projectPestQuestionPackage(bad)).toThrow()})
})
