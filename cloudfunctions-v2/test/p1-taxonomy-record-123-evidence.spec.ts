import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'

import { findProjectRoot } from './support/project-root.js'

/** 离线分类证据回放器读取的显式文件路径。 */
type ReplayOptions = {
  /** 固定来源证据 JSON。 */
  evidencePath: string
  /** WCVP 官方已解出的 taxon 表。 */
  wcvpTaxonPath: string
  /** WFO 官方已解出的分类实体表。 */
  wfoTaxonPath: string
  /** WFO 官方已解出的名称表。 */
  wfoNamePath: string
  /** WFO 官方已解出的异名关系表。 */
  wfoSynonymPath: string
}

/** 离线回放器对两家来源分别读取后的只读结果。 */
type ReplayResult = {
  /** 输入来源行与 evidence 摘要、层级及冲突关系均一致。 */
  verified: boolean
  /** 证据不代表已把来源记录映射到任一学名。 */
  sourceIdentityMapped: boolean
  /** 产品分类裁决仍须由负责人完成。 */
  classificationDecision: string
  /** 是否允许进入种子；必须为 false。 */
  mayEnterSeed: boolean
  /** 是否允许激活；必须为 false。 */
  mayActivate: boolean
  /** 来源中文规范展示名仍待负责人选择。 */
  canonicalDisplayNameStatus: string
  /** Kew/WCVP 提供的两个 accepted species 候选及父属。 */
  wcvpCandidates: Array<{
    scientificName: string
    taxonId: string
    parentTaxonId: string
    familyLabel: string
  }>
  /** WFO 中作为实体存在的 mihanovichii 与 friedrichii 科属种关系。 */
  wfoAcceptedTaxa: Array<{
    scientificName: string
    taxonId: string
    parentTaxonId: string
    rank: string
  }>
  /** WFO 将 stenopleurum 名称映射至 friedrichii 的来源关系。 */
  wfoStenopleurumSynonym: {
    nameId: string
    acceptedTaxonId: string
    acceptedScientificName: string
  }
  /** 是否存在 stenopleurum 自身的 WFO taxon 实体；该版本应为 false。 */
  wfoStenopleurumHasTaxonRecord: boolean
}

/** 回放器只暴露对固定来源制品的只读校验函数。 */
type ReplayModule = {
  /** 校验显式文件中的来源记录、行哈希、父级和接受关系。 */
  verifyIdentityRows: (options: ReplayOptions) => Promise<ReplayResult>
}

/**
 * Expected 来源：Kew WCVP 官方 2026-06-04/16.0 发布记录（CC BY 3.0）与 WFO 官方
 * 2026-06 分类骨干（Zenodo 20782718，分类骨干 CC0）；逐记录 ID、名称、等级、父级、接受状态
 * 与逐记录 SHA 固定在同目录 evidence JSON，并可由原始官方包离线回放。该测试只验证来源
 * 证据是否被忠实保留；不裁决来源业务身份、不建立来源间 synonym、不批准中文名、seed 或 active。
 * 测试层次：`unit_real_data`，夹具内只保留获许可的必要分类记录行，不访问网络、CloudBase 或 CMS。
 *
 * 风险维覆盖：U1 适用（父级/名称或关系记录缺失必须失败）；U2 适用（记录内容/来源关系被改必须哈希失败）；
 * U3 适用（列数或结构非法必须失败）；U4 适用（重复回放的只读摘要相同）；U5 适用（失败后输入不变、无文件副作用）；
 * U6 N/A（回放仅读显式文件，不访问共享可变状态）；U7 N/A（没有用户本地状态或远端状态可被覆盖）。
 */
