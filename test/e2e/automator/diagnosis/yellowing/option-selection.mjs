import { normalizeText } from './dom.mjs'

function pickBestOption(questionMeta, options, profile) {
  const list = [...options]
  const qText = normalizeText(
    questionMeta?.text ||
      questionMeta?.questionText ||
      questionMeta?.questionKey ||
      questionMeta?.questionId ||
      questionMeta?.decodedQuestionId ||
      ''
  )
  const qTarget = normalizeText(questionMeta?.packageTopic || '')
  const decodedQuestionId = normalizeText(questionMeta?.decodedQuestionId || '')
  const combined = `${qText} ${qTarget} ${decodedQuestionId}`

  const contains = (target, arr) => arr.some(v => target.includes(v))
  const pickByText = pattern => list.find(item => normalizeText(item.text).includes(pattern))

  const unknownOptions = list.filter(item => /说不清|没留意|不确定|unknown/i.test(item.text))
  if (profile === 'overwatering') {
    if (
      contains(qTarget, ['watering_frequency_context']) ||
      contains(combined, ['watering', '浇水'])
    ) {
      return (
        pickByText('偏多') ||
        pickByText('2 次以上') ||
        pickByText('2次以上') ||
        pickByText('2 次 以上') ||
        list.find(item => /常见/.test(item.text)) ||
        unknownOptions[0] ||
        list[0]
      )
    }

    if (contains(combined, ['光照', '光线']) || contains(qTarget, ['light'])) {
      return (
        list.find(item => normalizeText(item.text).includes('全日光')) ||
        list.find(item => /强/.test(item.text)) ||
        unknownOptions[0] ||
        list[0]
      )
    }

    if (contains(combined, ['施肥', '换盆', '换土']) || contains(qTarget, ['fertil'])) {
      return (
        list.find(item => normalizeText(item.text).includes('偏稳')) || unknownOptions[0] || list[0]
      )
    }

    if (
      contains(combined, ['通风', '湿度', '空气']) ||
      contains(qTarget, ['airflow', 'humidity'])
    ) {
      return (
        list.find(item => /偏闷|偏潮|通风弱|偏湿|偏干|空调/.test(item.text)) ||
        unknownOptions[0] ||
        list[0]
      )
    }
  }

  if (profile === 'nutrient') {
    if (contains(combined, ['施肥', '换盆']) || contains(qTarget, ['fertil'])) {
      return (
        pickByText('0 次') ||
        pickByText('0次') ||
        pickByText('1-2 次') ||
        pickByText('1-2次') ||
        unknownOptions[0] ||
        list[0]
      )
    }
  }

  if (unknownOptions.length) {
    return unknownOptions[0]
  }

  return list[0]
}

export { pickBestOption }
