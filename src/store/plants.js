import { defineStore } from 'pinia'
import { queryClient } from '@/lib/query-client.js'
import { USER_PLANTS_QUERY_KEY } from '@/vue-query/plants/queries/user-plants.js'
import {
  completeWateringReminder,
  fetchUserPlants,
  patchUserPlant,
  removeUserPlant
} from '@/api/plants-http.js'
import { useUserStore } from '@/store/user.js'
import { parsePlantDateTime } from '@/utils/plant-datetime.js'

function localDateString(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

let userPlantsRequestVersion = 0

export const usePlantStore = defineStore('plants', {
  state: () => ({
    userPlants: [],
    currentPlant: null,
    userPlantsScope: ''
  }),

  getters: {
    hasPlants: state => state.userPlants.length > 0,
    getLatestDiagnosis: state => plantId => {
      const plant = state.userPlants.find(p => p.id === plantId)
      if (!plant || !plant.diagnoses || plant.diagnoses.length === 0) {
        return null
      }
      return plant.diagnoses[0]
    },
    plantsNeedWater: state => {
      const now = new Date()
      return state.userPlants.filter(p => {
        if (!p.nextWater) {
          return false
        }
        const dueAt = parsePlantDateTime(p.nextWater)
        return Boolean(dueAt && dueAt <= now)
      })
    }
  },

  actions: {
    async getUserPlants(page = 1, pageSize = 50) {
      const requestVersion = ++userPlantsRequestVersion
      try {
        const userStore = useUserStore()
        const currentScope = userStore.openid || userStore.userId || ''
        if (this.userPlantsScope !== currentScope) {
          queryClient.removeQueries({ queryKey: USER_PLANTS_QUERY_KEY })
          this.userPlantsScope = currentScope
          this.userPlants = []
          this.currentPlant = null
        }
        const response = await fetchUserPlants(page, pageSize)
        const latestScope = userStore.openid || userStore.userId || ''
        if (
          requestVersion !== userPlantsRequestVersion ||
          latestScope !== currentScope ||
          this.userPlantsScope !== currentScope
        ) {
          return { success: false, stale: true, message: '账号已切换，请重新加载' }
        }
        if (response?.code !== 200) {
          return { success: false, message: '暂时无法加载植物，请检查网络后重试' }
        }

        const list = response.data.list || []
        this.userPlants = list.map(p => ({
          id: p.id,
          plantId: p.plantId || null,
          plantIdentityId: p.plantIdentityId || '',
          sessionPlantId: p.sessionPlantId || '',
          canonicalName: p.canonicalName || '',
          nickname: p.nickname || '',
          displayName:
            p.displayName || p.nickname || p.canonicalName || p.recognizedName || '未命名植物',
          recognizedName: p.recognizedName || '',
          sourceType: p.sourceType || 'catalog',
          recognitionType: p.recognitionType || '',
          recognitionConfidence: p.recognitionConfidence ?? null,
          identityResolutionStatus: p.identityResolutionStatus || '',
          visualCallBatchId: p.visualCallBatchId || '',
          location: p.location || '未设置',
          careLocationId: p.careLocationId || '',
          careLocation: p.careLocation || null,
          locationKey: p.locationKey || p.careLocation?.locationKey || '',
          lightEnvironment: p.lightEnvironment || null,
          airEnvironment: p.airEnvironment || null,
          image: p.image || '',
          imageUrl: p.imageUrl || '',
          photos: p.photos || [],
          imageFileId: p.imageFileId || '',
          lastWatered: p.lastWatered || null,
          nextWater: p.nextWater || null,
          wateringEvents: p.wateringEvents || null,
          fertilizationEvents: p.fertilizationEvents || null,
          wateringReminder: p.wateringReminder || null,
          fertilizationReminder: p.fertilizationReminder || null,
          createdAt: p.createdAt || null,
          plantDate: p.plantDate || null,
          notes: p.notes ?? '',
          genus: p.genus || '',
          familyEn: p.familyEn || '',
          latinName: p.latinName || '',
          watering: p.watering || null,
          fertilization: p.fertilization || null,
          fertilizationMonthly: p.fertilizationMonthly || null,
          sunning: p.sunning || null,
          ventilation: p.ventilation || null,
          temperatureMin: p.temperatureMin ?? null,
          temperatureMax: p.temperatureMax ?? null,
          humidityMin: p.humidityMin ?? null,
          humidityMax: p.humidityMax ?? null,
          varianceLevel: p.varianceLevel || '',
          healthStatus: p.healthStatus || 'unknown',
          healthScore: p.healthScore ?? null,
          potProfile: p.potProfile || null
        }))

        return { success: true, total: response.data.total }
      } catch (error) {
        console.error('获取用户植物列表失败:', error)
        return { success: false, message: '暂时无法加载植物，请检查网络后重试' }
      }
    },

    setCurrentPlant(plant) {
      this.currentPlant = plant
    },

    updateUserPlantLocal(id, updates) {
      const index = this.userPlants.findIndex(p => p.id === id)
      if (index !== -1) {
        const nextNickname = updates.nickname !== undefined ? updates.nickname : updates.nickName
        if (nextNickname !== undefined) {
          updates.nickname = nextNickname
          updates.displayName =
            nextNickname ||
            this.userPlants[index].canonicalName ||
            this.userPlants[index].recognizedName
        }
        this.userPlants[index] = { ...this.userPlants[index], ...updates }
      }
    },

    applyAirEnvironmentLocal(id, airEnvironment = null) {
      this.updateUserPlantLocal(id, { airEnvironment })
      if (this.currentPlant?.id === id) {
        this.currentPlant = { ...this.currentPlant, airEnvironment }
      }
    },

    async deleteUserPlant(id) {
      const plantId = parseInt(id, 10)
      if (!plantId || plantId < 1) {
        return { success: false, message: '无效的植物ID' }
      }
      try {
        const response = await removeUserPlant(plantId)
        if (response?.code === 200) {
          this.userPlants = this.userPlants.filter(p => p.id !== plantId)
          if (this.currentPlant?.id === plantId) {
            this.currentPlant = null
          }
          return {
            success: true,
            cleanupPending: Boolean(response?.data?.cleanupPending),
            message: response?.data?.cleanupPending ? '植物已删除，图片正在清理' : '已删除'
          }
        }
        return { success: false, message: '暂时无法删除植物，请检查网络后重试' }
      } catch (error) {
        console.error('删除植物失败:', error)
        return { success: false, message: '暂时无法删除植物，请检查网络后重试' }
      }
    },

    async optimisticUpdate(id, updates) {
      const originalPlant = this.userPlants.find(p => p.id === id)
      if (!originalPlant) {
        return { success: false, message: '植物不存在' }
      }

      this.updateUserPlantLocal(id, updates)

      try {
        const response = await patchUserPlant({ id, ...updates })
        if (response?.code === 200) {
          return { success: true }
        }
        this.updateUserPlantLocal(id, originalPlant)
        return { success: false, message: '暂时无法保存修改，请检查网络后重试' }
      } catch (error) {
        console.error('乐观更新失败:', error)
        this.updateUserPlantLocal(id, originalPlant)
        return { success: false, message: '暂时无法保存修改，请检查网络后重试' }
      }
    },

    async updateUserPlant(id, updates) {
      return this.optimisticUpdate(id, updates)
    },

    async savePotProfile(id, potProfileFields) {
      const plant = this.userPlants.find(p => p.id === id)
      if (!plant) {
        return { success: false, message: '植物不存在' }
      }
      const originalPotProfile = plant.potProfile
      // 后端 updateUserPlantInstance 消费扁平字段（potTopDiameterCm 等）；
      // 本地则维护嵌套 potProfile 视图（含 substrateComposition）供 UI 读取。
      let substrateComposition = null
      if (
        typeof potProfileFields.substrateType === 'string' &&
        potProfileFields.substrateType.startsWith('[')
      ) {
        try {
          substrateComposition = JSON.parse(potProfileFields.substrateType)
        } catch {
          substrateComposition = null
        }
      }
      plant.potProfile = { ...plant.potProfile, ...potProfileFields, substrateComposition }

      try {
        const response = await patchUserPlant({ id, ...potProfileFields })
        if (response?.code === 200) {
          return { success: true }
        }
        plant.potProfile = originalPotProfile
        return { success: false, message: '暂时无法保存盆型信息，请检查网络后重试' }
      } catch (error) {
        console.error('保存盆型档案失败:', error)
        plant.potProfile = originalPotProfile
        return { success: false, message: '暂时无法保存盆型信息，请检查网络后重试' }
      }
    },

    async completeWatering(id, { wateredDate = '', planId = '' } = {}) {
      try {
        const response = await completeWateringReminder({
          plantId: Number(id),
          wateredDate: wateredDate || localDateString(),
          planId: planId || this.userPlants.find(item => item.id === id)?.wateringReminder?.planId || ''
        })
        if (response?.code !== 200 || !response.data) {
          return { success: false, message: '浇水记录暂未保存，请检查网络后重试' }
        }
        this.updateUserPlantLocal(id, {
          lastWatered: response.data.lastWatered,
          nextWater: null,
          wateringReminder: null
        })
        return { success: true, data: response.data }
      } catch {
        return { success: false, message: '浇水记录暂未保存，请检查网络后重试' }
      }
    },

    applyWateringReminder(id, reminder = {}) {
      const plant = this.userPlants.find(p => p.id === id)
      if (!plant) {
        return
      }
      const updates = {
        wateringReminder: reminder || null
      }
      if (reminder?.lastWatered) {
        updates.lastWatered = reminder.lastWatered
      }
      if (reminder?.nextWaterDate) {
        updates.nextWater = reminder.nextWaterDate
      }
      if (Array.isArray(reminder?.wateringEvents)) {
        updates.wateringEvents = reminder.wateringEvents
      }
      this.updateUserPlantLocal(id, updates)
    }
  },
  persist: false
})
