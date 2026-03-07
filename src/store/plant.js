import { defineStore } from 'pinia'
import { getFileUrl } from '@/composables/useCloudFile.js'

export const usePlantStore = defineStore('plant', {
  state: () => ({
    // plants 表 - 预设植物目录
    defaultPlants: [],
    // user_plants 表 - 用户的植物（JOIN plants 表后的数据）
    userPlants: [],
    currentPlant: null
  }),

  getters: {
    hasPlants: state => state.userPlants.length > 0,
    // 获取植物的最新诊断
    getLatestDiagnosis: state => plantId => {
      const plant = state.userPlants.find(p => p.id === plantId)
      if (!plant || !plant.diagnoses || plant.diagnoses.length === 0) {
        return null
      }
      return plant.diagnoses[0] // 假设按时间倒序排列
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
    // ========== plants 表（预设植物目录）==========
    // 字段: _id, name, image_file_id, desc, category, sunning, watering_freq,
    //   recommended_min/max_humility, recommended_min/max_temperature,
    //   fertilization_frequency, ventilation
    setPlants(list) {
      this.defaultPlants = list
    },

    // ========== user_plants 表（用户的植物）==========
    // 表字段: id, _openid, plant_id, nick_name, ai_recognized_name,
    //   location, photos, last_watered, next_water, created_at, updated_at
    // getUserPlants 云函数 JOIN plants 表后额外返回:
    //   plant_name, image_file_id, sunning, watering_freq

    // 从云函数获取用户植物列表
    async getUserPlants(page = 1, pageSize = 50) {
      try {
        const res = await wx.cloud.callFunction({
          name: 'getUserPlants',
          data: { page, pageSize }
        })

        if (res.result.code === 200) {
          const list = res.result.data.list || []
          for (const plant of list) {
            if (plant.fileId) {
              plant.image = await getFileUrl(plant.fileId)
            } else if (plant.photos?.length) {
              plant.image = await getFileUrl(plant.photos[0])
            }
          }
          this.userPlants = list.map(p => ({
            id: p.id,
            plantId: p.plantId || null,
            name: p.name || '未命名植物',
            aiRecognizedName: p.aiRecognizedName || '',
            location: p.location || '未设置',
            image: p.image || '',
            photos: p.photos || [],
            fileId: p.fileId || '',
            lastWatered: p.lastWatered || null,
            nextWater: p.nextWater || null,
            createdAt: p.createdAt || null,
            sunning: p.sunning || null,
            wateringFreq: p.wateringFreq || null
          }))
          return { success: true, total: res.result.data.total }
        }
        return { success: false, message: res.result.message }
      } catch (e) {
        console.error('获取用户植物列表失败:', e)
        return { success: false, message: e.message }
      }
    },

    // 设置当前植物
    setCurrentPlant(plant) {
      this.currentPlant = plant
    },

    // 本地更新用户植物字段
    updateUserPlantLocal(id, updates) {
      const index = this.userPlants.findIndex(p => p.id === id)
      if (index !== -1) {
        if (updates.nickName !== undefined) {
          updates.name = updates.nickName
        }
        this.userPlants[index] = { ...this.userPlants[index], ...updates }
      }
    },

    // 云端删除用户植物
    async deleteUserPlant(id) {
      // 确保 id 是有效数字
      const plantId = parseInt(id)
      if (!plantId || plantId < 1) {
        console.error('deleteUserPlant: 无效的植物ID', id)
        return { success: false, message: '无效的植物ID' }
      }
      try {
        const res = await wx.cloud.callFunction({
          name: 'deleteUserPlant',
          data: { id: plantId }
        })
        if (res.result.code === 200) {
          this.userPlants = this.userPlants.filter(p => p.id !== plantId)
          return { success: true }
        }
        return { success: false, message: res.result.message }
      } catch (error) {
        console.error('删除植物失败:', error)
        return { success: false, message: error.message }
      }
    },

    // 乐观更新方法
    async optimisticUpdate(id, updates, cloudFunctionName = 'updateUserPlant') {
      // 保存原始状态用于回滚
      const originalPlant = this.userPlants.find(p => p.id === id)
      if (!originalPlant) {
        return { success: false, message: '植物不存在' }
      }

      // 立即更新本地状态（乐观更新）
      this.updateUserPlantLocal(id, updates)

      try {
        // 调用云端更新
        const res = await wx.cloud.callFunction({
          name: cloudFunctionName,
          data: { id, ...updates }
        })

        if (res.result.code === 200) {
          // 云端更新成功，不需要额外操作
          return { success: true }
        } else {
          // 云端更新失败，回滚到原始状态
          this.updateUserPlantLocal(id, originalPlant)
          return { success: false, message: res.result.message }
        }
      } catch (error) {
        // 网络错误或其他异常，回滚到原始状态
        console.error('乐观更新失败:', error)
        this.updateUserPlantLocal(id, originalPlant)
        return { success: false, message: error.message }
      }
    },

    // 云端更新用户植物（nickName, location 等）- 使用乐观更新
    async updateUserPlant(id, updates) {
      return this.optimisticUpdate(id, updates, 'updateUserPlant')
    },

    // 完成浇水
    async completeWatering(id, wateringFreq) {
      const now = new Date()
      const nextWater = new Date(now)
      const freq = wateringFreq || {}
      const days = freq.summer || 7
      nextWater.setDate(nextWater.getDate() + days)

      return this.updateUserPlant(id, {
        lastWatered: now.toISOString(),
        nextWater: nextWater.toISOString()
      })
    }
  }
})
