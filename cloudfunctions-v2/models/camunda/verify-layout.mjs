#!/usr/bin/env node
/**
 * 只读布局校验：解析本目录 .bpmn / .dmn 的语义与图形坐标（仅用 Node 内置模块），检查：
 * 1. 所有引用 id 存在（sourceRef/targetRef/incoming/outgoing/flowNodeRef/processRef/errorRef/bpmnElement、
 *    DMN href/dmnElementRef；跨文件 calledElement 与 camunda:decisionRef）；每个语义元素都有图形。
 * 2. 连线端点落在起止节点边界上；所有线段正交（水平或垂直）。
 * 3. 任意两条连线的线段不交叉、不共用线段（仅允许端点相接）。
 * 4. 线段不穿过任何节点矩形内部（含起止节点）。
 * 5. 横向线段不压在泳道边界上（跨泳道只能垂直穿过）。
 * 6. 标签不压线、不压节点、不互相重叠。
 * 7. 同行节点水平间距 ≥ 60、同列节点垂直间距 ≥ 40。
 * 用法：node verify-layout.mjs [文件...]（缺省为本目录全部 .bpmn/.dmn）。发现问题时退出码为 1。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------- 极简 XML 解析（元素、属性、文本；忽略声明与注释） ----------------
function parseXml(text) {
  const root = { name: '#root', attrs: {}, children: [], text: '' }
  const stack = [root]
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  let m
  while ((m = re.exec(text))) {
    if (m[2]) {
      const top = stack.pop()
      if (top.name !== m[2]) throw new Error(`XML 标签不匹配：${top.name} / ${m[2]}`)
    } else if (m[3]) {
      const attrs = {}
      for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3])
      const el = { name: m[3], attrs, children: [], text: '' }
      stack.at(-1).children.push(el)
      if (!m[5]) stack.push(el)
    } else if (m[1] !== undefined) stack.at(-1).text += m[1]
    else if (m[6]) stack.at(-1).text += decode(m[6])
  }
  if (stack.length !== 1) throw new Error('XML 未闭合')
  return root
}
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const local = n => n.includes(':') ? n.split(':')[1] : n
function* walk(el, parent = null) { yield [el, parent]; for (const c of el.children) yield* walk(c, el) }
const find = (el, ln) => el.children.find(c => local(c.name) === ln)
const findAll = (el, ln) => el.children.filter(c => local(c.name) === ln)
const boundsOf = el => { const b = find(el, 'Bounds'); return b && { x: +b.attrs.x, y: +b.attrs.y, w: +b.attrs.width, h: +b.attrs.height } }
const waypoints = el => findAll(el, 'waypoint').map(w => [+w.attrs.x, +w.attrs.y])

// ---------------- 几何 ----------------
const EPS = 1e-6
const onBoundary = (p, r) => {
  const inX = p[0] >= r.x - EPS && p[0] <= r.x + r.w + EPS, inY = p[1] >= r.y - EPS && p[1] <= r.y + r.h + EPS
  return inX && inY && (Math.abs(p[0] - r.x) < EPS || Math.abs(p[0] - r.x - r.w) < EPS || Math.abs(p[1] - r.y) < EPS || Math.abs(p[1] - r.y - r.h) < EPS)
}
/** 线段是否进入矩形内部（严格内部）。 */
function segEntersRect(a, b, r) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1])
  if (y0 === y1) return y0 > r.y + EPS && y0 < r.y + r.h - EPS && x1 > r.x + EPS && x0 < r.x + r.w - EPS
  return x0 > r.x + EPS && x0 < r.x + r.w - EPS && y1 > r.y + EPS && y0 < r.y + r.h - EPS
}
/** 线段与矩形（含边界）是否接触。 */
function segTouchesRect(a, b, r) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1])
  return x1 >= r.x && x0 <= r.x + r.w && y1 >= r.y && y0 <= r.y + r.h
}
/** 两条正交线段的关系：none | endpoint（仅端点相接）| cross | overlap。 */
function segRelation(a, b, c, d) {
  const hA = a[1] === b[1], hB = c[1] === d[1]
  const rng = (p, q, i) => [Math.min(p[i], q[i]), Math.max(p[i], q[i])]
  const isEnd = (p, s, t) => (p[0] === s[0] && p[1] === s[1]) || (p[0] === t[0] && p[1] === t[1])
  if (hA === hB) {
    const fixed = hA ? 1 : 0, vary = hA ? 0 : 1
    if (a[fixed] !== c[fixed]) return 'none'
    const [a0, a1] = rng(a, b, vary), [c0, c1] = rng(c, d, vary)
    const lo = Math.max(a0, c0), hi = Math.min(a1, c1)
    if (lo > hi) return 'none'
    if (lo < hi) return 'overlap'
    const p = hA ? [lo, a[1]] : [a[0], lo]
    return isEnd(p, a, b) && isEnd(p, c, d) ? 'endpoint' : 'cross'
  }
  const [h1, h2, v1, v2] = hA ? [a, b, c, d] : [c, d, a, b]
  const [hx0, hx1] = rng(h1, h2, 0), [vy0, vy1] = rng(v1, v2, 1)
  const x = v1[0], y = h1[1]
  if (x < hx0 || x > hx1 || y < vy0 || y > vy1) return 'none'
  return isEnd([x, y], h1, h2) && isEnd([x, y], v1, v2) ? 'endpoint' : 'cross'
}
const rectOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// ---------------- 模型抽取 ----------------
function extract(file, xml) {
  const root = parseXml(xml)
  const defs = root.children[0]
  const isBpmn = local(defs.name) === 'definitions' && defs.attrs['xmlns:bpmn']
  const ids = new Map()
  for (const [el] of walk(defs)) if (el.attrs.id) {
    if (ids.has(el.attrs.id)) throw new Error(`${file}: 重复 id ${el.attrs.id}`)
    ids.set(el.attrs.id, el)
  }
  const nodes = new Map() // 语义 id → bounds
  const containers = [] // 泳道与池
  const edges = [] // {id, from, to, pts}
  const labels = []
  const refs = [] // [描述, 目标 id]
  const external = { calledElements: [], decisionRefs: [], processIds: [], decisionIds: [] }
  const problems = []
  if (isBpmn) {
    const flowTypes = new Set(['startEvent', 'endEvent', 'task', 'userTask', 'serviceTask', 'businessRuleTask', 'callActivity', 'exclusiveGateway', 'intermediateThrowEvent', 'intermediateCatchEvent', 'boundaryEvent', 'subProcess', 'parallelGateway', 'inclusiveGateway', 'scriptTask', 'sendTask', 'receiveTask', 'manualTask'])
    const semanticFlow = new Map(), semanticNodes = new Set()
    for (const [el] of walk(defs)) {
      const ln = local(el.name)
      if (flowTypes.has(ln)) semanticNodes.add(el.attrs.id)
      if (ln === 'sequenceFlow') { semanticFlow.set(el.attrs.id, el); refs.push([`${el.attrs.id}.sourceRef`, el.attrs.sourceRef], [`${el.attrs.id}.targetRef`, el.attrs.targetRef]) }
      if (ln === 'incoming' || ln === 'outgoing' || ln === 'flowNodeRef') refs.push([`${ln}`, el.text.trim()])
      if (ln === 'participant') refs.push([`${el.attrs.id}.processRef`, el.attrs.processRef])
      if (ln === 'errorEventDefinition' && el.attrs.errorRef) refs.push([`${el.attrs.id}.errorRef`, el.attrs.errorRef])
      if (ln === 'process') external.processIds.push(el.attrs.id)
      if (ln === 'callActivity' && el.attrs.calledElement) external.calledElements.push(el.attrs.calledElement)
      if (el.attrs['camunda:decisionRef']) external.decisionRefs.push(el.attrs['camunda:decisionRef'])
      if (ln === 'BPMNShape' || ln === 'BPMNEdge' || ln === 'BPMNPlane') refs.push([`${el.attrs.id}.bpmnElement`, el.attrs.bpmnElement])
    }
    for (const [el] of walk(defs)) {
      const ln = local(el.name)
      if (ln === 'BPMNShape') {
        const target = ids.get(el.attrs.bpmnElement)
        const b = boundsOf(el)
        if (!target) continue
        const tl = local(target.name)
        if (tl === 'lane' || tl === 'participant') containers.push({ id: el.attrs.bpmnElement, kind: tl, ...b })
        else nodes.set(el.attrs.bpmnElement, b)
        const lab = find(el, 'BPMNLabel'); if (lab && boundsOf(lab)) labels.push({ owner: el.attrs.bpmnElement, ...boundsOf(lab) })
      }
      if (ln === 'BPMNEdge') {
        const flowEl = semanticFlow.get(el.attrs.bpmnElement)
        if (!flowEl) continue
        edges.push({ id: el.attrs.bpmnElement, from: flowEl.attrs.sourceRef, to: flowEl.attrs.targetRef, pts: waypoints(el) })
        const lab = find(el, 'BPMNLabel'); if (lab && boundsOf(lab)) labels.push({ owner: el.attrs.bpmnElement, ...boundsOf(lab) })
      }
    }
    for (const id of semanticNodes) if (!nodes.has(id)) problems.push(`缺少图形：${id}`)
    for (const id of semanticFlow.keys()) if (!edges.some(e => e.id === id)) problems.push(`缺少连线图形：${id}`)
  } else {
    const reqParent = new Map()
    for (const [el, parent] of walk(defs)) {
      const ln = local(el.name)
      if (ln === 'decision') external.decisionIds.push(el.attrs.id)
      if (ln === 'informationRequirement' || ln === 'authorityRequirement' || ln === 'knowledgeRequirement') {
        const ref = el.children[0]
        const href = (ref?.attrs.href ?? '').replace(/^#/, '')
        refs.push([`${el.attrs.id}.href`, href])
        reqParent.set(el.attrs.id, { from: href, to: parent.attrs.id })
      }
      if (ln === 'DMNShape' || ln === 'DMNEdge') refs.push([`${el.attrs.id}.dmnElementRef`, el.attrs.dmnElementRef])
    }
    for (const [el] of walk(defs)) {
      const ln = local(el.name)
      if (ln === 'DMNShape') nodes.set(el.attrs.dmnElementRef, boundsOf(el))
      if (ln === 'DMNEdge') {
        const r = reqParent.get(el.attrs.dmnElementRef)
        if (r) edges.push({ id: el.attrs.dmnElementRef, from: r.from, to: r.to, pts: waypoints(el) })
      }
    }
    for (const el of defs.children) {
      if (['decision', 'inputData', 'knowledgeSource', 'businessKnowledgeModel'].includes(local(el.name)) && !nodes.has(el.attrs.id)) problems.push(`缺少图形：${el.attrs.id}`)
    }
    for (const id of reqParent.keys()) if (!edges.some(e => e.id === id)) problems.push(`缺少连线图形：${id}`)
  }
  for (const [what, id] of refs) if (!id || !ids.has(id)) problems.push(`引用不存在：${what} → ${id}`)
  return { file, isBpmn, nodes, containers, edges, labels, problems, external }
}

// ---------------- 布局检查 ----------------
function checkLayout(model) {
  const { nodes, edges, labels, containers, problems } = model
  const segs = []
  for (const e of edges) {
    const s = nodes.get(e.from), t = nodes.get(e.to)
    if (!s || !t) { problems.push(`连线 ${e.id} 起止节点无图形`); continue }
    if (e.pts.length < 2) { problems.push(`连线 ${e.id} 少于两个拐点`); continue }
    if (!onBoundary(e.pts[0], s)) problems.push(`连线 ${e.id} 起点不在源节点边界`)
    if (!onBoundary(e.pts.at(-1), t)) problems.push(`连线 ${e.id} 终点不在目标节点边界`)
    for (let i = 0; i + 1 < e.pts.length; i++) {
      const [a, b] = [e.pts[i], e.pts[i + 1]]
      if (a[0] !== b[0] && a[1] !== b[1]) problems.push(`连线 ${e.id} 第 ${i} 段不是正交线段`)
      if (a[0] === b[0] && a[1] === b[1]) problems.push(`连线 ${e.id} 第 ${i} 段长度为 0`)
      segs.push({ edge: e.id, i, a, b })
      for (const [id, r] of nodes) if (segEntersRect(a, b, r)) problems.push(`连线 ${e.id} 第 ${i} 段穿过节点 ${id}`)
    }
    for (let i = 0; i + 2 < e.pts.length; i++) {
      const rel = segRelation(e.pts[i], e.pts[i + 1], e.pts[i + 1], e.pts[i + 2])
      if (rel === 'overlap') problems.push(`连线 ${e.id} 第 ${i} 段折返重叠`)
    }
  }
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const p = segs[i], q = segs[j]
    if (p.edge === q.edge && Math.abs(p.i - q.i) === 1) continue
    const rel = segRelation(p.a, p.b, q.a, q.b)
    if (rel === 'cross') problems.push(`线段交叉：${p.edge}#${p.i} × ${q.edge}#${q.i}`)
    if (rel === 'overlap') problems.push(`线段共用：${p.edge}#${p.i} = ${q.edge}#${q.i}`)
  }
  // 泳道边界
  const lanes = containers.filter(c => c.kind === 'lane')
  const boundaryY = new Set(lanes.flatMap(l => [l.y, l.y + l.h]))
  for (const s of segs) if (s.a[1] === s.b[1] && boundaryY.has(s.a[1])) problems.push(`连线 ${s.edge} 第 ${s.i} 段沿泳道边界横走`)
  for (const pool of containers.filter(c => c.kind === 'participant')) for (const s of segs) {
    const inside = p => p[0] >= pool.x && p[0] <= pool.x + pool.w && p[1] >= pool.y && p[1] <= pool.y + pool.h
    if (!inside(s.a) || !inside(s.b)) problems.push(`连线 ${s.edge} 第 ${s.i} 段超出池边界`)
  }
  // 标签
  for (const l of labels) {
    for (const s of segs) if (segTouchesRect(s.a, s.b, l)) problems.push(`标签（${l.owner}）压线：${s.edge}#${s.i}`)
    for (const [id, r] of nodes) if (rectOverlap(l, r)) problems.push(`标签（${l.owner}）压节点 ${id}`)
  }
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (rectOverlap(labels[i], labels[j])) problems.push(`标签重叠：${labels[i].owner} / ${labels[j].owner}`)
  // 节点间距
  const list = [...nodes]
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const [ia, a] = list[i], [ib, b] = list[j]
    if (rectOverlap(a, b)) { problems.push(`节点重叠：${ia} / ${ib}`); continue }
    const yOverlap = a.y < b.y + b.h && b.y < a.y + a.h, xOverlap = a.x < b.x + b.w && b.x < a.x + a.w
    if (yOverlap) { const gap = Math.max(b.x - a.x - a.w, a.x - b.x - b.w); if (gap < 60) problems.push(`水平间距 ${gap} < 60：${ia} / ${ib}`) }
    if (xOverlap) { const gap = Math.max(b.y - a.y - a.h, a.y - b.y - b.h); if (gap < 40) problems.push(`垂直间距 ${gap} < 40：${ia} / ${ib}`) }
  }
  return segs.length
}

