// 生成器公共库：正交 A* 布线、标签放置、XML 转义、SVG 预览。
export const G = 10

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 估算 11px 字体文本宽度。 */
export function textWidth(s) {
  let w = 0
  for (const ch of s) w += /[\u0000-ÿ]/.test(ch) ? 6.2 : 11.5
  return w
}
/** 按 maxWidth 折行（bpmn-js 外部标签固定 90px 折行）。 */
export function wrap(s, maxWidth) {
  const lines = []
  let cur = ''
  for (const ch of s) {
    if (textWidth(cur + ch) > maxWidth && cur) { lines.push(cur); cur = ch } else cur += ch
  }
  if (cur) lines.push(cur)
  return lines
}

class Heap {
  constructor() { this.a = [] }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m } } return top }
  get size() { return this.a.length }
}

const DIRS = { R: [1, 0], L: [-1, 0], D: [0, 1], U: [0, -1] }
const key = (x, y) => x + ',' + y

/**
 * 节点端口：返回 {side, P(精确端点), S(网格桩点), stub(桩上网格点)}。
 * kind: rect（可多端口偏移）| point（菱形、圆：只在四个顶点）。
 */
function portsOf(n) {
  const out = []
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2
  const sides = [
    ['R', n.x + n.w, cy, 1, 0], ['L', n.x, cy, -1, 0], ['D', cx, n.y + n.h, 0, 1], ['U', cx, n.y, 0, -1],
  ]
  for (const [side, px, py, dx, dy] of sides) {
    const len = dx !== 0 ? n.h : n.w
    const offsets = n.point ? [0] : [0, -20, 20, -40, 40, -60, 60].filter(o => Math.abs(o) <= len / 2 - 10)
    for (const o of offsets) {
      const P = dx !== 0 ? [px, py + o] : [px + o, py]
      // 桩点：沿法向外移至少 20，并落在网格上
      let S
      if (dx !== 0) { const t = P[0] + dx * 20; S = [dx > 0 ? Math.ceil(t / G) * G : Math.floor(t / G) * G, P[1]] }
      else { const t = P[1] + dy * 20; S = [P[0], dy > 0 ? Math.ceil(t / G) * G : Math.floor(t / G) * G] }
      const stub = []
      if (dx !== 0) { for (let x = S[0]; dx > 0 ? x > P[0] : x < P[0]; x -= dx * G) if (Number.isInteger(x / G)) stub.push([x, S[1]]) }
      else { for (let y = S[1]; dy > 0 ? y > P[1] : y < P[1]; y -= dy * G) if (Number.isInteger(y / G)) stub.push([S[0], y]) }
      out.push({ node: n.id, side, off: o, P, S, stub, dir: side })
    }
  }
  return out
}

/**
 * 布线器。nodes: [{id,x,y,w,h,point}]；edges: [{id,from,to,prefFrom?,prefTo?}]
 * opts: { bounds:[x0,y0,x1,y1], hBlockedY:Set(横向禁止的 y，泳道边界), leftPenalty }
 */
