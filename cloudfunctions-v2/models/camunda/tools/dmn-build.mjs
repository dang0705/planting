// DMN 生成：语义（决策表）+ DRD 布局（手工网格坐标 + 正交布线）。
import { routeAll, esc, svgPreview, placeLabel } from './lib.mjs'

const SIZE = { decision: [180, 80], inputData: [180, 50], knowledgeSource: [180, 60], textAnnotation: [180, 80] }
const colX = c => 100 + c * 260
const rowY = r => 100 + (r + 1) * 130

/** 构建一个 DMN 文件；model: {id,name,description,nodes:[...]} */
export function buildDmn(model) {
  const nodes = model.nodes.map(n => {
    const [w, h] = SIZE[n.kind]
    return { ...n, w, h, x: colX(n.col), y: rowY(n.row) + (80 - h) / 2 }
  })
  const byId = new Map(nodes.map(n => [n.id, n]))
  // 依赖边
  const edges = []
  for (const n of nodes.filter(n => n.kind === 'decision' || n.kind === 'knowledgeSource')) {
    ;(n.requires ?? []).forEach((src, i) => {
      const s = byId.get(src)
      if (!s) throw new Error('未知依赖 ' + src)
      const reqKind = s.kind === 'knowledgeSource' ? 'authorityRequirement' : 'informationRequirement'
      edges.push({ id: `${n.id}_req_${i}`, from: src, to: n.id, reqKind, srcKind: s.kind })
    })
  }
  const ordered = model.edgeOrder ? [...edges].sort((a, b) => (model.edgeOrder.indexOf(a.id) + 1 || 999) - (model.edgeOrder.indexOf(b.id) + 1 || 999)) : edges
  const pref = e => {
    const s = byId.get(e.from), t = byId.get(e.to)
    const sx = s.x + s.w / 2, sy = s.y + s.h / 2, tx = t.x + t.w / 2, ty = t.y + t.h / 2
    if (Math.abs(sx - tx) < 1) return { prefFrom: [ty > sy ? 'D' : 'U'], prefTo: [ty > sy ? 'U' : 'D'] }
    if (Math.abs(sy - ty) < 1) return { prefFrom: [tx > sx ? 'R' : 'L'], prefTo: [tx > sx ? 'L' : 'R'] }
    return { prefFrom: null, prefTo: null }
  }
  const xs = nodes.flatMap(n => [n.x, n.x + n.w]), ys = nodes.flatMap(n => [n.y, n.y + n.h])
  const bounds = [Math.min(...xs) - 60, Math.min(...ys) - 60, Math.max(...xs) + 60, Math.max(...ys) + 60]
  let routes, order = ordered.map(e => ({ ...e, ...pref(e) }))
  for (let attempt = 0; attempt < 40; attempt++) {
    routes = routeAll(nodes, order, { bounds })
    const failed = order.filter(e => !routes.get(e.id))
    if (!failed.length) break
    order = [...failed, ...order.filter(e => routes.get(e.id))]
  }
  const missing = [...routes].filter(([, v]) => !v).map(([k]) => k)
  return { nodes, edges, routes, missing, render: () => renderDmn(model, nodes, edges, routes), svg: () => svgPreview(
    nodes.map(n => ({ ...n, name: n.name ?? n.text, inner: true, color: n.kind === 'decision' ? '#333' : n.kind === 'inputData' ? '#2e7d32' : n.kind === 'textAnnotation' ? '#9e9e9e' : '#8e24aa' })),
    edges.map(e => ({ pts: routes.get(e.id), color: e.reqKind === 'authorityRequirement' ? '#8e24aa' : '#1565c0' })), [], [],
    [bounds[2] + 60, bounds[3] + 60]) }
}

