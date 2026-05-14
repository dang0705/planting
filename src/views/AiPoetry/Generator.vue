<template>
  <div class="min-h-screen bg-[#F8F5F0] font-serif">
    <!-- 顶部导航 -->
    <header class="bg-white/80 backdrop-blur-sm border-b-2 border-[#F8F5F0]">
      <nav class="container mx-auto px-6 py-4 flex justify-between items-center">
        <div class="flex items-center space-x-3">
          <i class="fas fa-feather-alt text-[#1B4332] text-2xl"></i>
          <h1 class="font-serif text-2xl font-bold text-[#2C1810]">诗意AI</h1>
        </div>
        
        <div class="flex items-center space-x-6">
          <div class="flex items-center space-x-4">
            <span class="text-sm text-[#2C1810] opacity-70">
              {{ userInfo?.profile?.username || '诗人' }}
            </span>
            <div class="w-8 h-8 bg-[#D4A574] rounded-full flex items-center justify-center text-white font-bold">
              {{ (userInfo?.profile?.username || 'U').charAt(0).toUpperCase() }}
            </div>
          </div>
          
          <!-- 使用统计 -->
          <div class="hidden md:block px-4 py-2 bg-[#F8F5F0] rounded-lg">
            <div class="text-xs text-[#2C1810] opacity-60">今日剩余</div>
            <div class="font-bold text-[#1B4332]">
              {{ usageRemaining }} <span v-if="userSubscription?.plan === 'free'">/ 5</span>
            </div>
          </div>
          
          <button @click="showUpgrade = true" class="text-sm border border-[#D4A574] text-[#D4A574] px-4 py-2 hover:bg-[#D4A574] hover:text-white transition-colors">
            升级套餐
          </button>
        </div>
      </nav>
    </header>

    <main class="container mx-auto px-6 py-12">
      <div class="grid grid-cols-12 gap-12">
        
        <!-- 左侧创作区 (黄金比例) -->
        <div class="col-span-7">
          <div class="bg-white p-8 shadow-lg" style="transform: rotate(-0.5deg);">
            <div class="transform rotate-[0.5deg]">
              <h2 class="font-serif text-3xl font-bold text-[#2C1810] mb-8 text-center">诗意创作</h2>
              
              <!-- 主题输入 -->
              <div class="mb-8">
                <label class="block text-lg text-[#2C1810] mb-4 font-serif">
                  请输入创作主题或意境
                </label>
                <textarea
                  v-model="poetryInput"
                  rows="4"
                  placeholder="例如：春日踏青，桃花满山，抒发对自然的感悟..."
                  class="w-full p-4 border-2 border-[#F8F5F0] focus:border-[#D4A574] outline-none transition-colors resize-none bg-[#F8F5F0]/30"
                  :disabled="generating || !canGenerate"
                ></textarea>
                
                <!-- 免费用户提示 -->
                <div v-if="userSubscription?.plan === 'free' && usageRemaining <= 1" class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div class="flex items-center space-x-2 text-sm text-amber-800">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>今日剩余调用次数不多，升级付费套餐可无限创作</span>
                  </div>
                </div>
              </div>

              <!-- 生成按钮 -->
              <button
                @click="generatePoetry"
                :disabled="!canGenerate || generating || !poetryInput.trim()"
                class="w-full bg-[#2C1810] text-white py-4 font-serif text-xl hover:bg-[#1C1917] transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-3"
              >
                <i v-if="generating" class="fas fa-spinner animate-spin"></i>
                <i v-else class="fas fa-magic"></i>
                <span>{{ generating ? '诗意在酝酿中...' : (canGenerate ? '生成诗歌' : '请先登录') }}</span>
              </button>

              <!-- 生成的诗歌 -->
              <div v-if="generatedPoetry" class="mt-8 p-6 bg-[#F8F5F0] rounded-lg">
                <h3 class="font-serif text-xl font-bold text-[#1B4332] mb-4 flex items-center space-x-2">
                  <i class="fas fa-scroll"></i>
                  <span>生成的诗歌</span>
                </h3>
                <div class="font-serif text-lg text-[#2C1810] leading-loose whitespace-pre-line bg-white p-6 rounded border-l-4 border-[#D4A574]">
                  {{ generatedPoetry }}
                </div>
                
                <!-- 操作按钮 -->
                <div class="mt-4 flex space-x-4">
                  <button @click="copyPoetry" class="flex-1 bg-[#1B4332] text-white py-2 font-serif hover:bg-[#0d2419] transition-colors flex items-center justify-center space-x-2">
                    <i class="fas fa-copy"></i>
                    <span>复制诗歌</span>
                  </button>
                  <button @click="savePoetry" class="flex-1 border-2 border-[#D4A574] text-[#D4A574] py-2 font-serif hover:bg-[#D4A574] hover:text-white transition-colors flex items-center justify-center space-x-2">
                    <i class="fas fa-bookmark"></i>
                    <span>收藏</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧信息区 -->
        <div class="col-span-4">
          <!-- 用户信息卡片 -->
          <div class="bg-white p-6 shadow-lg mb-8" style="transform: rotate(1deg);">
            <div class="transform rotate-[-1deg]">
              <h3 class="font-serif text-xl font-bold text-[#2C1810] mb-4 text-center">创作档案</h3>
              
              <div class="space-y-4">
                <div class="flex justify-between items-center">
                  <span class="text-[#2C1810] opacity-70">当前套餐</span>
                  <span class="font-bold text-[#D4A574]">{{ getPlanName(userSubscription?.plan) }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-[#2C1810] opacity-70">累计创作</span>
                  <span class="font-bold text-[#1B4332]">{{ userStats?.usage?.aiCallsTotal || 0 }} 首</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-[#2C1810] opacity-70">会员到期</span>
                  <span class="font-bold text-[#1B4332]">{{ formatDate(userSubscription?.endDate) }}</span>
                </div>
              </div>

              <!-- 进度条 -->
              <div v-if="userSubscription?.plan === 'free'" class="mt-6">
                <div class="flex justify-between text-sm text-[#2C1810] opacity-70 mb-2">
                  <span>今日使用</span>
                  <span>{{ userStats?.usage?.aiCallsToday || 0 }}/5</span>
                </div>
                <div class="w-full bg-[#F8F5F0] rounded-full h-2">
                  <div 
                    class="bg-[#D4A574] h-2 rounded-full transition-all duration-300"
                    :style="{ width: ((userStats?.usage?.aiCallsToday || 0) / 5 * 100) + '%' }"
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <!-- 最近作品 -->
          <div class="bg-white p-6 shadow-lg" style="transform: rotate(-0.8deg);">
            <div class="transform rotate-[0.8deg]">
              <h3 class="font-serif text-xl font-bold text-[#2C1810] mb-4 text-center">最近作品</h3>
              
              <div class="space-y-4 max-h-64 overflow-y-auto">
                <div v-for="poem in recentPoems" :key="poem.id" class="p-3 bg-[#F8F5F0] rounded cursor-pointer hover:bg-[#E8E5E0] transition-colors">
                  <p class="text-sm text-[#2C1810] line-clamp-2 font-serif">{{ poem.content }}</p>
                  <div class="text-xs text-[#2C1810] opacity-50 mt-2">{{ formatDate(poem.createdAt) }}</div>
                </div>
                
                <div v-if="recentPoems.length === 0" class="text-center text-[#2C1810] opacity-50 py-8">
                  <i class="fas fa-feather text-2xl mb-2 block"></i>
                  暂无作品
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 升级套餐弹窗 -->
    <div v-if="showUpgrade" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white max-w-4xl w-full max-h-[90vh] overflow-y-auto" style="transform: rotate(0.3deg);">
        <div class="transform rotate-[-0.3deg]">
          <div class="p-8 border-b-2 border-[#F8F5F0]">
            <div class="flex justify-between items-center">
              <h2 class="font-serif text-3xl font-bold text-[#2C1810]">选择创作套餐</h2>
              <button @click="showUpgrade = false" class="text-[#2C1810] hover:text-[#D4A574]">
                <i class="fas fa-times text-2xl"></i>
              </button>
            </div>
            <p class="text-[#2C1810] opacity-70 mt-2 font-serif">解锁更多创作可能，让诗意无限流淌</p>
          </div>

          <div class="p-8">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
              <!-- 免费版 -->
              <div class="border-2 border-[#F8F5F0] p-6" :class="{ 'opacity-60': userSubscription?.plan !== 'free' }">
                <h3 class="font-serif text-2xl font-bold text-center text-[#2C1810]">免费版</h3>
                <div class="text-center my-4">
                  <span class="text-4xl font-bold text-[#2C1810]">¥0</span>
                  <span class="text-[#2C1810] opacity-70">/月</span>
                </div>
                <ul class="space-y-3 text-sm text-[#2C1810]">
                  <li class="flex items-center space-x-2"><i class="fas fa-check text-[#1B4332]"></i><span>每日5首诗歌生成</span></li>
                  <li class="flex items-center space-x-2"><i class="fas fa-check text-[#1B4332]"></i><span>七言绝句格律</span></li>
                  <li class="flex items-center space-x-2"><i class="fas fa-check text-[#1B4332]"></i><span>基础意境表达</span></li>
                </ul>
                <button 
                  v-if="userSubscription?.plan === 'free'" 
                  disabled
                  class="w-full mt-6 bg-[#F8F5F0] text-[#2C1810] py-3 font-serif cursor-default">
                  当前套餐
                </button>
                <button 
                  v-else
                  @click="downgradeToFree"
                  class="w-full mt-6 border-2 border-[#2C1810] text-[#2C1810] py-3 font-serif hover:bg-[#2C1810] hover:text-white transition-colors">
                  降级到此套餐
                </button>
              </div>

              <!-- 基础版 -->
              <div class="border-2 border-[#D4A574] p-6 relative bg-[#F8F5F0]">
                <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-[#D4A574] text-white px-4 py-1 text-sm font-serif">推荐</div>
                <h3 class="font-serif text-2xl font-bold text-center text-[#2C1810]">基础版</h3>
                <div class="text-center my-4">
                  <span class="text-4xl font-bold text-[#2C1810]">¥29</span>
                  <span class="text-[#2C1810] opacity-70">/月</span>
                </div>
                <ul class="space-y-3 text-sm text-[#2C1810]">
                  <li class="flex items-center space-x-2"><i class="fas fa-check text-[#1B4332]"></i><span>每日50首诗歌生成</span></li>
                  <li class="flex items-center space-x-2"><i class="fas fa-check text-[#1B4332]"></i><span>所有诗歌风格</span></li>
                  <li class="flex items-center space-x-2"><i class="fas fa-check text-[#1B4332]"></i><span>优先响应速度</span></li>
                  <li class="flex items-center space-x-2"><i class="fas fa-check text-[#1B4332]"></i><span>高级意境营造</span></li>
                </ul>
                <button @click="upgradeToBasic" class="w-full mt-6 bg-[#D4A574] text-white py-3 font-serif hover:bg-[#C49460] transition-colors">
                  {{ userSubscription?.plan === 'basic' ? '当前套餐' : '升级基础版' }}
                </button>
              </div>

              <!-- 高级版 -->
              <div class="border-2 border-[#1B4332] p-6">
                <h3 class="font-serif text-2xl font-bold text-center text-[#2C1810]">高级版</h3>
                <div class="text-center my-4">
                  <span class="text-4xl font-bold text-[#2C1810]">¥99</span>
                  <span class="text-[#2C1810] opacity-70">/月</span>
                </div>
                <ul class="space-y-3 text-sm text-[#2C1810]">
                  <li class="flex items-center space-x-2"><i class="fas fa-check text-[#1B4332]"></i><span>无限诗歌生成</span></li>
                  <li class="flex items-center space-x-2"><i class="fas fa-check text-[#1B4332]"></i><span>所有高级功能</span></li>
                  <li class="flex items-center space-x-2"><i class="fas fa-check text-[#1B4332]"></i><span>专属客服支持</span></li>
                  <li class="flex items-center space-x-2"><i class="fas fa-check text-[#1B4332]"></i><span>个性化定制风格</span></li>
                </ul>
                <button @click="upgradeToPremium" class="w-full mt-6 bg-[#1B4332] text-white py-3 font-serif hover:bg-[#0d2419] transition-colors">
                  {{ userSubscription?.plan === 'premium' ? '当前套餐' : '升级高级版' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { aiAPI, authAPI } from '@/api/auth'

const router = useRouter()

const poetryInput = ref('')
const generating = ref(false)
const generatedPoetry = ref('')
const showUpgrade = ref(false)

const userInfo = ref(JSON.parse(localStorage.getItem('userInfo') || '{}'))
const userSubscription = ref({})
const userStats = ref({})
const recentPoems = ref([])
const usageRemaining = ref(0)

function showToast(title = '', icon = 'none') {
  if (typeof uni !== 'undefined' && typeof uni.showToast === 'function') {
    uni.showToast({
      title: String(title || ''),
      icon,
      duration: 2000
    })
    return
  }
  console.info(String(title || ''))
}

function confirmAction(content = '') {
  if (typeof uni !== 'undefined' && typeof uni.showModal === 'function') {
    return new Promise(resolve => {
      uni.showModal({
        title: '提示',
        content: String(content || ''),
        success: result => resolve(Boolean(result?.confirm)),
        fail: () => resolve(false)
      })
    })
  }
  return Promise.resolve(false)
}

const canGenerate = computed(() => {
  return userInfo.value && userInfo.value._id
})

onMounted(async () => {
  if (!canGenerate.value) {
    router.push('/login')
    return
  }
  
  await loadUserData()
})

const loadUserData = async () => {
  try {
    // 并行加载用户数据
    const [statsRes, subscriptionRes] = await Promise.all([
      aiAPI.getUserStats(localStorage.getItem('authToken')),
      authAPI.checkSubscription(userInfo.value._id)
    ])
    
    userStats.value = statsRes.data.data
    userSubscription.value = statsRes.data.data.subscription
    
    // 计算剩余调用次数
    if (userSubscription.value.plan === 'free') {
      usageRemaining.value = Math.max(0, 5 - (userStats.value.usage?.aiCallsToday || 0))
    } else {
      usageRemaining.value = '∞'
    }
    
    // 加载最近作品 (模拟数据)
    recentPoems.value = [
      { id: 1, content: '春风拂面醉人来，桃花满山次第开。燕子归来寻旧垒，诗心一片向春栽。', createdAt: new Date() },
      { id: 2, content: '月照花林皆似霰，清辉如水洗尘寰。举杯邀影成三客，独享乾坤一片闲。', createdAt: new Date(Date.now() - 86400000) }
    ]
  } catch (error) {
    console.error('加载用户数据失败:', error)
  }
}

const generatePoetry = async () => {
  if (!poetryInput.value.trim()) {return}
  
  generating.value = true
  generatedPoetry.value = ''
  
  try {
    // 检查权限
    await authAPI.checkAIPermission(userInfo.value._id)
    
    // 生成诗歌
    const response = await aiAPI.generatePoetry(poetryInput.value, localStorage.getItem('authToken'))
    
    generatedPoetry.value = response.data.data.poetry
    
    // 记录使用
    await authAPI.recordAICall(userInfo.value._id)
    
    // 重新加载用户数据
    await loadUserData()
    
  } catch (error) {
    showToast(error?.message || '生成失败')
  } finally {
    generating.value = false
  }
}

const copyPoetry = () => {
  navigator.clipboard.writeText(generatedPoetry.value)
  showToast('诗歌已复制到剪贴板', 'success')
}

const savePoetry = () => {
  showToast('诗歌已收藏到个人文库', 'success')
}

const upgradeToBasic = () => {
  // 模拟支付流程
  const paymentId = 'pay_' + Date.now()
  authAPI.upgradePlan(userInfo.value._id, 'basic', paymentId)
    .then(() => {
      showToast('升级成功！立即享受基础版特权', 'success')
      showUpgrade.value = false
      loadUserData()
    })
    .catch(error => {
      showToast(`升级失败：${error?.message || ''}`)
    })
}

const upgradeToPremium = () => {
  const paymentId = 'pay_' + Date.now()
  authAPI.upgradePlan(userInfo.value._id, 'premium', paymentId)
    .then(() => {
      showToast('升级成功！立即享受高级版特权', 'success')
      showUpgrade.value = false
      loadUserData()
    })
    .catch(error => {
      showToast(`升级失败：${error?.message || ''}`)
    })
}

const downgradeToFree = async () => {
  const shouldDowngrade = await confirmAction('确定要降级到免费版吗？每日创作次数将限制在5首。')
  if (shouldDowngrade) {
    authAPI.upgradePlan(userInfo.value._id, 'free', '')
      .then(() => {
        showToast('已切换到免费版', 'success')
        showUpgrade.value = false
        loadUserData()
      })
  }
}

const getPlanName = (plan) => {
  const names = { free: '免费版', basic: '基础版', premium: '高级版' }
  return names[plan] || '未知'
}

const formatDate = (dateStr) => {
  if (!dateStr) {return '永久'}
  return new Date(dateStr).toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
