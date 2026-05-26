<template>
  <div class="min-h-screen bg-[#F8F5F0] flex items-center justify-center p-4 font-sans">
    <!-- 背景装饰 -->
    <div class="absolute inset-0 opacity-5">
      <div class="absolute top-20 left-10 w-32 h-32 border-2 border-[#2C1810] rotate-45"></div>
      <div class="absolute bottom-32 right-16 w-24 h-24 border border-[#D4A574] rotate-12"></div>
      <div class="absolute top-1/2 left-1/4 w-16 h-16 bg-[#1B4332] opacity-10 rounded-full"></div>
    </div>

    <div class="relative w-full max-w-4xl grid grid-cols-12 gap-8 items-center">
      
      <!-- 左侧品牌区域 (非对称布局) -->
      <div class="col-span-5 col-start-2">
        <div class="text-center md:text-left">
          <h1 class="font-serif text-5xl font-bold text-[#2C1810] leading-tight mb-6">
            诗意<br>
            <span class="text-[#D4A574]">人工智能</span>
          </h1>
          <p class="font-serif text-xl text-[#2C1810] opacity-80 mb-8 leading-relaxed">
            让每一份灵感，都能化作传世佳作。
            <br>
            每日五首，或无限创作。
          </p>
          
          <!-- 特性展示 -->
          <div class="space-y-4 text-sm">
            <div class="flex items-center justify-center md:justify-start space-x-3">
              <i class="fas fa-feather-alt text-[#1B4332] text-lg"></i>
              <span class="text-[#2C1810]">七言绝句格律精准</span>
            </div>
            <div class="flex items-center justify-center md:justify-start space-x-3">
              <i class="fas fa-magic text-[#1B4332] text-lg"></i>
              <span class="text-[#2C1810]">意境深远韵味悠长</span>
            </div>
            <div class="flex items-center justify-center md:justify-start space-x-3">
              <i class="fas fa-crown text-[#D4A574] text-lg"></i>
              <span class="text-[#2C1810]">付费解锁无限创作</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧登录表单 (对角线偏移) -->
      <div class="col-span-4 col-start-8 bg-white/80 backdrop-blur-sm p-8 shadow-2xl" style="transform: rotate(-1deg);">
        <div class="transform -rotate-[-1deg]">
          <h2 class="font-serif text-3xl font-bold text-[#2C1810] text-center mb-6">
            开始创作之旅
          </h2>

          <!-- 登录表单 -->
          <form @submit.prevent="handleLogin" class="space-y-6">
            <div>
              <label class="block text-sm font-serif text-[#2C1810] mb-2">
                邮箱地址
              </label>
              <div class="relative">
                <i class="fas fa-envelope absolute left-3 top-1/2 transform -translate-y-1/2 text-[#D4A574]"></i>
                <input
                  v-model="loginForm.email"
                  type="email"
                  required
                  class="w-full pl-10 pr-4 py-3 border-2 border-[#F8F5F0] focus:border-[#D4A574] focus:ring-0 outline-none transition-colors duration-300 bg-[#F8F5F0]/50"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <div>
              <label class="block text-sm font-serif text-[#2C1810] mb-2">
                密码
              </label>
              <div class="relative">
                <i class="fas fa-lock absolute left-3 top-1/2 transform -translate-y-1/2 text-[#D4A574]"></i>
                <input
                  v-model="loginForm.password"
                  type="password"
                  required
                  class="w-full pl-10 pr-4 py-3 border-2 border-[#F8F5F0] focus:border-[#D4A574] focus:ring-0 outline-none transition-colors duration-300 bg-[#F8F5F0]/50"
                  placeholder="请输入密码"
                />
              </div>
            </div>

            <button
              type="submit"
              :disabled="loading"
              class="w-full bg-[#2C1810] text-white py-3 font-serif text-lg hover:bg-[#1C1917] transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <i v-if="loading" class="fas fa-spinner animate-spin"></i>
              <span>{{ loading ? '登录中...' : '登录' }}</span>
            </button>
          </form>

          <!-- 分割线 -->
          <div class="my-6 flex items-center">
            <div class="flex-1 border-t-2 border-[#F8F5F0]"></div>
            <span class="px-4 text-sm text-[#2C1810] opacity-60 font-serif">或</span>
            <div class="flex-1 border-t-2 border-[#F8F5F0]"></div>
          </div>

          <!-- 注册链接 -->
          <div class="text-center">
            <p class="text-[#2C1810] mb-4">还没有账户？</p>
            <button
              @click="showRegister = true"
              class="w-full border-2 border-[#D4A574] text-[#D4A574] py-3 font-serif text-lg hover:bg-[#D4A574] hover:text-white transition-all duration-300"
            >
              免费注册账户
            </button>
          </div>

          <!-- 免费用户提示 -->
          <div class="mt-6 p-4 bg-[#F8F5F0] rounded-lg">
            <div class="flex items-center space-x-2 text-sm">
              <i class="fas fa-info-circle text-[#1B4332]"></i>
              <span class="text-[#2C1810] font-serif">
                免费用户每日可生成 <strong>5首</strong> 诗歌
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 注册弹窗 -->
    <div v-if="showRegister" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white max-w-md w-full p-8 relative" style="transform: rotate(0.5deg);">
        <button @click="showRegister = false" class="absolute top-4 right-4 text-[#2C1810] hover:text-[#D4A574]">
          <i class="fas fa-times text-xl"></i>
        </button>
        
        <h3 class="font-serif text-2xl font-bold text-[#2C1810] text-center mb-6">加入诗人行列</h3>
        
        <form @submit.prevent="handleRegister" class="space-y-4">
          <div>
            <label class="block text-sm font-serif text-[#2C1810] mb-2">邮箱</label>
            <input v-model="registerForm.email" type="email" required class="w-full px-4 py-2 border-2 border-[#F8F5F0] focus:border-[#D4A574] outline-none"/>
          </div>
          <div>
            <label class="block text-sm font-serif text-[#2C1810] mb-2">用户名</label>
            <input v-model="registerForm.username" type="text" required class="w-full px-4 py-2 border-2 border-[#F8F5F0] focus:border-[#D4A574] outline-none"/>
          </div>
          <div>
            <label class="block text-sm font-serif text-[#2C1810] mb-2">密码</label>
            <input v-model="registerForm.password" type="password" required class="w-full px-4 py-2 border-2 border-[#F8F5F0] focus:border-[#D4A574] outline-none"/>
          </div>
          
          <button type="submit" :disabled="registerLoading" class="w-full bg-[#1B4332] text-white py-3 font-serif hover:bg-[#0d2419] transition-colors">
            {{ registerLoading ? '注册中...' : '创建账户' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI } from '@/api/auth'

const router = useRouter()

const loading = ref(false)
const registerLoading = ref(false)
const showRegister = ref(false)

const loginForm = ref({
  email: '',
  password: ''
})

const registerForm = ref({
  email: '',
  username: '',
  password: ''
})

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

const handleLogin = async () => {
  loading.value = true
  try {
    const response = await authAPI.login({
      email: loginForm.value.email,
      password: loginForm.value.password
    })
    
    localStorage.setItem('authToken', response.data.token)
    localStorage.setItem('userInfo', JSON.stringify(response.data.user))
    
    // 跳转到AI生成页面
    router.push('/ai-poetry')
  } catch (error) {
    showToast(error?.message || '登录失败')
  } finally {
    loading.value = false
  }
}

const handleRegister = async () => {
  registerLoading.value = true
  try {
    await authAPI.register({
      email: registerForm.value.email,
      username: registerForm.value.username,
      password: registerForm.value.password
    })
    
    showToast('注册成功！欢迎加入我们', 'success')
    showRegister.value = false
    loginForm.value.email = registerForm.value.email
  } catch (error) {
    showToast(error?.message || '注册失败')
  } finally {
    registerLoading.value = false
  }
}
</script>

<style scoped>
.font-serif {
  font-family: 'Songti SC', 'STSong', 'Noto Serif SC', Georgia, serif;
}

.font-serif.text-5xl {
  font-family: 'Songti SC', 'STSong', 'Noto Serif SC', Georgia, serif;
}

.shadow-2xl {
  box-shadow: 0 25px 50px -12px rgba(44, 24, 16, 0.25);
}
</style>