function renderDmn(model, nodes, edges, routes) {
  const L = []
  L.push('<?xml version="1.0" encoding="UTF-8"?>')
  L.push(`<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" xmlns:di="http://www.omg.org/spec/DMN/20180521/DI/" id="${model.id}" name="${esc(model.name)}" namespace="http://camunda.org/schema/1.0/dmn">`)
  L.push(`  <description>${esc(model.description)}</description>`)
  for (const n of nodes) {
    if (n.kind === 'inputData') {
      L.push(`  <inputData id="${n.id}" name="${esc(n.name)}">`)
      L.push(`    <description>${esc(n.description)}</description>`)
      L.push(`    <variable id="${n.id}_variable" name="${n.variable}" typeRef="Any" />`)
      L.push('  </inputData>')
    } else if (n.kind === 'knowledgeSource') {
      L.push(`  <knowledgeSource id="${n.id}" name="${esc(n.name)}">`)
      L.push(`    <description>${esc(n.description)}</description>`)
      L.push('  </knowledgeSource>')
    }
  }
  for (const n of nodes.filter(n => n.kind === 'decision')) {
    L.push(`  <decision id="${n.id}" name="${esc(n.name)}">`)
    L.push(`    <description>${esc(n.description)}</description>`)
    if (n.literal) L.push(`    <variable id="${n.id}_variable" name="${n.literal.variable}" typeRef="${n.literal.type}" />`)
    const mine = edges.filter(e => e.to === n.id)
    for (const e of mine.filter(e => e.reqKind === 'informationRequirement')) {
      const tag = e.srcKind === 'decision' ? 'requiredDecision' : 'requiredInput'
      L.push(`    <informationRequirement id="${e.id}">`)
      L.push(`      <${tag} href="#${e.from}" />`)
      L.push('    </informationRequirement>')
    }
    for (const e of mine.filter(e => e.reqKind === 'authorityRequirement')) {
      L.push(`    <authorityRequirement id="${e.id}">`)
      L.push(`      <requiredAuthority href="#${e.from}" />`)
      L.push('    </authorityRequirement>')
    }
    if (n.literal) {
      L.push(`    <literalExpression id="${n.id}_literal" typeRef="${n.literal.type}">`)
      L.push(`      <text>${esc(n.literal.text)}</text>`)
      L.push('    </literalExpression>')
      L.push('  </decision>')
      continue
    }
    const t = n.table
    L.push(`    <decisionTable id="${n.id}_table" hitPolicy="${t.hitPolicy}">`)
    t.inputs.forEach((inp, i) => {
      L.push(`      <input id="${n.id}_in_${i}" label="${esc(inp.label)}">`)
      L.push(`        <inputExpression id="${n.id}_in_${i}_expr" typeRef="${inp.type}">`)
      L.push(`          <text>${esc(inp.expr)}</text>`)
      L.push('        </inputExpression>')
      L.push('      </input>')
    })
    t.outputs.forEach((out, i) => L.push(`      <output id="${n.id}_out_${i}" name="${out.name}" label="${esc(out.label)}" typeRef="${out.type}" />`))
    t.rules.forEach((rule, ri) => {
      const [ins, outs, desc] = rule
      if (ins.length !== t.inputs.length || outs.length !== t.outputs.length) throw new Error(`${n.id} 规则 ${ri} 列数不符`)
      L.push(`      <rule id="${n.id}_rule_${ri}">`)
      if (desc) L.push(`        <description>${esc(desc)}</description>`)
      ins.forEach((v, i) => L.push(`        <inputEntry id="${n.id}_rule_${ri}_in_${i}">\n          <text>${esc(v)}</text>\n        </inputEntry>`))
      outs.forEach((v, i) => L.push(`        <outputEntry id="${n.id}_rule_${ri}_out_${i}">\n          <text>${esc(v)}</text>\n        </outputEntry>`))
      L.push('      </rule>')
    })
    L.push('    </decisionTable>')
    L.push('  </decision>')
  }
  // 注释属于 artifact，按 DMN 1.3 Schema 排在全部 drgElement 之后。
  for (const n of nodes.filter(n => n.kind === 'textAnnotation')) {
    L.push(`  <textAnnotation id="${n.id}">`)
    L.push(`    <text>${esc(n.text)}</text>`)
    L.push('  </textAnnotation>')
  }
  L.push('  <dmndi:DMNDI>')
  L.push(`    <dmndi:DMNDiagram id="${model.id}_diagram" name="${esc(model.name)}">`)
  for (const n of nodes) {
    L.push(`      <dmndi:DMNShape id="${n.id}_shape" dmnElementRef="${n.id}">`)
    L.push(`        <dc:Bounds x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" />`)
    L.push('      </dmndi:DMNShape>')
  }
  for (const e of edges) {
    L.push(`      <dmndi:DMNEdge id="${e.id}_edge" dmnElementRef="${e.id}">`)
    for (const [x, y] of routes.get(e.id)) L.push(`        <di:waypoint x="${x}" y="${y}" />`)
    L.push('      </dmndi:DMNEdge>')
  }
  L.push('    </dmndi:DMNDiagram>')
  L.push('  </dmndi:DMNDI>')
  L.push('</definitions>')
  return L.join('\n') + '\n'
}
