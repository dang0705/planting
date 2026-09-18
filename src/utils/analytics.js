/* oxlint-disable no-console */

export const ANALYTICS_EVENTS = Object.freeze({
  ENTER_USER_PLANT_WATERING: 'enter_user_plant_watering',
  ENTER_DIAGNOSE_QUESTIONS: 'enter_diagnose_questions',
  SAVE_USER_NEW_PLANT: 'save_user_new_plant',
  DIAGNOSE: 'diagnose',
  ISOLATED_WATERING_PLANNER: 'isolated_watering_planner',
  USER_CLICK_CREATE_PLANT: 'user_click_create_plant',
  USER_LOGIN_SUCCESS: 'user_login_success',
  PLANT_AI_IDENTIFY_SUCCESS: 'plant_ai_identify_success',
  PLANT_AI_IDENTIFY_CONFIRMED: 'plant_ai_identify_confirmed',
  USER_NEW_PLANT_CREATED: 'user_new_plant_created',
  DIAGNOSE_RESULT_READY: 'diagnose_result_ready',
  DIAGNOSE_QUESTION_COMPLETED: 'diagnose_question_completed',
  DIAGNOSE_FEEDBACK_SUBMITTED: 'diagnose_feedback_submitted',
  WATERING_PLAN_READY: 'watering_plan_ready',
  WATERING_REMINDER_SAVED: 'watering_reminder_saved',
  WATERING_RECORDED: 'watering_recorded',
  FERTILIZATION_REMINDER_SAVED: 'fertilization_reminder_saved',
  FERTILIZATION_RECORDED: 'fertilization_recorded',
  LIGHT_ENVIRONMENT_SAVED: 'light_environment_saved',
  AIR_ENVIRONMENT_SAVED: 'air_environment_saved'
})

export function reportAnalyticsEvent(eventName, data = {}) {
  const normalizedEventName = String(eventName || '').trim()
  if (!normalizedEventName) {
    return
  }

  // #ifdef MP-WEIXIN
  if (typeof wx === 'undefined' || typeof wx.reportEvent !== 'function') {
    return
  }
  try {
    wx.reportEvent(normalizedEventName, data && typeof data === 'object' ? data : {})
  } catch (error) {
    console.warn(`[analytics] ${normalizedEventName} 上报失败`, error)
  }
  // #endif
}
