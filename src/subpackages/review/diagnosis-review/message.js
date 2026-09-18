// #ifdef H5
import { ElMessage } from 'element-plus'
// #endif

export function showMessage(message, type = 'info') {
  // #ifdef H5
  ElMessage({
    message,
    type
  })
  // #endif
  // #ifndef H5
  uni.showToast({
    title: String(message || ''),
    icon: type === 'success' ? 'success' : 'none'
  })
  // #endif
}
