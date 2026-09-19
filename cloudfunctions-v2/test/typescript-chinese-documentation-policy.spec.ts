import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { expect, test } from 'vitest'

import { findProjectRoot } from './support/project-root.js'

const minimumChineseDocumentationLength = 8
const humanReadableLineNumberOffset = 1

/** 递归收集产品源码，排除声明文件；测试本身不作为产品类型注释验收对象。 */
function collectTypeScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return collectTypeScriptFiles(absolutePath)
    }
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')
      ? [absolutePath]
      : []
  })
}

/** 从属性节点自身的 JSDoc 读取中文说明，普通行注释不计入通过证据。 */
function extractJsDocText(node: ts.PropertySignature): string {
  const jsDoc = (node as ts.PropertySignature & { jsDoc?: ts.JSDoc[] }).jsDoc ?? []
  return jsDoc
    .map((document) => (typeof document.comment === 'string' ? document.comment : ''))
    .join('\n')
    .trim()
}

/**
 * Expected 来源：仓库 AGENTS.md“所有关键逻辑、字段含义、TS 类型及内部属性必须用中文详细注释”。
 * 测试层次：unit_real_data；扫描真实后端 TypeScript 源码，不访问网络、数据库或运行时。
 */
test('后端 interface 与对象型 type 的每个属性都有中文 TSDoc', () => {
  const sourceRoot = path.join(findProjectRoot(), 'cloudfunctions-v2/src')
  const sourceFiles = collectTypeScriptFiles(sourceRoot)
  const missingDocumentation: string[] = []

  for (const sourceFilePath of sourceFiles) {
    const sourceText = fs.readFileSync(sourceFilePath, 'utf8')
    const sourceFile = ts.createSourceFile(
      sourceFilePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )

    const inspectTypeNode = (node: ts.Node): void => {
      if (ts.isPropertySignature(node)) {
        const effectiveDocumentation = extractJsDocText(node)
        if (
          !/[\u3400-\u9fff]/u.test(effectiveDocumentation) ||
          effectiveDocumentation.trim().length < minimumChineseDocumentationLength
        ) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          missingDocumentation.push(
            `${path.relative(findProjectRoot(), sourceFilePath)}:${line + humanReadableLineNumberOffset} ${node.name.getText(sourceFile)}`,
          )
        }
      }
      ts.forEachChild(node, inspectTypeNode)
    }

    for (const statement of sourceFile.statements) {
      if (ts.isInterfaceDeclaration(statement)) {
        inspectTypeNode(statement)
      }
      if (ts.isTypeAliasDeclaration(statement)) {
        inspectTypeNode(statement.type)
      }
    }
  }

  expect(missingDocumentation, `以下 TypeScript 属性缺少具体中文 TSDoc：\n${missingDocumentation.join('\n')}`).toEqual([])
})