describe('P1 记录 123 分类来源冲突证据回放', () => {
  const projectRoot = findProjectRoot()
  const evidencePath = path.join(
    projectRoot,
    'docs/backend-v2/audits/taxonomy-evidence/123-gymnocalycium-species-candidates.json'
  )
  const temporaryDirectories: string[] = []

  afterEach(() => {
    let directory: string | undefined
    while ((directory = temporaryDirectories.pop())) {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  /** 写出最小官方原始行片段，用来验证真实字段、关系与独立来源记录 SHA。 */
  function createSourceFixture(): {
    /** WCVP 科属种表；仅含共享属节点和两个 accepted species。 */
    wcvpTaxonPath: string
    /** WFO 分类实体表；包含科、属和来源各自的 accepted species。 */
    wfoTaxonPath: string
    /** WFO 名称表；包含两个候选名称及 WFO synonym 采用的 accepted name。 */
    wfoNamePath: string
    /** WFO 异名表；包含 stenopleurum 指向 friedrichii 的版本化关系。 */
    wfoSynonymPath: string
    /** 本次来源证据的临时目录，仅用于确认只读与失败恢复。 */
    directory: string
  } {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qinghuazhi-p1-123-'))
    temporaryDirectories.push(directory)

    const wcvpRows = [
      'taxonid|family|genus|specificepithet|infraspecificepithet|scientfiicname|scientfiicnameauthorship|taxonrank|taxonomicstatus|acceptednameusageid|parentnameusageid|originalnameusageid|namepublishedin|nomenclaturalstatus|taxonremarks|scientificnameid|dynamicproperties|references',
      '2835511|Cactaceae|Gymnocalycium|||Gymnocalycium|Pfeiff. ex Mittler|Genus|Accepted|2835511|||Taschenb. Cactusliebhaber 2: 124 (1844)||Bolivia to SW. & S. Brazil and Argentina|ipni:30001559-2|{"powoid":"30001559-2","lifeform":"","climate":"","homotypicsynonym":"","hybridformula":"","reviewed":"N"}|https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:30001559-2',
      '2835702|Cactaceae|Gymnocalycium|mihanovichii||Gymnocalycium mihanovichii|(Frič & Gürke) Britton & Rose|Species|Accepted|2835702|2835511|2782045|Cact. 3: 153 (1922)||Paraguay to Argentina (Chaco, Formosa)|ipni:115434-2|{"powoid":"115434-2","lifeform":"succulent subshrub","climate":"subtropical","homotypicsynonym":"","hybridformula":"","reviewed":"N"}|https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:115434-2',
      '2835856|Cactaceae|Gymnocalycium|stenopleurum||Gymnocalycium stenopleurum|F.Ritter|Species|Accepted|2835856|2835511||Kakteen Südamerika 1: 265 (1979)||SE. Bolivia to N. Paraguay|ipni:115502-2|{"powoid":"115502-2","lifeform":"succulent subshrub","climate":"subtropical","homotypicsynonym":"","hybridformula":"","reviewed":"N"}|https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:115502-2'
    ]
    const wfoTaxonRows = [
      'ID\talternativeID\tnameID\tparentID\taccordingToID\tscrutinizer\tscrutinizerID\tscrutinizerDate\treferenceID\textinct\tlink',
      'wfo-7000000098\twfo:wfo-7000000098-2026-06\twfo-7000000098\twfo-9000000088\t5269464\t"Alan Franck"\t0000-0003-2706-9350\t\t3890986,5269464,4385953,6452163\tfalse\thttps://list.worldfloraonline.org/wfo-7000000098-2026-06',
      'wfo-4000016452\twfo:wfo-4000016452-2026-06\twfo-4000016452\twfo-7000000098\t5269464\t"Alan Franck"\t0000-0003-2706-9350\t\t6459273,3890986,5269464,4385953,6452163\tfalse\thttps://list.worldfloraonline.org/wfo-4000016452-2026-06',
      'wfo-0000712540\twfo:wfo-0000712540-2026-06\twfo-0000712540\twfo-4000016452\t\t"Alan Franck"\t0000-0003-2706-9350\t\t6451543\tfalse\thttps://list.worldfloraonline.org/wfo-0000712540-2026-06',
      'wfo-0000712461\twfo:wfo-0000712461-2026-06\twfo-0000712461\twfo-4000016452\t\t"Alan Franck"\t0000-0003-2706-9350\t\t6453872\tfalse\thttps://list.worldfloraonline.org/wfo-0000712461-2026-06'
    ]
    const wfoNameRows = [
      'ID\talternativeID\tbasionymID\tscientificName\tauthorship\trank\tuninomial\tgenus\tinfragenericEpithet\tspecificEpithet\tinfraspecificEpithet\tcode\treferenceID\tpublishedInYear\tlink',
      'wfo-7000000098\ttropicos:42000071,http://caryophyllales.org/cactaceae/cdm_dataportal/name/5f80334e-2685-4e4d-b7d1-f7046abeef68,urn:lsid:ipni.org:names:30000028-2,urn:lsid:ipni.org:names:30387426-2,urn:lsid:ipni.org:names:50000058-1,urn:lsid:ipni.org:names:60002735-3\t\tCactaceae\tJuss.\tfamily\tCactaceae\t\t\t\t\tbotanical\t1509610_mc\t1789\thttps://list.worldfloraonline.org/wfo-7000000098',
      'wfo-4000016452\ttropicos:100346256,http://caryophyllales.org/cactaceae/cdm_dataportal/name/7d750ba6-65d7-468e-ab41-8cf5acecc6ea,urn:lsid:ipni.org:names:1016848-1,urn:lsid:ipni.org:names:30001559-2,urn:lsid:ipni.org:names:51029267-1\t\tGymnocalycium\t"Pfeiff. ex Mittler"\tgenus\tGymnocalycium\t\t\t\t\tbotanical\t1475579_mc\t1844\thttps://list.worldfloraonline.org/wfo-4000016452',
      'wfo-0000712540\ttpl:kew-2835702,http://caryophyllales.org/cactaceae/cdm_dataportal/name/6dd1fd1c-c481-44e5-8356-b3f0b0236c84,urn:lsid:ipni.org:names:30043374-2,urn:lsid:ipni.org:names:115434-2\twfo-0000660683\t"Gymnocalycium mihanovichii"\t"(Frič & Gürke) Britton & Rose"\tspecies\t\tGymnocalycium\t\tmihanovichii\t\tbotanical\t713207_mc\t1922\thttps://list.worldfloraonline.org/wfo-0000712540',
      'wfo-0000712461\ttpl:kew-2835623,http://caryophyllales.org/cactaceae/cdm_dataportal/name/cfa8ea37-935c-44c4-9262-6eba76115ea3,urn:lsid:ipni.org:names:133334-1\twfo-0000712543\t"Gymnocalycium friedrichii"\t"(Werderm.) Pazout"\tspecies\t\tGymnocalycium\t\tfriedrichii\t\tbotanical\t713128_mc\t1964\thttps://list.worldfloraonline.org/wfo-0000712461',
      'wfo-0000712693\ttpl:kew-2835856,http://caryophyllales.org/cactaceae/cdm_dataportal/name/9f374cf3-6c43-4d5a-937d-c489d21911f2,urn:lsid:ipni.org:names:115502-2,urn:lsid:ipni.org:names:896236-1\t\t"Gymnocalycium stenopleurum"\tF.Ritter\tspecies\t\tGymnocalycium\t\tstenopleurum\t\tbotanical\t713360_mc\t1979\thttps://list.worldfloraonline.org/wfo-0000712693'
    ]
    const wfoSynonymRows = [
      'ID\ttaxonID\tnameID\taccordingToID\treferenceID\tlink',
      'wfo-0000712693-2026-06\twfo-0000712461\twfo-0000712693\t\t6453872\thttp://list.worldfloraonline.org/wfo-0000712693-2026-06'
    ]

    const paths = {
      wcvpTaxonPath: path.join(directory, 'wcvp_taxon.csv'),
      wfoTaxonPath: path.join(directory, 'taxon.tsv'),
      wfoNamePath: path.join(directory, 'name.tsv'),
      wfoSynonymPath: path.join(directory, 'synonym.tsv'),
      directory
    }
    fs.writeFileSync(paths.wcvpTaxonPath, `${wcvpRows.join('\n')}\n`, 'utf8')
    fs.writeFileSync(paths.wfoTaxonPath, `${wfoTaxonRows.join('\n')}\n`, 'utf8')
    fs.writeFileSync(paths.wfoNamePath, `${wfoNameRows.join('\n')}\n`, 'utf8')
    fs.writeFileSync(paths.wfoSynonymPath, `${wfoSynonymRows.join('\n')}\n`, 'utf8')
    return paths
  }

  /** 动态导入回放器，确保 RED 可由缺少实现稳定触发，并调用 CLI 共用的实际校验函数。 */
  async function loadVerifier(): Promise<ReplayModule> {
    const modulePath = path.join(
      projectRoot,
      'docs/backend-v2/audits/taxonomy-evidence/replay-123-gymnocalycium.mjs'
    )
    const moduleUrl = pathToFileURL(modulePath).href
    return import(moduleUrl) as Promise<ReplayModule>
  }

  test('按来源分别回放 Kew 两个接受种与 WFO 的 synonym 冲突，不映射业务身份', async () => {
    const fixture = createSourceFixture()
    const { verifyIdentityRows } = await loadVerifier()
    const result = await verifyIdentityRows({ evidencePath, ...fixture })

    expect(result).toMatchObject({
      verified: true,
      sourceIdentityMapped: false,
      classificationDecision: 'SOURCE_CONFLICT_REQUIRES_OWNER_DECISION',
      mayEnterSeed: false,
      mayActivate: false,
      canonicalDisplayNameStatus: 'PENDING_OWNER_SELECTION',
      wcvpCandidates: [
        {
          scientificName: 'Gymnocalycium mihanovichii',
          taxonId: '2835702',
          parentTaxonId: '2835511',
          familyLabel: 'Cactaceae'
        },
        {
          scientificName: 'Gymnocalycium stenopleurum',
          taxonId: '2835856',
          parentTaxonId: '2835511',
          familyLabel: 'Cactaceae'
        }
      ],
      wfoStenopleurumSynonym: {
        nameId: 'wfo-0000712693',
        acceptedTaxonId: 'wfo-0000712461',
        acceptedScientificName: 'Gymnocalycium friedrichii'
      },
      wfoStenopleurumHasTaxonRecord: false
    })
    expect(result.wfoAcceptedTaxa).toEqual([
      {
        scientificName: 'Gymnocalycium mihanovichii',
        taxonId: 'wfo-0000712540',
        parentTaxonId: 'wfo-4000016452',
        rank: 'species'
      },
      {
        scientificName: 'Gymnocalycium friedrichii',
        taxonId: 'wfo-0000712461',
        parentTaxonId: 'wfo-4000016452',
        rank: 'species'
      }
    ])
  })

  test('缺少 WFO 的目标名称或采用关系时失败关闭', async () => {
    const fixture = createSourceFixture()
    const { verifyIdentityRows } = await loadVerifier()
    const names = fs.readFileSync(fixture.wfoNamePath, 'utf8')
    fs.writeFileSync(fixture.wfoNamePath, names.replace(/^wfo-0000712693\t.*\n/mu, ''), 'utf8')

    await expect(verifyIdentityRows({ evidencePath, ...fixture })).rejects.toThrow(
      /名称记录|name|缺失/iu
    )
  })

  test('WFO 错误改写候选与接受实体的关系不能通过来源行哈希', async () => {
    const fixture = createSourceFixture()
    const { verifyIdentityRows } = await loadVerifier()
    const synonyms = fs.readFileSync(fixture.wfoSynonymPath, 'utf8')
    fs.writeFileSync(fixture.wfoSynonymPath, synonyms.replace('\t6453872\t', '\t0000000\t'), 'utf8')

    await expect(verifyIdentityRows({ evidencePath, ...fixture })).rejects.toThrow(/SHA-256/iu)
  })

  test('WCVP/WFO 错误父属链不能被另一来源的相同科属标签掩盖', async () => {
    const fixture = createSourceFixture()
    const { verifyIdentityRows } = await loadVerifier()
    const taxa = fs.readFileSync(fixture.wfoTaxonPath, 'utf8')
    fs.writeFileSync(
      fixture.wfoTaxonPath,
      taxa.replace('wfo-4000016452\twfo-7000000098', 'wfo-4000016452\twfo-7000000000'),
      'utf8'
    )

    await expect(verifyIdentityRows({ evidencePath, ...fixture })).rejects.toThrow(/SHA-256|父级/iu)
  })

  test('非法 WFO 表列数不能被宽松解析为有效分类行', async () => {
    const fixture = createSourceFixture()
    const { verifyIdentityRows } = await loadVerifier()
    fs.appendFileSync(
      fixture.wfoSynonymPath,
      'wfo-extra\twfo-0000712461\twfo-0000712693\t\t6453872\n',
      'utf8'
    )

    await expect(verifyIdentityRows({ evidencePath, ...fixture })).rejects.toThrow(
      /列数|字段|SHA-256/iu
    )
  })

  test('回放是确定的只读操作，失败后原始输入和目录内容不变', async () => {
    const fixture = createSourceFixture()
    const { verifyIdentityRows } = await loadVerifier()
    const paths = [
      fixture.wcvpTaxonPath,
      fixture.wfoTaxonPath,
      fixture.wfoNamePath,
      fixture.wfoSynonymPath
    ]
    const before = paths.map(filePath => fs.readFileSync(filePath, 'utf8'))
    const entriesBefore = fs.readdirSync(fixture.directory).sort()
    const first = await verifyIdentityRows({ evidencePath, ...fixture })
    const second = await verifyIdentityRows({ evidencePath, ...fixture })
    expect(second).toEqual(first)
    expect(paths.map(filePath => fs.readFileSync(filePath, 'utf8'))).toEqual(before)
    expect(fs.readdirSync(fixture.directory).sort()).toEqual(entriesBefore)
  })
})
