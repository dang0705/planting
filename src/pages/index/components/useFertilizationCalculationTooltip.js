import { onBeforeUnmount, ref } from 'vue'

const CALCULATION_TOOLTIP_AUTO_CLOSE_MS = 10000

export function useFertilizationCalculationTooltip() {
  const showCalculationTooltip = ref(false)
  let calculationTooltipTimer = null

  function clearCalculationTooltipTimer() {
    if (calculationTooltipTimer) {
      clearTimeout(calculationTooltipTimer)
      calculationTooltipTimer = null
    }
  }

  function hideCalculationTooltip() {
    clearCalculationTooltipTimer()
    showCalculationTooltip.value = false
  }

  function showCalculationTooltipForTenSeconds() {
    clearCalculationTooltipTimer()
    showCalculationTooltip.value = true
    calculationTooltipTimer = setTimeout(() => {
      showCalculationTooltip.value = false
      calculationTooltipTimer = null
    }, CALCULATION_TOOLTIP_AUTO_CLOSE_MS)
  }

  onBeforeUnmount(hideCalculationTooltip)

  return {
    showCalculationTooltip,
    hideCalculationTooltip,
    showCalculationTooltipForTenSeconds
  }
}
