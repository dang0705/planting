// 症状分类（用于前端症状选择）

const symptomCategories = [
  {
    id: 'leaves',
    label: '叶片问题',
    symptoms: [
      { id: 'yellow_leaves', label: '叶片发黄' },
      { id: 'pale_leaves', label: '叶片褪色/苍白/发白' },
      { id: 'brown_tips', label: '叶尖/叶缘变褐' },
      { id: 'brown_patches', label: '叶片褐色斑块' },
      { id: 'brown_spots', label: '褐色圆形斑点' },
      { id: 'black_spots', label: '黑色斑点' },
      { id: 'white_spots', label: '白色斑点' },
      { id: 'white_powder', label: '叶片有白色粉末' },
      { id: 'yellow_halo', label: '斑点周围有黄晕' },
      { id: 'bleached_leaves', label: '叶片褪白/漂白' },
      { id: 'soft_leaves', label: '叶片软塌无力' },
      { id: 'dry_crispy_leaves', label: '叶片干燥/焦脆' },
      { id: 'leaf_curl', label: '叶片卷曲' },
      { id: 'curled_leaves', label: '叶片内卷' },
      { id: 'distorted_growth', label: '叶片扭曲变形' },
      { id: 'stippled_leaves', label: '叶片有细小点状失色' },
      { id: 'small_leaves', label: '新叶偏小' },
      { id: 'leggy_growth', label: '节间拉长/徒长' }
    ]
  },
  {
    id: 'plant_state',
    label: '整体状态',
    symptoms: [
      { id: 'wilting', label: '植株萎蔫下垂' },
      { id: 'leaf_drop', label: '叶片脱落' },
      { id: 'slow_growth', label: '生长缓慢/停滞' },
      { id: 'brown_stems', label: '茎干变褐/变软' },
      { id: 'stem_blackening', label: '茎部发黑' },
      { id: 'stem_softening', label: '茎部发软' },
      { id: 'translucent_leaves', label: '叶片半透明水渍状' },
      { id: 'sudden_leaf_drop', label: '叶片突然大量脱落' },
      { id: 'rosette_collapse', label: '莲座塌陷' },
      { id: 'root_smell', label: '根部/土壤有臭味' }
    ]
  },
  {
    id: 'soil',
    label: '土壤/介质',
    symptoms: [
      { id: 'mold_on_soil', label: '土壤表面有霉菌' },
      { id: 'small_flies', label: '有小飞虫从土中飞出' },
      { id: 'soil_compaction', label: '土壤板结' }
    ]
  },
  {
    id: 'pests',
    label: '虫害迹象',
    symptoms: [
      { id: 'mold_on_leaf', label: '叶片有霉层/霉斑' },
      { id: 'fine_webbing', label: '叶片有细网丝（蜘蛛网状）' },
      { id: 'sticky_residue', label: '叶片/茎有黏液' },
      { id: 'visible_insects', label: '可见小虫（蚜虫/粉虱等）' },
      { id: 'aphids_visible', label: '可见蚜虫' },
      { id: 'white_flies', label: '可见粉虱' },
      { id: 'tiny_red_dots', label: '可见红色小点状螨虫' },
      { id: 'brown_bumps', label: '茎叶有褐色硬突起（介壳虫）' },
      { id: 'sooty_mold', label: '有黑色煤烟状霉层' }
    ]
  }
]
module.exports = { symptomCategories }
