'use strict'

const USER_PLANT_SELECT = [
  'id',
  'record_version',
  'plant_id',
  'plant_identity_id',
  'session_plant_id',
  'canonical_name',
  'recognized_name',
  'source_type',
  'recognition_type',
  'recognition_confidence',
  'identity_resolution_status',
  'visual_call_batch_id',
  'nickname',
  'location',
  'plant_date',
  'notes',
  'photos',
  'light_environment_json',
  'air_environment_json',
  'last_watered',
  'next_water',
  'created_at',
  'updated_at',
  'plant_genus',
  'plant_family_en',
  'plant_latin_name',
  'pot_top_diameter_cm',
  'pot_bottom_diameter_cm',
  'pot_height_cm',
  'has_drainage_hole',
  'pot_material',
  'substrate_type',
  'pot_profile_version',
  'pot_profile_source',
  'pot_profile_confidence'
].join(',')

const USER_PLANT_SQL_SELECT = USER_PLANT_SELECT.split(',')
  .map(field => `up.${field}`)
  .join(', ')

const DISPLAYABLE_IDENTITY_SQL = `(
  LOWER(TRIM(COALESCE(up.plant_id, ''))) NOT IN ('', 'null', 'undefined')
  OR LOWER(TRIM(COALESCE(up.plant_identity_id, ''))) NOT IN ('', 'null', 'undefined')
  OR LOWER(TRIM(COALESCE(up.session_plant_id, ''))) NOT IN ('', 'null', 'undefined')
  OR LOWER(TRIM(COALESCE(up.canonical_name, ''))) NOT IN ('', 'null', 'undefined')
  OR LOWER(TRIM(COALESCE(up.recognized_name, ''))) NOT IN ('', 'null', 'undefined')
  OR LOWER(TRIM(COALESCE(up.nickname, ''))) NOT IN ('', 'null', 'undefined')
)`

const CATALOG_LOOKUP_SQL = `COALESCE(
  NULLIF(NULLIF(NULLIF(TRIM(up.plant_identity_id), ''), 'null'), 'undefined') COLLATE utf8mb4_unicode_ci,
  NULLIF(NULLIF(NULLIF(TRIM(up.plant_id), ''), 'null'), 'undefined') COLLATE utf8mb4_unicode_ci,
  NULLIF(NULLIF(NULLIF(TRIM(up.session_plant_id), ''), 'null'), 'undefined') COLLATE utf8mb4_unicode_ci
)`

const CATALOG_MATCH_SQL = `
  SELECT plant_identity_id, session_plant_id, canonical_identity_name, canonical_identity_name_cn,
         canonical_identity_name_en, primary_display_name, family_name_cn, family_name_en,
         family_name_canonical, genus_name, scientific_name, cover_image_ref
    FROM plant_identity_entities
   WHERE is_active = 1 AND (
     plant_identity_id COLLATE utf8mb4_unicode_ci = ${CATALOG_LOOKUP_SQL}
     OR session_plant_id COLLATE utf8mb4_unicode_ci = ${CATALOG_LOOKUP_SQL}
   )
   ORDER BY CASE WHEN session_plant_id COLLATE utf8mb4_unicode_ci = ${CATALOG_LOOKUP_SQL} THEN 0 ELSE 1 END,
            primary_display_name, plant_identity_id
   LIMIT 1`

