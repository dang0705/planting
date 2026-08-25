import { computed, ref } from 'vue'

export function useWateringAdvisorMyPlants({ userStore, plantStore, searchRef }) {
  const showMyPlantsList = ref(false)
  const loadingMyPlants = ref(false)
  const shouldShowMyPlantsLoading = computed(
    () => loadingMyPlants.value && !plantStore.userPlants.length
  )

  function handleScrollLower() {
    searchRef.value?.loadNextPage()
  }

  async function openMyPlantsList() {
    showMyPlantsList.value = true
    if (!(await userStore.ensureLogin())) {
      showMyPlantsList.value = false
      return
    }
    if (plantStore.userPlants.length) {
      await plantStore.getUserPlants()
      return
    }
    loadingMyPlants.value = true
    try {
      await plantStore.getUserPlants()
    } finally {
      loadingMyPlants.value = false
    }
  }

  function closeMyPlantsList() {
    showMyPlantsList.value = false
  }

  async function handleMyPlantsPanelToggle(expanded) {
    if (expanded) {
      await openMyPlantsList()
      return
    }
    closeMyPlantsList()
  }

  return {
    showMyPlantsList,
    shouldShowMyPlantsLoading,
    handleScrollLower,
    handleMyPlantsPanelToggle
  }
}
