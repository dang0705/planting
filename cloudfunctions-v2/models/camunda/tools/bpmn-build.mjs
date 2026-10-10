// BPMN 生成：单池多泳道，网格坐标 + 正交布线 + 标签避让。
import { routeAll, esc, svgPreview, placeLabel, wrap, textWidth } from './lib.mjs'

const COLW = 210, ROWH = 130, X0 = 290, POOL_X = 100, POOL_Y = 80, PAD = 60
const SIZE = { startEvent: [36, 36], endEvent: [36, 36], exclusiveGateway: [50, 50] }
const ACT = [150, 80]
const isPoint = t => t === 'startEvent' || t === 'endEvent' || t === 'exclusiveGateway'

export function buildBpmn(spec) {
  // 泳道行范围
  const laneRows = new Map(spec.lanes.map(l => [l.id, [0, 0]]))
  for (const n of spec.nodes) { const r = laneRows.get(n.lane); r[0] = Math.min(r[0], n.row); r[1] = Math.max(r[1], n.row) }
  let y = POOL_Y
  const lanes = spec.lanes.map(l => {
    const [rmin, rmax] = laneRows.get(l.id)
    const h = (rmax - rmin) * ROWH + 80 + 2 * PAD
    const lane = { ...l, y, h, mainY: y + PAD + 40 - rmin * ROWH }
    y += h
    return lane
  })
  const laneById = new Map(lanes.map(l => [l.id, l]))
  const nodes = spec.nodes.map(n => {
    const [w, h] = SIZE[n.type] ?? ACT
    const cx = X0 + n.col * COLW, cy = laneById.get(n.lane).mainY + n.row * ROWH
    return { ...n, w, h, x: cx - w / 2, y: cy - h / 2, point: isPoint(n.type) }
  })
  const byId = new Map(nodes.map(n => [n.id, n]))
  const maxX = Math.max(...nodes.map(n => n.x + n.w)) + 100
  const pool = { x: POOL_X, y: POOL_Y, w: maxX - POOL_X, h: y - POOL_Y }
  const outCount = new Map(), inCount = new Map()
  for (const f of spec.flows) { outCount.set(f.from, (outCount.get(f.from) ?? 0) + 1); inCount.set(f.to, (inCount.get(f.to) ?? 0) + 1) }
  const pref = f => {
    const s = byId.get(f.from), t = byId.get(f.to)
    const sx = s.x + s.w / 2, sy = s.y + s.h / 2, tx = t.x + t.w / 2, ty = t.y + t.h / 2
    if (f.prefFrom || f.prefTo) return { prefFrom: f.prefFrom ?? null, prefTo: f.prefTo ?? null }
    if (Math.abs(sx - tx) < 1) return { prefFrom: [ty > sy ? 'D' : 'U'], prefTo: [ty > sy ? 'U' : 'D'] }
    const splitting = s.type === 'exclusiveGateway' && outCount.get(s.id) > 1 && Math.abs(sy - ty) > 1
    const merging = t.type === 'exclusiveGateway' && inCount.get(t.id) > 1 && Math.abs(sy - ty) > 1
    return { prefFrom: splitting ? [ty > sy ? 'D' : 'U'] : ['R'], prefTo: merging ? [ty > sy ? 'U' : 'D'] : ['L'] }
  }
  const hBlockedY = new Set(lanes.flatMap(l => [l.y, l.y + l.h]))
  const bounds = [POOL_X + 30 + 30 + 10, POOL_Y + 10, pool.x + pool.w - 10, pool.y + pool.h - 10]
  const last = new Set(spec.routeLast ?? [])
  let order = [...spec.flows.filter(f => !last.has(f.id)), ...spec.flows.filter(f => last.has(f.id))].map(f => ({ ...f, ...pref(f) }))
  let routes
  for (let attempt = 0; attempt < 60; attempt++) {
    routes = routeAll(nodes, order, { bounds, hBlockedY, leftPenalty: 2 })
    const failed = order.filter(e => !routes.get(e.id))
    if (process.env.DEBUG) console.log(spec.id, 'attempt', attempt, 'failed', failed.map(f => f.id).join(','))
    if (!failed.length) break
    order = [...failed, ...order.filter(e => routes.get(e.id))]
  }
  const missing = [...routes].filter(([, v]) => !v).map(([k]) => k)
  if (missing.length) return { missing }
  // 标签
  const segments = []
  for (const pts of routes.values()) for (let i = 0; i + 1 < pts.length; i++) segments.push([pts[i], pts[i + 1]])
  const labels = []
  const mkRect = (text, x, y) => { const lines = wrap(text, 90); const w = Math.ceil(Math.min(90, Math.max(...lines.map(textWidth))) + 4); return { x, y, w, h: lines.length * 14, lines } }
  const flowLabels = new Map(), shapeLabels = new Map()
  for (const f of spec.flows.filter(f => f.name)) {
    const pts = routes.get(f.id)
    const cands = []
    for (let i = 0; i + 1 < pts.length && i < 3; i++) {
      const [a, b] = [pts[i], pts[i + 1]]
      const probe = mkRect(f.name, 0, 0)
      if (a[1] === b[1]) {
        const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0])
        for (let x = x0 + 6; x + probe.w <= x1 + 40; x += 10) { cands.push(mkRect(f.name, x, a[1] - probe.h - 4)); cands.push(mkRect(f.name, x, a[1] + 4)) }
      } else {
        const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1])
        const ys = []; for (let yy = y0 + 4; yy + probe.h <= y1 - 2; yy += 6) ys.push(yy)
        if (b[1] < a[1]) ys.reverse()
        for (const yy of ys) { cands.push(mkRect(f.name, a[0] + 6, yy)); cands.push(mkRect(f.name, a[0] - probe.w - 6, yy)) }
      }
    }
    const r = placeLabel(cands, segments, nodes, labels)
    if (!r) throw new Error('无法放置连线标签 ' + f.id)
    labels.push(r); flowLabels.set(f.id, r)
  }
  for (const n of nodes.filter(n => n.point && n.name)) {
    const probe = mkRect(n.name, 0, 0)
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2
    const cands = []
    for (const d of [0, 10, 20, 30]) {
      cands.push(mkRect(n.name, cx - probe.w / 2, n.y + n.h + 6 + d))
      cands.push(mkRect(n.name, cx - probe.w / 2, n.y - probe.h - 6 - d))
    }
    for (const d of [0, 10, 20]) {
      cands.push(mkRect(n.name, n.x - probe.w - 8 - d, n.y - probe.h - 2))
      cands.push(mkRect(n.name, n.x + n.w + 8 + d, n.y - probe.h - 2))
      cands.push(mkRect(n.name, n.x - probe.w - 8 - d, n.y + n.h + 2))
      cands.push(mkRect(n.name, n.x + n.w + 8 + d, n.y + n.h + 2))
      cands.push(mkRect(n.name, n.x + n.w + 8 + d, cy - probe.h / 2))
      cands.push(mkRect(n.name, n.x - probe.w - 8 - d, cy - probe.h / 2))
    }
    const r = placeLabel(cands, segments, nodes, labels)
    if (!r) throw new Error('无法放置节点标签 ' + n.id)
    labels.push(r); shapeLabels.set(n.id, r)
  }
  return { missing, render: () => renderBpmn(spec, nodes, lanes, pool, routes, flowLabels, shapeLabels),
    svg: () => svgPreview(nodes.map(n => ({ ...n, shape: n.type === 'exclusiveGateway' ? 'diamond' : n.point ? 'circle' : 'rect', inner: !n.point, color: n.error ? '#c62828' : '#333' })),
      spec.flows.map(f => ({ pts: routes.get(f.id) })), labels,
      [{ ...pool, name: '' }, ...lanes.map(l => ({ x: pool.x + 30, y: l.y, w: pool.w - 30, h: l.h, name: l.name }))], [pool.x + pool.w + 40, pool.y + pool.h + 40]) }
}