function buildUserPlantListSql({ plantId = null } = {}) {
  const plantIdCondition = plantId === null ? '' : ' AND up.id = {{plantId}}'
  return `SELECT ${USER_PLANT_SQL_SELECT}, COUNT(*) OVER() AS total_count,
            ds.health_status AS diagnosis_health_status, ds.health_score AS diagnosis_health_score,
            cat.plant_identity_id AS catalog_plant_identity_id, cat.session_plant_id AS catalog_session_plant_id,
            cat.canonical_identity_name AS catalog_canonical_identity_name, cat.canonical_identity_name_cn AS catalog_canonical_identity_name_cn,
            cat.canonical_identity_name_en AS catalog_canonical_identity_name_en, cat.primary_display_name AS catalog_primary_display_name,
            cat.family_name_cn AS catalog_family_name_cn, cat.family_name_en AS catalog_family_name_en, cat.family_name_canonical AS catalog_family_name_canonical,
            cat.genus_name AS catalog_genus_name, cat.scientific_name AS catalog_scientific_name, cat.cover_image_ref AS catalog_cover_image_ref,
            care.id AS care_id, care._openid AS care_openid, care.plant_id AS care_plant_id, care.user_id AS care_user_id,
            care.location_key AS care_location_key, care.city_name AS care_city_name, care.latitude AS care_latitude, care.longitude AS care_longitude,
            care.weather_location AS care_weather_location, care.source AS care_source,
            water.id AS watering_id, water.user_plant_id AS watering_user_plant_id, water.plan_id AS watering_plan_id,
            water.reminder_type AS watering_reminder_type, water.status AS watering_status, water.last_watered AS watering_last_watered,
            water.next_water_date AS watering_next_water_date, water.next_time AS watering_next_time, water.created_at AS watering_created_at, water.updated_at AS watering_updated_at,
            fert.id AS fertilization_id, fert.user_plant_id AS fertilization_user_plant_id, fert.plan_id AS fertilization_plan_id,
            fert.status AS fertilization_status, fert.reminder_kind AS fertilization_reminder_kind, fert.fertilizer_type AS fertilization_fertilizer_type,
            fert.rule_month AS fertilization_rule_month, fert.last_applied_date AS fertilization_last_applied_date, fert.last_date_source AS fertilization_last_date_source,
            fert.next_check_date AS fertilization_next_check_date, fert.next_time AS fertilization_next_time, fert.completed_date AS fertilization_completed_date,
            fert.expires_at AS fertilization_expires_at, fert.created_at AS fertilization_created_at, fert.updated_at AS fertilization_updated_at
       FROM user_plant_instances up
       LEFT JOIN LATERAL (
         SELECT health_status, health_score FROM diagnosis_sessions
          WHERE _openid = {{openid}} AND user_plant_id = up.id
          ORDER BY created_at DESC, diagnosis_id DESC LIMIT 1
       ) ds ON TRUE
       LEFT JOIN LATERAL (${CATALOG_MATCH_SQL}) cat ON TRUE
       LEFT JOIN LATERAL (
         SELECT id, _openid, plant_id, user_id, location_key, city_name, latitude, longitude, weather_location, source
           FROM plant_care_locations
          WHERE _openid = {{openid}} AND plant_id = up.id
          ORDER BY updated_at DESC, id DESC LIMIT 1
       ) care ON TRUE
       LEFT JOIN LATERAL (
         SELECT id, user_plant_id, plan_id, reminder_type, status, last_watered, next_water_date, next_time, created_at, updated_at
           FROM user_watering_reminder_events
          WHERE _openid = {{openid}} AND user_plant_id = up.id AND reminder_type = 'water' AND status = 'active'
          ORDER BY next_time DESC, created_at DESC, id DESC LIMIT 1
       ) water ON TRUE
       LEFT JOIN LATERAL (
         SELECT id, user_plant_id, plan_id, status, reminder_kind, fertilizer_type, rule_month, last_applied_date,
                last_date_source, next_check_date, next_time, completed_date, expires_at, created_at, updated_at
           FROM user_fertilization_reminder_events
          WHERE _openid = {{openid}} AND user_plant_id = up.id AND status = 'active'
          ORDER BY created_at DESC, id DESC LIMIT 1
       ) fert ON TRUE
      WHERE (
              (
                {{userId}} <> ''
                AND up.owner_user_id = {{userId}}
              )
              OR (
                (up.owner_user_id <=> NULL OR up.owner_user_id = '')
                AND BINARY up._openid = BINARY {{openid}}
              )
            )
        AND ${DISPLAYABLE_IDENTITY_SQL}${plantIdCondition}
      ORDER BY up.created_at DESC, up.id DESC
      LIMIT {{limit}} OFFSET {{offset}}`
}

module.exports = {
  buildUserPlantListSql,
  _test: {
    USER_PLANT_SELECT,
    USER_PLANT_SQL_SELECT,
    DISPLAYABLE_IDENTITY_SQL,
    CATALOG_LOOKUP_SQL,
    CATALOG_MATCH_SQL
  }
}
