-- 仅用于补齐会话内追问问题题干，建议先在测试环境灰度执行
UPDATE `diagnosis_follow_ups` AS fu
JOIN `question_library_v5_real` AS q
  ON q.question_key = COALESCE(
    NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(fu.rationale, '$.qk'))), ''),
    NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(fu.rationale, '$.questionKey'))), ''),
    NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(fu.rationale, '$.question_key'))), ''),
    q.question_key
  )
SET
  fu.question_text = COALESCE(
    NULLIF(TRIM(fu.question_text), ''),
    NULLIF(TRIM(q.question_text_user_cn), ''),
    NULLIF(TRIM(q.question_text_cn), ''),
    fu.question_text
  )
WHERE fu.diagnosis_id = 'diag_1778837548954_2uk4jqbu'
  AND (fu.question_text IS NULL OR TRIM(fu.question_text) = '');