export function routeAll(nodes, edges, opts) {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const blocked = new Set()
  const owner = new Map()
  const M = 10
  for (const n of nodes) {
    for (let x = Math.floor((n.x - M) / G) * G; x <= n.x + n.w + M; x += G)
      for (let y = Math.floor((n.y - M) / G) * G; y <= n.y + n.h + M; y += G)
        if (x >= n.x - M && x <= n.x + n.w + M && y >= n.y - M && y <= n.y + n.h + M) { const k = key(x, y); blocked.add(k); owner.set(k, [...(owner.get(k) ?? []), n.id]) }
  }
  for (const extra of opts.extraBlocked ?? []) blocked.add(key(extra[0], extra[1]))
  const occupied = new Set()
  const usedPorts = new Set()
  const portCache = new Map(nodes.map(n => [n.id, portsOf(n)]))
  const [bx0, by0, bx1, by1] = opts.bounds
  const results = new Map()
  const near = (x, y) => occupied.has(key(x + G, y)) || occupied.has(key(x - G, y)) || occupied.has(key(x, y + G)) || occupied.has(key(x, y - G))

  for (const e of edges) {
    const src = byId.get(e.from), tgt = byId.get(e.to)
    if (!src || !tgt) throw new Error('未知节点 ' + e.id)
    const free = (p, self) => { const k = key(p[0], p[1]); if (occupied.has(k)) return false; if (!blocked.has(k)) return true; const o = owner.get(k) ?? ['?']; return o.every(id => id === self) }
    const okPort = p => !usedPorts.has(p.node + p.side + p.off) && p.stub.every(q => free(q, p.node)) && (!opts.hBlockedY?.has(p.S[1]) || p.dir === 'U' || p.dir === 'D')
    const pref = (n, p, list) => (list && !list.includes(p.side) ? 30 : 0) + Math.abs(p.off) / 10
    const srcPorts = portCache.get(src.id).filter(p => okPort(p) && !(src.point && usedPorts.has(p.node + p.side)))
    const tgtPorts = portCache.get(tgt.id).filter(p => okPort(p) && !(tgt.point && usedPorts.has(p.node + p.side)))
    // A*：多起点多终点
    const goals = new Map()
    for (const p of tgtPorts) goals.set(key(p.S[0], p.S[1]), p)
    const h = (x, y) => { let m = Infinity; for (const p of tgtPorts) m = Math.min(m, (Math.abs(p.S[0] - x) + Math.abs(p.S[1] - y)) / G); return m }
    const heap = new Heap()
    const best = new Map(), prev = new Map()
    for (const p of srcPorts) {
      const k = key(p.S[0], p.S[1]) + '|' + p.dir
      const c = pref(src, p, e.prefFrom)
      if (!best.has(k) || best.get(k) > c) { best.set(k, c); prev.set(k, { start: p }); heap.push([c + h(p.S[0], p.S[1]), c, p.S[0], p.S[1], p.dir]) }
    }
    let found = null
    let iter = 0
    while (heap.size && iter++ < 400000) {
      const [, c, x, y, d] = heap.pop()
      const k = key(x, y) + '|' + d
      if (best.get(k) < c) continue
      const gp = goals.get(key(x, y))
      if (gp) {
        // 末段必须沿目标端口法向进入
        const need = { R: 'L', L: 'R', D: 'U', U: 'D' }[gp.dir]
        const fc = c + (d === need ? 0 : 8) + pref(tgt, gp, e.prefTo)
        if (!found || fc < found.cost) found = { cost: fc, k, gp }
        if (d === need) break
        continue
      }
      for (const [nd, [dx, dy]] of Object.entries(DIRS)) {
        const nx = x + dx * G, ny = y + dy * G
        if (nx < bx0 || nx > bx1 || ny < by0 || ny > by1) continue
        if ({ R: 'L', L: 'R', U: 'D', D: 'U' }[d] === nd) continue
        if (dy === 0 && opts.hBlockedY?.has(y)) continue
        const nk = key(nx, ny)
        if (!goals.has(nk) && (blocked.has(nk) || occupied.has(nk))) continue
        if (goals.has(nk) && occupied.has(nk)) continue
        let nc = c + 1 + (nd !== d ? 8 : 0) + (near(nx, ny) ? 3 : 0) + (nd === 'L' ? (opts.leftPenalty ?? 0) : 0)
        const sk = nk + '|' + nd
        if (!best.has(sk) || best.get(sk) > nc) { best.set(sk, nc); prev.set(sk, { from: k }); heap.push([nc + h(nx, ny), nc, nx, ny, nd]) }
      }
    }
    if (!found) { results.set(e.id, null); continue }
    // 回溯
    const pts = []
    let k = found.k
    let startPort = null
    for (;;) {
      const [xy] = k.split('|')
      const [x, y] = xy.split(',').map(Number)
      pts.push([x, y])
      const pv = prev.get(k)
      if (pv.start) { startPort = pv.start; break }
      k = pv.from
    }
    pts.reverse()
    const tp = found.gp
    const full = [startPort.P, ...pts, tp.P]
    // 标记占用（网格点）
    const mark = (a, b) => {
      if (a[0] === b[0]) { const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])]; for (let y = Math.ceil(y0 / G) * G; y <= y1; y += G) occupied.add(key(a[0], y)) }
      else { const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])]; for (let x = Math.ceil(x0 / G) * G; x <= x1; x += G) occupied.add(key(x, a[1])) }
    }
    for (let i = 0; i + 1 < full.length; i++) mark(full[i], full[i + 1])
    usedPorts.add(startPort.node + startPort.side + startPort.off); usedPorts.add(tp.node + tp.side + tp.off)
    if (src.point) usedPorts.add(startPort.node + startPort.side)
    if (tgt.point) usedPorts.add(tp.node + tp.side)
    results.set(e.id, simplify(full))
  }
  return results
}

