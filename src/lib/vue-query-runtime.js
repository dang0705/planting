import { MutationObserver } from '@tanstack/query-core'
import { queryClient } from '@/lib/query-client.js'

export function runVueQueryQuery(options) {
  return queryClient.fetchQuery(options)
}

export function runVueQueryMutation(options, variables) {
  const observer = new MutationObserver(queryClient, options)
  return observer.mutate(variables)
}
