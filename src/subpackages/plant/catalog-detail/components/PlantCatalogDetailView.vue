<template>
  <Layout
    title=""
    left-action="back"
    left-action-id="plant-catalog-detail-back-button"
    background-class="bg-[#f8faf9]"
    :content-padding-top="false"
    header-scroll-transition
    header-transition-target="#plant-catalog-detail-banner"
  >
    <view id="plant-catalog-detail-page" class="min-h-screen bg-[#f8faf9]">
      <view v-if="loading" class="flex min-h-screen items-center justify-center px-6">
        <view
          id="plant-catalog-detail-banner"
          class="absolute inset-x-0 top-0 h-[375px] bg-[#dcefe2]"
        />
        <text class="relative text-sm text-[#5a7a68]">正在加载植物信息...</text>
      </view>

      <view
        v-else-if="loadError || !plant"
        class="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      >
        <text class="text-4xl">🌿</text>
        <text class="mt-4 text-lg font-semibold text-[#0a0a0a]">暂时无法打开植物详情</text>
        <text class="mt-2 text-sm leading-6 text-[#6a7282]">{{
          loadError || '未找到这株植物'
        }}</text>
        <button
          id="plant-catalog-detail-retry-button"
          class="mt-6 rounded-3xl bg-[#2d7a4f] px-8 py-3.5 text-white"
          @click="loadDetail"
        >
          重新加载
        </button>
      </view>

      <view v-else class="pb-[104px]">
        <view
          id="plant-catalog-detail-banner"
          class="relative h-[375px] w-full overflow-hidden bg-[#dcefe2]"
        >
          <image
            v-if="imageUrl"
            id="plant-catalog-detail-image"
            :src="imageUrl"
            class="absolute inset-0 size-full"
            mode="aspectFill"
            @error="handleImageError"
          />
          <view v-else class="absolute inset-0 flex items-center justify-center">
            <view class="relative h-[120px] w-[96px]">
              <view
                class="absolute left-1/2 top-1/2 h-[98px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2d7a4f]"
              />
              <view
                class="absolute left-1/2 top-[32px] h-[30px] w-[56px] -translate-x-[88%] rotate-[-24deg] rounded-[999px_0_999px_0] bg-[#52b788]"
              />
              <view
                class="absolute left-1/2 top-[24px] h-[30px] w-[56px] translate-x-[-4%] rotate-[24deg] scale-x-[-1] rounded-[999px_0_999px_0] bg-[#40916c]"
              />
              <view
                class="absolute left-1/2 top-[68px] h-[27px] w-[50px] -translate-x-[88%] rotate-[-20deg] rounded-[999px_0_999px_0] bg-[#74c69d]"
              />
              <view
                class="absolute left-1/2 top-[64px] h-[27px] w-[50px] translate-x-[-4%] rotate-[20deg] scale-x-[-1] rounded-[999px_0_999px_0] bg-[#52b788]"
              />
            </view>
          </view>
          <view
            class="absolute inset-x-0 bottom-0 h-20"
            style="
              background: linear-gradient(
                0deg,
                #ffffff 0%,
                rgba(255, 255, 255, 0.93) 12%,
                rgba(255, 255, 255, 0) 100%
              );
            "
          />
        </view>

        <view
          id="plant-catalog-detail-content"
          class="relative z-10 -mt-6 min-h-[501px] rounded-t-[24px] bg-white px-5 pb-[112px] pt-3 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]"
        >
          <view class="mb-8 flex justify-center pb-1 pt-0.5">
            <view class="h-1 w-10 rounded-full bg-[rgba(45,122,79,0.15)]" />
          </view>

          <view>
            <text class="block text-2xl font-semibold leading-[33px] text-[#0a0a0a]">
              {{ plant.canonicalName || '植物' }}
            </text>
            <text class="mt-2 block text-sm leading-[22.75px] text-[#5a7a68]">
              {{ plant.plantDesc || '暂无简介' }}
            </text>
          </view>

          <view class="mt-5 border-t border-[rgba(45,122,79,0.15)] pt-5">
            <view
              id="plant-catalog-detail-taxonomy"
              class="overflow-hidden rounded-2xl border border-[rgba(45,122,79,0.15)]"
            >
              <view
                v-for="item in taxonomyRows"
                :id="`plant-catalog-detail-taxonomy-${item.key}`"
                :key="item.key"
                class="flex gap-3 border-b border-[rgba(45,122,79,0.15)] px-4 py-3.5 last:border-b-0"
              >
                <text class="w-20 shrink-0 pt-px text-sm leading-5 text-[#5a7a68]">
                  {{ item.label }}
                </text>
                <text class="min-w-0 flex-1 text-sm font-medium leading-[19.25px] text-[#0a0a0a]">
                  {{ item.value }}
                </text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view
        v-if="plant && !loading && !loadError"
        id="plant-catalog-detail-footer"
        class="fixed inset-x-0 bottom-0 z-20 border-t border-[rgba(45,122,79,0.15)] bg-[rgba(255,255,255,0.9)] px-5 pt-4 backdrop-blur-[8px]"
        style="padding-bottom: max(16px, env(safe-area-inset-bottom))"
      >
        <button
          id="plant-catalog-detail-add-button"
          class="flex h-14 w-full items-center justify-center rounded-2xl bg-[#2d7a4f] text-base font-semibold leading-none text-white shadow-[0_1px_1.5px_rgba(0,0,0,0.1),0_1px_1px_rgba(0,0,0,0.1)] after:border-0"
          @click="addToGarden"
        >
          加入我的花园
        </button>
      </view>
    </view>
  </Layout>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import Layout from '@/Layout.vue'