function renderBpmn(spec, nodes, lanes, pool, routes, flowLabels, shapeLabels) {
  const L = []
  const tagOf = n => ({ startEvent: 'startEvent', endEvent: 'endEvent', exclusiveGateway: 'exclusiveGateway', task: 'task', userTask: 'userTask', serviceTask: 'serviceTask', businessRuleTask: 'businessRuleTask', callActivity: 'callActivity' }[n.type])
  L.push('<?xml version="1.0" encoding="UTF-8"?>')
  L.push(`<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="${spec.id}_definitions" targetNamespace="http://bpmn.io/schema/bpmn" exporter="qinghuazhi-model-layout" exporterVersion="1.0.0">`)
  const errors = [...new Map(nodes.filter(n => n.error).map(n => [n.error.id, n.error])).values()]
  for (const e of errors) L.push(`  <bpmn:error id="${e.id}" name="${esc(e.name)}" errorCode="${esc(e.code)}" />`)
  L.push(`  <bpmn:collaboration id="${spec.id}_collaboration">`)
  L.push(`    <bpmn:participant id="${spec.id}_participant" name="${esc(spec.participantName)}" processRef="${spec.processId}" />`)
  L.push('  </bpmn:collaboration>')
  L.push(`  <bpmn:process id="${spec.processId}" name="${esc(spec.processName)}" isExecutable="false">`)
  L.push(`    <bpmn:documentation>${esc(spec.documentation)}</bpmn:documentation>`)
  L.push(`    <bpmn:laneSet id="${spec.id}_lanes">`)
  for (const l of lanes) {
    L.push(`      <bpmn:lane id="${l.id}" name="${esc(l.name)}">`)
    for (const n of nodes.filter(n => n.lane === l.id)) L.push(`        <bpmn:flowNodeRef>${n.id}</bpmn:flowNodeRef>`)
    L.push('      </bpmn:lane>')
  }
  L.push('    </bpmn:laneSet>')
  for (const n of nodes) {
    const attrs = [`id="${n.id}"`, `name="${esc(n.name)}"`]
    if (n.decisionRef) attrs.push(`camunda:decisionRef="${n.decisionRef}"`)
    if (n.calledElement) attrs.push(`calledElement="${n.calledElement}"`)
    L.push(`    <bpmn:${tagOf(n)} ${attrs.join(' ')}>`)
    if (n.doc) L.push(`      <bpmn:documentation>${esc(n.doc)}</bpmn:documentation>`)
    for (const f of spec.flows.filter(f => f.to === n.id)) L.push(`      <bpmn:incoming>${f.id}</bpmn:incoming>`)
    for (const f of spec.flows.filter(f => f.from === n.id)) L.push(`      <bpmn:outgoing>${f.id}</bpmn:outgoing>`)
    if (n.loop) L.push(`      <bpmn:standardLoopCharacteristics id="${n.id}_loop" />`)
    if (n.error) L.push(`      <bpmn:errorEventDefinition id="${n.id}_error_def" errorRef="${n.error.id}" />`)
    if (n.timerCycle) L.push(`      <bpmn:timerEventDefinition id="${n.id}_timer_def">\n        <bpmn:timeCycle xsi:type="bpmn:tFormalExpression">${esc(n.timerCycle)}</bpmn:timeCycle>\n      </bpmn:timerEventDefinition>`)
    L.push(`    </bpmn:${tagOf(n)}>`)
  }
  for (const f of spec.flows) L.push(`    <bpmn:sequenceFlow id="${f.id}"${f.name ? ` name="${esc(f.name)}"` : ''} sourceRef="${f.from}" targetRef="${f.to}" />`)
  L.push('  </bpmn:process>')
  L.push(`  <bpmndi:BPMNDiagram id="${spec.id}_diagram">`)
  L.push(`    <bpmndi:BPMNPlane id="${spec.id}_plane" bpmnElement="${spec.id}_collaboration">`)
  const bounds = r => `<dc:Bounds x="${Math.round(r.x)}" y="${Math.round(r.y)}" width="${Math.round(r.w)}" height="${Math.round(r.h)}" />`
  L.push(`      <bpmndi:BPMNShape id="${spec.id}_participant_di" bpmnElement="${spec.id}_participant" isHorizontal="true">`)
  L.push(`        ${bounds(pool)}`)
  L.push('      </bpmndi:BPMNShape>')
  for (const l of lanes) {
    L.push(`      <bpmndi:BPMNShape id="${l.id}_di" bpmnElement="${l.id}" isHorizontal="true">`)
    L.push(`        ${bounds({ x: pool.x + 30, y: l.y, w: pool.w - 30, h: l.h })}`)
    L.push('      </bpmndi:BPMNShape>')
  }
  for (const n of nodes) {
    L.push(`      <bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}"${n.type === 'exclusiveGateway' ? ' isMarkerVisible="true"' : ''}>`)
    L.push(`        ${bounds(n)}`)
    const lab = shapeLabels.get(n.id)
    if (lab) L.push(`        <bpmndi:BPMNLabel>\n          ${bounds(lab)}\n        </bpmndi:BPMNLabel>`)
    L.push('      </bpmndi:BPMNShape>')
  }
  for (const f of spec.flows) {
    L.push(`      <bpmndi:BPMNEdge id="${f.id}_di" bpmnElement="${f.id}">`)
    for (const [x, y] of routes.get(f.id)) L.push(`        <di:waypoint x="${x}" y="${y}" />`)
    const lab = flowLabels.get(f.id)
    if (lab) L.push(`        <bpmndi:BPMNLabel>\n          ${bounds(lab)}\n        </bpmndi:BPMNLabel>`)
    L.push('      </bpmndi:BPMNEdge>')
  }
  L.push('    </bpmndi:BPMNPlane>')
  L.push('  </bpmndi:BPMNDiagram>')
  L.push('</bpmn:definitions>')
  return L.join('\n') + '\n'
}