/** 去掉共线中间点。 */
export function simplify(pts) {
  const out = []
  for (const p of pts) {
    if (out.length && out.at(-1)[0] === p[0] && out.at(-1)[1] === p[1]) continue
    out.push(p)
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3)
      if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) out.splice(out.length - 2, 1)
      else break
    }
  }
  return out
}

/** 矩形与线段是否相交（含贴边视为相交，pad 外扩）。 */
export function rectHitsSeg(r, a, b, pad = 0) {
  const x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad
  const sx0 = Math.min(a[0], b[0]), sx1 = Math.max(a[0], b[0]), sy0 = Math.min(a[1], b[1]), sy1 = Math.max(a[1], b[1])
  return sx1 >= x0 && sx0 <= x1 && sy1 >= y0 && sy0 <= y1
}
export const rectsOverlap = (a, b, pad = 0) => a.x - pad < b.x + b.w && b.x < a.x + a.w + pad && a.y - pad < b.y + b.h && b.y < a.y + a.h + pad

/**
 * 标签放置：候选位置中选第一个不压线、不压节点、不压其他标签的。
 */
export function placeLabel(cands, segments, nodes, labels) {
  for (const r of cands) {
    if (segments.some(([a, b]) => rectHitsSeg(r, a, b, 3))) continue
    if (nodes.some(n => rectsOverlap(r, n, 3))) continue
    if (labels.some(l => rectsOverlap(r, l, 3))) continue
    return r
  }
  return null
}

/** 生成 SVG 预览（仅本地查看）。 */
export function svgPreview(nodes, edges, labels, containers, size) {
  const sq = Math.max(size[0], size[1]); const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${sq}" height="${sq}" viewBox="0 0 ${sq} ${sq}" font-family="PingFang SC, sans-serif" font-size="11"><rect width="100%" height="100%" fill="white"/>`]
  for (const c of containers) parts.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="none" stroke="#999"/><text x="${c.x + 4}" y="${c.y + 14}" fill="#666">${esc(c.name ?? '')}</text>`)
  for (const n of nodes) {
    const stroke = n.color ?? '#333'
    if (n.shape === 'diamond') parts.push(`<polygon points="${n.x + n.w / 2},${n.y} ${n.x + n.w},${n.y + n.h / 2} ${n.x + n.w / 2},${n.y + n.h} ${n.x},${n.y + n.h / 2}" fill="#fff" stroke="${stroke}"/>`)
    else if (n.shape === 'circle') parts.push(`<circle cx="${n.x + n.w / 2}" cy="${n.y + n.h / 2}" r="${n.w / 2}" fill="#fff" stroke="${stroke}"/>`)
    else parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8" fill="#fff" stroke="${stroke}"/>`)
    if (n.inner) wrap(n.name, n.w - 10).forEach((line, i, arr) => parts.push(`<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 - (arr.length - 1) * 7 + i * 14 + 4}" text-anchor="middle">${esc(line)}</text>`))
  }
  for (const e of edges) if (e.pts) parts.push(`<polyline points="${e.pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${e.color ?? '#1565c0'}" stroke-width="1.5"/><circle cx="${e.pts.at(-1)[0]}" cy="${e.pts.at(-1)[1]}" r="3" fill="${e.color ?? '#1565c0'}"/>`)
  for (const l of labels) { parts.push(`<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" fill="none" stroke="#e0a000" stroke-dasharray="2"/>`); l.lines.forEach((line, i) => parts.push(`<text x="${l.x + l.w / 2}" y="${l.y + 11 + i * 14}" text-anchor="middle" fill="#a05000">${esc(line)}</text>`)) }
  parts.push('</svg>')
  return parts.join('\n')
}