import { fetchPlantCatalogDetail } from '@/api/plants-http.js'
import { useFileUrl } from '@/composables/useCloudFile.js'
import { useUserStore } from '@/store/user.js'

const HTTP_SUCCESS_CODE = 200
const INITIAL_IMAGE_RETRY_COUNT = 0
const MAX_IMAGE_RETRY_COUNT = 1

const props = defineProps({
  plantId: { type: [String, Number], default: '' }
})

const userStore = useUserStore()
const plant = ref(null)
const loading = ref(true)
const loadError = ref('')
const imageRetryCount = ref(INITIAL_IMAGE_RETRY_COUNT)
const imageFileId = computed(() => plant.value?.imageFileId || '')
const { url: imageUrl, resolve: resolveImageUrl, refresh: refreshImageUrl } = useFileUrl()

const taxonomyRows = computed(() => [
  { key: 'category', label: '植物分类', value: plant.value?.categoryCn || '暂无信息' },
  { key: 'scientific-name', label: '学名', value: plant.value?.scientificName || '暂无信息' },
  {
    key: 'family',
    label: '科',
    value:
      [plant.value?.familyCn, plant.value?.familyEn ? `（${plant.value.familyEn}）` : '']
        .filter(Boolean)
        .join('') || '暂无信息'
  },
  {
    key: 'genus',
    label: '属',
    value: plant.value?.genus || '暂无信息'
  }
])

watch(
  imageFileId,
  nextFileId => {
    imageRetryCount.value = INITIAL_IMAGE_RETRY_COUNT
    resolveImageUrl(nextFileId)
  },
  { immediate: true }
)

onMounted(loadDetail)

async function loadDetail() {
  const requestedPlantId = String(props.plantId || '').trim()
  if (!requestedPlantId) {
    loadError.value = '未找到这株植物的信息'
    loading.value = false
    return false
  }
  if (!(await userStore.ensureLogin({ prompt: true }))) {
    loadError.value = '查看植物详情需要先登录'
    loading.value = false
    return false
  }
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetchPlantCatalogDetail(requestedPlantId)
    if (response?.code !== HTTP_SUCCESS_CODE || !response.data) {
      loadError.value = '暂时无法加载植物信息，请稍后重试'
      plant.value = null
      return false
    }
    plant.value = response.data
    return true
  } catch {
    loadError.value = '暂时无法加载植物信息，请检查网络后重试'
    plant.value = null
    return false
  } finally {
    loading.value = false
  }
}

async function handleImageError() {
  if (!imageFileId.value || imageRetryCount.value >= MAX_IMAGE_RETRY_COUNT) {
    imageUrl.value = ''
    return
  }
  imageRetryCount.value += 1
  await refreshImageUrl()
}

async function addToGarden() {
  if (!(await userStore.ensureLogin({ prompt: true }))) {
    return
  }
  const catalogPlantId = encodeURIComponent(String(props.plantId || '').trim())
  uni.navigateTo({
    url: `/subpackages/plant/user-plant-detail/user-plant-detail?mode=create&catalogPlantId=${catalogPlantId}`
  })
}

defineExpose({ refresh: loadDetail })
</script>
