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
        if (!p.nextWater) return false
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
          canonicalName: p.canonicalName || '',
          nickname: p.nickname || '',
          displayName: p.displayName || p.nickname || p.canonicalName || p.recognizedName || '未命名植物',
          recognizedName: p.recognizedName || '',
          location: p.location || '未设置',
          image: p.image || '',
          photos: p.photos || [],
          imageFileId: p.imageFileId || '',
          lastWatered: p.lastWatered || null,
          nextWater: p.nextWater || null,
          createdAt: p.createdAt || null,
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
          healthScore: p.healthScore ?? null
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
        const nextNickname =
          updates.nickname !== undefined ? updates.nickname : updates.nickName
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
      const plantId = parseInt(id)
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

    async completeWatering(id) {
      const plant = this.userPlants.find(item => item.id === id)
      const now = new Date()
      const nextWater = new Date(now)
      const freq = plant?.watering?.freq
      const minDays = Array.isArray(freq) && freq.length ? Number(freq[0] || 0) : 0
      const maxDays =
        Array.isArray(freq) && freq.length > 1 ? Number(freq[1] || minDays || 0) : minDays
      const intervalDays = Math.max(1, Math.round((minDays + maxDays) / 2) || 7)
      nextWater.setDate(nextWater.getDate() + intervalDays)

      return this.updateUserPlant(id, {
        lastWatered: now.toISOString(),
        nextWater: nextWater.toISOString()
      })
    }
  },
  persist: false
})
