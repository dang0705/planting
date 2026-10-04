import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findProjectRoot } from './project-root.js'
import { diagnosisPublicResultFixture } from './diagnosis-public-result-fixture.js'
import { lockQuestionPackageSnapshot } from '../../src/diagnosis/domain/question-package-snapshot.js'
const questions = JSON.parse(
  readFileSync(
    join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'),
    'utf8'
  )
)
const questionPackage = lockQuestionPackageSnapshot({
  contractVersion: 'diagnosis-question-package-snapshot/v1',
  mode: 'yellow_leaf',
  questionPackageReleaseRef: 'bpr_test12345',
  questionCount: questions.fixed.yellow_leaf.length,
  packageQuestions: questions.fixed.yellow_leaf
})
export function resultFixture() {
  return {
    contractVersion: 'diagnosis-result-record/v1',
    publicResult: structuredClone(diagnosisPublicResultFixture),
    replay: {
      knowledgeReleaseRef: 'dkr_fixture123',
      knowledgePackageSha256: 'a'.repeat(64),
      questionPackage: structuredClone(questionPackage),
      inputSnapshot: { plantIdentityRef: null, answers: [] },
      decisionTrace: {
        outcomeCodes: ['unconfirmed'],
        actionCodes: [],
        gateResults: { certainty: 'unconfirmed' }
      },
      ruleReleaseRef: 'rules_fixture/v1',
      ruleReleaseSha256: 'b'.repeat(64),
      modelBinding: null
    }
  }
}