// ---------------- 入口 ----------------
const here = dirname(fileURLToPath(import.meta.url))
const files = process.argv.length > 2 ? process.argv.slice(2).map(f => resolve(f))
  : readdirSync(here).filter(f => /\.(bpmn|dmn)$/u.test(f)).sort().map(f => join(here, f))
const models = files.map(f => extract(basename(f), readFileSync(f, 'utf8')))
const allProcesses = new Set(models.flatMap(m => m.external.processIds))
const allDecisions = new Set(models.flatMap(m => m.external.decisionIds))
let failed = false
for (const m of models) {
  const segCount = checkLayout(m)
  for (const c of m.external.calledElements) if (!allProcesses.has(c)) m.problems.push(`calledElement 指向未知流程：${c}`)
  for (const d of m.external.decisionRefs) if (!allDecisions.has(d)) m.problems.push(`camunda:decisionRef 指向未知决策：${d}`)
  const summary = `${m.file}: 节点 ${m.nodes.size}，连线 ${m.edges.length}，线段 ${segCount}，标签 ${m.labels.length}`
  if (m.problems.length) {
    failed = true
    console.log(`FAIL ${summary}，问题 ${m.problems.length}`)
    for (const p of m.problems.slice(0, 50)) console.log('  - ' + p)
    if (m.problems.length > 50) console.log(`  … 另有 ${m.problems.length - 50} 条`)
  } else console.log(`PASS ${summary}`)
}
process.exit(failed ? 1 : 0)
