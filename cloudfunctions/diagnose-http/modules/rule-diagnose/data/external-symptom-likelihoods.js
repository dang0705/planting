'use strict'

const legacySymptomAliases = {
  yellow_edges: 'brown_tips',
  yellow_between_veins: 'pale_leaves',
  brown_leaf_tips: 'brown_tips',
  leaf_twist: 'distorted_growth',
  leaf_distortion: 'distorted_growth',
  leaf_holes: 'leaf_holes',
  dry_leaves: 'dry_crispy_leaves',
  crispy_leaves: 'dry_crispy_leaves',
  sticky_leaves: 'sticky_residue',
  powder_on_leaf: 'white_powder',
  mold_on_leaf: 'mold_on_leaf',
  dropping_leaves: 'leaf_drop',
  stunted_growth: 'slow_growth',
  tiny_red_dots: 'tiny_red_dots',
  aphids_visible: 'aphids_visible',
  white_flies: 'white_flies',
  scale_insects: 'brown_bumps',
  soil_smell: 'root_smell',
  soil_compaction: 'soil_compaction'
}

const externalSymptomDiseaseLikelihoods = {
  yellow_leaves: {
    overwatering: 0.4,
    underwatering: 0.2,
    nutrient_deficiency: 0.35,
    root_rot: 0.45,
    spider_mites: 0.2,
    scale_insects: 0.3,
    aphids: 0.25,
    whiteflies: 0.25,
    low_light: 0.35,
    succulent_root_rot: 0.4,
    orchid_root_rot: 0.45
  },
  pale_leaves: {
    nutrient_deficiency: 0.45,
    low_light: 0.35
  },
  leaf_holes: {
    visible_insects: 0.55
  },
  brown_tips: {
    underwatering: 0.4,
    sunburn: 0.35
  },
  brown_spots: {
    fungal_leaf_spot: 0.6,
    sunburn: 0.55,
    succulent_sunburn: 0.6
  },
  black_spots: {
    fungal_leaf_spot: 0.6,
    temperature_stress: 0.4,
    succulent_black_rot: 0.78
  },
  leaf_curl: {
    aphids: 0.65,
    spider_mites: 0.55
  },
  distorted_growth: {
    powdery_mildew: 0.45
  },
  soft_leaves: {
    root_rot: 0.65,
    overwatering: 0.5,
    succulent_black_rot: 0.85,
    orchid_crown_rot: 0.55,
    orchid_root_rot: 0.5
  },
  dry_crispy_leaves: {
    underwatering: 0.75,
    sunburn: 0.6
  },
  sticky_residue: {
    aphids: 0.85,
    scale_insects: 0.75,
    whiteflies: 0.7
  },
  white_powder: {
    powdery_mildew: 0.95
  },
  leaf_drop: {
    overwatering: 0.5,
    underwatering: 0.5,
    temperature_stress: 0.45,
    orchid_crown_rot: 0.6
  },
  wilting: {
    root_rot: 0.6,
    underwatering: 0.65,
    overwatering: 0.5,
    temperature_stress: 0.45,
    succulent_black_rot: 0.68,
    succulent_root_rot: 0.6,
    orchid_crown_rot: 0.72,
    orchid_root_rot: 0.75
  },
  slow_growth: {
    low_light: 0.7,
    nutrient_deficiency: 0.6,
    succulent_etiolation: 0.75
  },
  fine_webbing: {
    spider_mites: 0.95
  },
  tiny_red_dots: {
    spider_mites: 0.9
  },
  aphids_visible: {
    aphids: 0.95
  },
  white_flies: {
    whiteflies: 0.95
  },
  mold_on_leaf: {
    powdery_mildew: 0.45,
    fungal_leaf_spot: 0.35
  },
  root_smell: {
    root_rot: 0.7
  },
  mold_on_soil: {
    overwatering: 0.6,
    root_rot: 0.7,
    fungus_gnat: 0.55
  },
  soil_compaction: {
    nutrient_deficiency: 0.2
  }
}

module.exports = {
  legacySymptomAliases,
  externalSymptomDiseaseLikelihoods
}
