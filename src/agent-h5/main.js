import { createSSRApp } from 'vue'
import App from './App.vue'
import { captureEntryTicket } from './transport.js'
captureEntryTicket()
export function createApp() {
  return { app: createSSRApp(App) }
}
