/* eslint-disable no-var -- callbacks are serialized for the mini-program runtime. */

export async function readFixtureRequests(miniProgram, definition) {
  return miniProgram.evaluate(function (fixture) {
    var state = globalThis[fixture.runtimeSlot]
    return state && Array.isArray(state.requests) ? state.requests : []
  }, definition)
}

export async function inspectHomeFixtureState(miniProgram, definition, errorFor) {
  const observed = await miniProgram.evaluate(function (fixture) {
    try {
      var pinia = require('store/index.js').pinia
      var userModule = require('store/user.js')
      var plantModule = require('store/plants.js')
      var useUserStore = userModule.useUserStore || userModule.default
      var usePlantStore = plantModule.usePlantStore || plantModule.default
      var userStore = useUserStore(pinia)
      var plantStore = usePlantStore(pinia)
      var plantIds = (Array.isArray(plantStore.userPlants) ? plantStore.userPlants : [])
        .map(function (plant) {
          return Number(plant && plant.id)
        })
        .filter(function (id) {
          return typeof id === 'number' && isFinite(id)
        })
      return {
        ok: true,
        isAuthenticated: Boolean(userStore.isAuthenticated),
        isLoggedIn: Boolean(userStore.isLoggedIn),
        fixturePlantId: Number(fixture.plant.id),
        plantIds,
        fixturePlantPresent: plantIds.indexOf(Number(fixture.plant.id)) >= 0
      }
    } catch (error) {
      return { ok: false, reason: String(error && error.message ? error.message : error) }
    }
  }, definition)
  if (!observed?.ok) {
    throw errorFor('home readiness inspection failed', observed)
  }
  return observed
}
