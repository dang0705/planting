import { defineStore } from 'pinia'
import { getFileUrl } from '@/composables/useCloudFile.js'
import { fetchUserPlants, patchUserPlant, removeUserPlant } from '@/api/plants-http.js'

export const usePlantStore = defineStore('plants', {
  state: () => ({
    userPlants: [],
    currentPlant: null
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
        return new Date(p.nextWater) <= now
      })
    }
  },

  actions: {
    async getUserPlants(page = 1, pageSize = 50) {
      try {
        const response = await fetchUserPlants(page, pageSize)
        if (response?.code !== 200) {
          return { success: false, message: response?.message || '获取失败' }
        }

        const list = response.data.list || []
        for (const plant of list) {
          if (plant.imageFileId) {
            plant.image = await getFileUrl(plant.imageFileId)
          } else if (plant.photos?.length) {
            plant.image = await getFileUrl(plant.photos[0])
          }
        }

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
          image: p.image || '',
          photos: p.photos || [],
          imageFileId: p.imageFileId || '',
          lastWatered: p.lastWatered || null,
          nextWater: p.nextWater || null,
          wateringEvents: p.wateringEvents || null,
          wateringReminder: p.wateringReminder || null,
          createdAt: p.createdAt || null,
          plantDate: p.plantDate || p.createdAt || null,
          notes: p.notes || '',
          genus: p.genus || '',
          familyEn: p.familyEn || '',
          latinName: p.latinName || '',
          watering: p.watering || null,
          fertilization: p.fertilization || null,
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
        return { success: false, message: error.message }
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

    async deleteUserPlant(id) {
      const plantId = parseInt(id, 10)
      if (!plantId || plantId < 1) {
        return { success: false, message: '无效的植物ID' }
      }
      try {
        const response = await removeUserPlant(plantId)
        if (response?.code === 200) {
          this.userPlants = this.userPlants.filter(p => p.id !== plantId)
          return { success: true }
        }
        return { success: false, message: response?.message || '删除失败' }
      } catch (error) {
        console.error('删除植物失败:', error)
        return { success: false, message: error.message }
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
        return { success: false, message: response?.message || '更新失败' }
      } catch (error) {
        console.error('乐观更新失败:', error)
        this.updateUserPlantLocal(id, originalPlant)
        return { success: false, message: error.message }
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
        return { success: false, message: response?.message || '保存失败' }
      } catch (error) {
        console.error('保存盆型档案失败:', error)
        plant.potProfile = originalPotProfile
        return { success: false, message: error.message }
      }
    },

    async completeWatering(id, { wateringEvents = null, nextWaterDate = null } = {}) {
      // nextWater 不再在前端用平均值公式计算，由后端 buildWateringPlanner 产出
      const updates = {}
      const nowIso = new Date().toISOString()

      if (wateringEvents && wateringEvents.length > 0) {
        updates.wateringEvents = wateringEvents
        const sorted = [...wateringEvents].sort((a, b) =>
          String(b.date || '').localeCompare(String(a.date || ''))
        )
        if (sorted[0]?.date) {
          updates.lastWatered = sorted[0].date
        }
      } else if (wateringEvents === null) {
        // 旧调用方式（无参数）：仅记录当前时间为 lastWatered
        updates.lastWatered = nowIso
      }

      if (nextWaterDate) {
        updates.nextWater = nextWaterDate
      }

      if (Object.keys(updates).length === 0) {
        return { success: false, message: '缺少浇水事件或下次浇水日期' }
      }
      return this.updateUserPlant(id, updates)
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
