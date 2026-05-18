-- Align audited follow-up copy with the visual-fact-to-cause-routing rule.
-- This script is intentionally conservative: it does not create new option keys.
-- Runtime synthetic questions provide the multi-choice differential probes.

UPDATE `question_library_v5_real`
SET
  `target_dimension` = CASE `question_key`
    WHEN 'q_holes_in_leaf_confirm' THEN 'structural_cause'
    WHEN 'q_chewed_edges_confirm' THEN 'structural_cause'
    WHEN 'q_skeletonized_leaves_confirm' THEN 'structural_cause'
    WHEN 'q_tunnels_in_leaf_confirm' THEN 'leaf_tunnel_pattern'
    WHEN 'q_powder_white_visible' THEN 'powder_pattern'
    ELSE `target_dimension`
  END,
  `routing_scope` = 'differential_probe',
  `question_text_cn` = CASE `question_key`
    WHEN 'q_holes_in_leaf_confirm' THEN '这些叶片孔洞周围，能看到小虫、黑色颗粒、黏液痕，或很新的不规则缺口吗？'
    WHEN 'q_chewed_edges_confirm' THEN '这些叶片边缘缺口周围，能看到小虫、黑色颗粒、黏液痕，或很新的不规则缺口吗？'
    WHEN 'q_skeletonized_leaves_confirm' THEN '这些网状缺损周围，能看到小虫、黑色颗粒、黏液痕，或很新的不规则缺口吗？'
    WHEN 'q_tunnels_in_leaf_confirm' THEN '这些线状痕迹更像叶片里面弯曲延伸的浅白隧道吗？'
    WHEN 'q_powder_white_visible' THEN '这些白色粉层最近有在叶面逐渐扩散或变多吗？'
    ELSE `question_text_cn`
  END,
  `question_text_user_cn` = CASE `question_key`
    WHEN 'q_holes_in_leaf_confirm' THEN '这些叶片孔洞周围，能看到小虫、黑色颗粒、黏液痕，或很新的不规则缺口吗？'
    WHEN 'q_chewed_edges_confirm' THEN '这些叶片边缘缺口周围，能看到小虫、黑色颗粒、黏液痕，或很新的不规则缺口吗？'
    WHEN 'q_skeletonized_leaves_confirm' THEN '这些网状缺损周围，能看到小虫、黑色颗粒、黏液痕，或很新的不规则缺口吗？'
    WHEN 'q_tunnels_in_leaf_confirm' THEN '这些线状痕迹更像叶片里面弯曲延伸的浅白隧道吗？'
    WHEN 'q_powder_white_visible' THEN '这些白色粉层最近有在叶面逐渐扩散或变多吗？'
    ELSE `question_text_user_cn`
  END,
  `help_text_cn` = CASE `question_key`
    WHEN 'q_holes_in_leaf_confirm' THEN '这题不是确认有没有孔洞，而是追问是否有更直接的虫害活动线索。'
    WHEN 'q_chewed_edges_confirm' THEN '这题不是确认有没有缺口，而是追问是否有更直接的虫害活动线索。'
    WHEN 'q_skeletonized_leaves_confirm' THEN '这题不是确认有没有网状缺损，而是追问是否有更直接的虫害活动线索。'
    WHEN 'q_tunnels_in_leaf_confirm' THEN '潜叶道通常像在叶肉内部延伸的弯曲浅色线，不等同于普通孔洞或表面划痕。'
    WHEN 'q_powder_white_visible' THEN '不要求擦拭白粉，只追问分布和扩散方式。'
    ELSE `help_text_cn`
  END
WHERE `question_key` IN (
  'q_holes_in_leaf_confirm',
  'q_chewed_edges_confirm',
  'q_skeletonized_leaves_confirm',
  'q_tunnels_in_leaf_confirm',
  'q_powder_white_visible'
)
  AND `data_status` = 'audited'
  AND `review_status` = 'audited';

UPDATE `question_option_mapping_v5_real`
SET
  `option_text_user_cn` = CASE `option_key`
    WHEN 'yes' THEN '是的'
    WHEN 'no' THEN '不是的'
    ELSE `option_text_user_cn`
  END
WHERE `question_key` IN (
  'q_holes_in_leaf_confirm',
  'q_chewed_edges_confirm',
  'q_skeletonized_leaves_confirm',
  'q_tunnels_in_leaf_confirm',
  'q_powder_white_visible'
)
  AND `option_key` IN ('yes', 'no')
  AND `data_status` = 'audited'
  AND `review_status` = 'audited';
