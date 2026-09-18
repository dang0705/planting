export function showBottomSheetAction(options = {}) {
  return new Promise((resolve, reject) => {
    uni.$emit('app:bottom-sheet-action', {
      title: options.title || '请选择',
      itemList: Array.isArray(options.itemList) ? options.itemList : [],
      resolve,
      reject
    })
  })
}
