'use strict'

const evidenceTypeWeights = {
  pest: 1.0,
  sign: 0.9,
  symptom: 0.5
}

const evidenceCatalog = {
  yellow_leaves: { type: 'symptom', label: '叶片发黄' },
  pale_leaves: { type: 'symptom', label: '叶片褪色/苍白/发白' },
  brown_tips: { type: 'symptom', label: '叶尖/叶缘变褐' },
  brown_patches: { type: 'symptom', label: '叶片褐色斑块' },
  brown_spots: { type: 'symptom', label: '褐色圆形斑点' },
  black_spots: { type: 'symptom', label: '黑色斑点' },
  white_spots: { type: 'sign', label: '白色斑点' },
  white_powder: { type: 'sign', label: '叶片有白色粉末' },
  yellow_halo: { type: 'symptom', label: '斑点周围有黄晕' },
  bleached_leaves: { type: 'symptom', label: '叶片褪白/漂白' },
  soft_leaves: { type: 'symptom', label: '叶片软塌无力' },
  dry_crispy_leaves: { type: 'symptom', label: '叶片干燥/焦脆' },
  leaf_curl: { type: 'symptom', label: '叶片卷曲' },
  curled_leaves: { type: 'symptom', label: '叶片内卷' },
  distorted_growth: { type: 'symptom', label: '叶片扭曲变形' },
  stippled_leaves: { type: 'symptom', label: '叶片有细小点状失色' },
  small_leaves: { type: 'symptom', label: '新叶偏小' },
  leggy_growth: { type: 'symptom', label: '节间拉长/徒长' },
  wilting: { type: 'symptom', label: '植株萎蔫下垂' },
  leaf_drop: { type: 'symptom', label: '叶片脱落' },
  slow_growth: { type: 'symptom', label: '生长缓慢/停滞' },
  brown_stems: { type: 'symptom', label: '茎干变褐/变软' },
  stem_blackening: { type: 'symptom', label: '茎部发黑' },
  stem_softening: { type: 'symptom', label: '茎部发软' },
  translucent_leaves: { type: 'symptom', label: '叶片半透明水渍状' },
  sudden_leaf_drop: { type: 'symptom', label: '叶片突然大量脱落' },
  rosette_collapse: { type: 'symptom', label: '莲座塌陷' },
  root_smell: { type: 'sign', label: '根部/土壤有臭味' },
  mold_on_soil: { type: 'sign', label: '土壤表面有霉菌' },
  mold_on_leaf: { type: 'sign', label: '叶片有霉层/霉斑' },
  small_flies: { type: 'pest', label: '有小飞虫从土中飞出' },
  fine_webbing: { type: 'sign', label: '叶片有细网丝（蜘蛛网状）' },
  sticky_residue: { type: 'sign', label: '叶片/茎有黏液' },
  visible_insects: { type: 'pest', label: '可见小虫（蚜虫/粉虱等）' },
  aphids_visible: { type: 'pest', label: '可见蚜虫' },
  white_flies: { type: 'pest', label: '可见粉虱' },
  tiny_red_dots: { type: 'pest', label: '可见红色小点状螨虫' },
  brown_bumps: { type: 'pest', label: '茎叶有褐色硬突起（介壳虫）' },
  sooty_mold: { type: 'sign', label: '有黑色煤烟状霉层' },
  soil_compaction: { type: 'sign', label: '土壤板结' }
}

function getEvidenceMeta(name) {
  return evidenceCatalog[name] || { type: 'symptom', label: name }
}

module.exports = {
  evidenceCatalog,
  evidenceTypeWeights,
  getEvidenceMeta
}
