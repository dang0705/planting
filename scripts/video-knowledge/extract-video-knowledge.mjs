#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'
import os from 'node:os'
import { spawn } from 'node:child_process'

const DEFAULT_OUTPUT_DIR = 'docs/video-knowledge-candidates'
const DEFAULT_USER_DATA_DIR = '.cache/video-knowledge-playwright-profile'
const DEFAULT_MIN_INTERVAL_SECONDS = 90
const DEFAULT_MAX_INTERVAL_SECONDS = 180
const DEFAULT_DAILY_LIMIT = 30
const DEFAULT_SNIPPET_LIMIT = 64
const DEFAULT_SNIPPET_MAX_CHARS = 320
const DEFAULT_LOCAL_AUDIO_MAX_SECONDS = 1200
const DEFAULT_OCR_FRAME_INTERVAL_SECONDS = 10

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus'])

const DISALLOWED_URL_PATTERNS = [
  /douyin\.com\/user\//i,
  /douyin\.com\/search/i,
  /douyin\.com\/discover/i,
  /douyin\.com\/topic/i,
  /douyin\.com\/hashtag/i,
  /douyin\.com\/follow/i,
  /douyin\.com\/hot/i,
  /\/comment/i
]

const VIDEO_URL_PATTERNS = [
  /douyin\.com\/video\/\d+/i,
  /douyin\.com\/note\/\d+/i,
  /v\.douyin\.com\/[A-Za-z0-9]+/i
]

function nowIso() {
  return new Date().toISOString()
}

function createId(prefix = 'vkc') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`
}

function hashText(value = '') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16)
}

function parseArgs(argv = []) {
  const args = {
    url: '',
    videoFile: '',
    audioFile: '',
    text: '',
    textFile: '',
    inputFile: '',
    outputDir: DEFAULT_OUTPUT_DIR,
    userDataDir: DEFAULT_USER_DATA_DIR,
    sourcePlatform: 'manual',
    manualTopic: '',
    manualNote: '',
    headless: true,
    minIntervalSeconds: DEFAULT_MIN_INTERVAL_SECONDS,
    maxIntervalSeconds: DEFAULT_MAX_INTERVAL_SECONDS,
    dailyLimit: DEFAULT_DAILY_LIMIT,
    snippetLimit: DEFAULT_SNIPPET_LIMIT,
    snippetMaxChars: DEFAULT_SNIPPET_MAX_CHARS,
    noBrowser: false,
    localAudioMaxSeconds: DEFAULT_LOCAL_AUDIO_MAX_SECONDS,
    ocrFrameIntervalSeconds: DEFAULT_OCR_FRAME_INTERVAL_SECONDS
  }

  for (const rawArg of argv) {
    const arg = String(rawArg || '')
    if (arg === '--headed') {args.headless = false}
    if (arg === '--headless') {args.headless = true}
    if (arg === '--no-browser') {args.noBrowser = true}
    if (arg.startsWith('--url=')) {args.url = arg.slice('--url='.length).trim()}
    if (arg.startsWith('--video-file=')) {args.videoFile = arg.slice('--video-file='.length).trim()}
    if (arg.startsWith('--audio-file=')) {args.audioFile = arg.slice('--audio-file='.length).trim()}
    if (arg.startsWith('--text=')) {args.text = arg.slice('--text='.length).trim()}
    if (arg.startsWith('--text-file=')) {args.textFile = arg.slice('--text-file='.length).trim()}
    if (arg.startsWith('--input-file=')) {args.inputFile = arg.slice('--input-file='.length).trim()}
    if (arg.startsWith('--output-dir=')) {args.outputDir = arg.slice('--output-dir='.length).trim() || DEFAULT_OUTPUT_DIR}
    if (arg.startsWith('--user-data-dir=')) {args.userDataDir = arg.slice('--user-data-dir='.length).trim() || DEFAULT_USER_DATA_DIR}
    if (arg.startsWith('--source-platform=')) {args.sourcePlatform = arg.slice('--source-platform='.length).trim() || 'manual'}
    if (arg.startsWith('--manual-topic=')) {args.manualTopic = arg.slice('--manual-topic='.length).trim()}
    if (arg.startsWith('--manual-note=')) {args.manualNote = arg.slice('--manual-note='.length).trim()}
    if (arg.startsWith('--min-interval-seconds=')) {
      args.minIntervalSeconds = Math.max(1, Number(arg.slice('--min-interval-seconds='.length)) || DEFAULT_MIN_INTERVAL_SECONDS)
    }
    if (arg.startsWith('--max-interval-seconds=')) {
      args.maxIntervalSeconds = Math.max(1, Number(arg.slice('--max-interval-seconds='.length)) || DEFAULT_MAX_INTERVAL_SECONDS)
    }
    if (arg.startsWith('--daily-limit=')) {args.dailyLimit = Math.max(1, Number(arg.slice('--daily-limit='.length)) || DEFAULT_DAILY_LIMIT)}
    if (arg.startsWith('--snippet-limit=')) {args.snippetLimit = Math.max(1, Number(arg.slice('--snippet-limit='.length)) || DEFAULT_SNIPPET_LIMIT)}
    if (arg.startsWith('--snippet-max-chars=')) {
      args.snippetMaxChars = Math.max(40, Number(arg.slice('--snippet-max-chars='.length)) || DEFAULT_SNIPPET_MAX_CHARS)
    }
    if (arg.startsWith('--local-audio-max-seconds=')) {
      args.localAudioMaxSeconds = Math.max(30, Number(arg.slice('--local-audio-max-seconds='.length)) || DEFAULT_LOCAL_AUDIO_MAX_SECONDS)
    }
    if (arg.startsWith('--ocr-frame-interval-seconds=')) {
      args.ocrFrameIntervalSeconds = Math.max(5, Number(arg.slice('--ocr-frame-interval-seconds='.length)) || DEFAULT_OCR_FRAME_INTERVAL_SECONDS)
    }
  }

  if (args.maxIntervalSeconds < args.minIntervalSeconds) {args.maxIntervalSeconds = args.minIntervalSeconds}
  return args
}

async function loadPlaywright() {
  try {
    const mod = await import('playwright')
    return mod.chromium
  } catch (error) {
    console.error('URL 可访问性尝试需要 playwright。请先执行：npm i -D playwright && npx playwright install chromium')
    throw error
  }
}

function normalizeUrl(url = '') {
  const text = String(url || '').trim()
  if (!text) {return ''}
  if (text.startsWith('//')) {return `https:${text}`}
  return text
}

function validateVideoUrl(url = '') {
  const normalized = normalizeUrl(url)
  if (!normalized) {return { ok: false, reason: 'empty_url' }}
  if (!/^https?:\/\//i.test(normalized)) {return { ok: false, reason: 'not_http_url' }}
  if (DISALLOWED_URL_PATTERNS.some(pattern => pattern.test(normalized))) {
    return { ok: false, reason: 'collection_or_profile_url_disallowed' }
  }
  if (!VIDEO_URL_PATTERNS.some(pattern => pattern.test(normalized))) {
    return { ok: false, reason: 'not_supported_specific_video_url' }
  }
  return { ok: true, url: normalized }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function truncateText(value = '', maxChars = DEFAULT_SNIPPET_MAX_CHARS) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) {return ''}
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text
}

function splitSnippetText(value = '', { snippetLimit, snippetMaxChars }) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim()
  if (!text) {return []}
  const roughLines = text
    .split(/[\n。！？!?]+/)
    .map(line => truncateText(line, snippetMaxChars))
    .filter(line => line.length >= 2)

  const seen = new Set()
  const result = []
  for (const line of roughLines) {
    if (seen.has(line)) {continue}
    seen.add(line)
    result.push(line)
    if (result.length >= snippetLimit) {break}
  }
  return result
}

function normalizeKnowledgeText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^章节要点$/, '')
    .trim()
}

function isLowValueFragment(value = '') {
  const text = normalizeKnowledgeText(value)
  if (!text) {return true}
  if (/^\d{1,2}:\d{2}$/.test(text)) {return true}
  if (/^(登录|举报|发布时间|全部评论|推荐视频|倍速|智能|清屏|连播)$/.test(text)) {return true}
  if (/^章节要点[:：]?/.test(text)) {return true}
  if (/ICP备|公网安备|用户服务协议|隐私政策/.test(text)) {return true}
  return false
}

function abstractKeyPoint(value = '') {
  const text = normalizeKnowledgeText(value)
  if (!text) {return ''}
  const withoutTags = text.replace(/#[\p{Script=Han}\w-]+/gu, '').replace(/\s+/g, ' ').trim()
  return truncateText(withoutTags || text, 180)
}

function buildSourceKnowledgeLayer(task, snippets = [], auditLogs = []) {
  const useful = []
  const seen = new Set()
  for (const snippet of snippets) {
    if (isLowValueFragment(snippet)) {continue}
    const point = abstractKeyPoint(snippet)
    if (!point || seen.has(point)) {continue}
    seen.add(point)
    useful.push(point)
  }

  const timeline = []
  for (let index = 0; index < snippets.length; index += 1) {
    const text = normalizeKnowledgeText(snippets[index])
    const match = text.match(/^(\d{1,2}:\d{2})\s+(.+)$/)
    if (!match) {continue}
    timeline.push({
      time_label: match[1],
      abstract_point: abstractKeyPoint(match[2])
    })
  }
  for (let index = 0; index < snippets.length - 1; index += 1) {
    const text = normalizeKnowledgeText(snippets[index])
    if (!/^\d{1,2}:\d{2}$/.test(text)) {continue}
    const next = normalizeKnowledgeText(snippets[index + 1])
    const afterNext = normalizeKnowledgeText(snippets[index + 2])
    let nextPoint = snippets.slice(index + 1).find(item => !isLowValueFragment(item) && !/^\d{1,2}:\d{2}/.test(normalizeKnowledgeText(item)))
    if (next && !/^\d{1,2}:\d{2}/.test(next) && afterNext && !/^\d{1,2}:\d{2}/.test(afterNext)) {
      nextPoint = `${next}：${afterNext}`
    }
    const abstractPoint = abstractKeyPoint(nextPoint)
    if (!abstractPoint) {continue}
    const exists = timeline.some(item => item.time_label === text && item.abstract_point === abstractPoint)
    if (!exists) {timeline.push({ time_label: text, abstract_point: abstractPoint })}
  }

  const taskAudit = auditLogs.filter(item => item.task_id === task.id)
  const channels = []
  if (task.input_type === 'manual_text') {channels.push('manual_text')}
  if (taskAudit.some(item => item.event_type === 'asr_completed')) {channels.push('asr')}
  if (taskAudit.some(item => item.event_type === 'ocr_completed')) {channels.push('ocr')}
  if (taskAudit.some(item => item.event_type === 'url_accessibility_attempted')) {channels.push('url_visible_text')}

  return {
    source_digest: hashText(snippets.join('\n')),
    source_fragment_count: snippets.length,
    source_channels: channels,
    key_points_for_review: useful.slice(0, 24),
    timeline_for_review: timeline.slice(0, 16),
    coverage_hints: {
      has_asr: channels.includes('asr'),
      has_ocr: channels.includes('ocr'),
      has_manual_text: channels.includes('manual_text'),
      has_url_visible_text: channels.includes('url_visible_text'),
      likely_undercovered: useful.length < 6,
      note: useful.length < 6
        ? '当前可审核要点偏少，建议补充本地视频/音频或手动文案后重跑。'
        : '已形成多条可审核抽象要点，仍需人工确认后入库。'
    }
  }
}

function classifyLocalFile(filePath = '') {
  const ext = path.extname(filePath).toLowerCase()
  if (VIDEO_EXTENSIONS.has(ext)) {return 'local_video'}
  if (AUDIO_EXTENSIONS.has(ext)) {return 'local_audio'}
  return 'unknown_file'
}

async function fileExists(filePath = '') {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile()
  } catch {
    return false
  }
}

function shellQuote(value = '') {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function interpolateCommand(template = '', vars = {}) {
  let command = String(template || '')
  for (const [key, value] of Object.entries(vars)) {
    command = command.replaceAll(`{${key}}`, shellQuote(value))
  }
  return command
}

function runShellCommand(command, { timeoutMs = 120000 } = {}) {
  return new Promise(resolve => {
    const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
    }, timeoutMs)
    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

async function commandExists(commandName) {
  const result = await runShellCommand(`command -v ${shellQuote(commandName)}`, { timeoutMs: 10000 })
  return result.code === 0
}

async function readInputTasks(args) {
  const rows = []

  if (args.videoFile) {rows.push({ input_type: 'local_video', local_file: args.videoFile })}
  if (args.audioFile) {rows.push({ input_type: 'local_audio', local_file: args.audioFile })}
  if (args.text || args.textFile) {
    rows.push({ input_type: 'manual_text', manual_text: args.text, text_file: args.textFile })
  }
  if (args.url) {rows.push({ input_type: 'url', source_url: args.url })}

  if (args.inputFile) {
    const raw = await fs.readFile(args.inputFile, 'utf8')
    if (args.inputFile.endsWith('.json')) {
      const parsed = JSON.parse(raw)
      const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tasks) ? parsed.tasks : []
      for (const item of items) {
        rows.push({
          input_type: String(item?.input_type || item?.type || '').trim(),
          local_file: String(item?.local_file || item?.file || item?.video_file || item?.audio_file || '').trim(),
          source_url: String(item?.source_url || item?.url || '').trim(),
          text_file: String(item?.text_file || '').trim(),
          manual_text: String(item?.manual_text || item?.text || '').trim(),
          manual_topic: String(item?.manual_topic || item?.topic || '').trim(),
          manual_note: String(item?.manual_note || item?.note || '').trim(),
          source_platform: String(item?.source_platform || args.sourcePlatform || 'manual').trim()
        })
      }
    } else {
      for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) {continue}
        rows.push({ input_type: 'url', source_url: trimmed })
      }
    }
  }

  const tasks = []
  for (const row of rows) {
    const task = await normalizeTask(row, args)
    tasks.push(task)
  }

  if (!tasks.length) {
    throw new Error('必须提供 --video-file、--audio-file、--text/--text-file、--url 或 --input-file')
  }

  return tasks
}

async function normalizeTask(row, args) {
  let inputType = String(row.input_type || '').trim()
  const localFile = String(row.local_file || '').trim()
  const textFile = String(row.text_file || '').trim()
  const sourceUrl = normalizeUrl(row.source_url || '')
  const manualTopic = row.manual_topic || args.manualTopic || ''
  const manualNote = row.manual_note || args.manualNote || ''
  const sourcePlatform = row.source_platform || args.sourcePlatform || 'manual'

  if (!inputType) {
    if (localFile) {inputType = classifyLocalFile(localFile)}
    else if (textFile || row.manual_text) {inputType = 'manual_text'}
    else if (sourceUrl) {inputType = 'url'}
  }

  const task = {
    id: createId('task'),
    input_type: inputType,
    source_url: sourceUrl,
    local_file_path: localFile,
    text_file_path: textFile,
    source_platform: sourcePlatform,
    manual_topic: manualTopic,
    manual_note: manualNote,
    manual_text: row.manual_text || '',
    status: 'pending',
    risk_level: 'low',
    error_message: '',
    validation: { ok: true },
    created_at: nowIso(),
    updated_at: nowIso(),
    processed_at: null
  }

  if (inputType === 'local_video' || inputType === 'local_audio') {
    if (!localFile) {markRejected(task, 'missing_local_file')}
    else if (!(await fileExists(localFile))) {markRejected(task, 'local_file_not_found')}
    else if (inputType === 'local_video' && classifyLocalFile(localFile) !== 'local_video') {markRejected(task, 'not_supported_video_file')}
    else if (inputType === 'local_audio' && classifyLocalFile(localFile) !== 'local_audio') {markRejected(task, 'not_supported_audio_file')}
  } else if (inputType === 'manual_text') {
    if (!task.manual_text && !textFile) {markRejected(task, 'missing_manual_text')}
    else if (textFile && !(await fileExists(textFile))) {markRejected(task, 'text_file_not_found')}
  } else if (inputType === 'url') {
    const validation = validateVideoUrl(sourceUrl)
    task.validation = validation
    task.source_url = validation.ok ? validation.url : sourceUrl
    if (!validation.ok) {markRejected(task, validation.reason)}
  } else {
    markRejected(task, 'unsupported_input_type')
  }

  return task
}

function markRejected(task, reason) {
  task.status = 'rejected'
  task.risk_level = 'high'
  task.error_message = reason
  task.validation = { ok: false, reason }
  task.updated_at = nowIso()
}

function enforceLimits(tasks = [], args) {
  const accepted = []
  let runnableUrlCount = 0

  for (const task of tasks) {
    if (task.status === 'rejected') {
      accepted.push(task)
      continue
    }
    if (task.input_type === 'url') {
      runnableUrlCount += 1
      if (runnableUrlCount > args.dailyLimit) {
        accepted.push({
          ...task,
          status: 'rejected',
          risk_level: 'high',
          error_message: 'daily_url_limit_exceeded',
          updated_at: nowIso()
        })
        continue
      }
    }
    accepted.push(task)
  }

  return accepted
}

async function collectManualText(task) {
  if (task.text_file_path) {return await fs.readFile(task.text_file_path, 'utf8')}
  return task.manual_text || ''
}

async function extractAudioFromVideo(videoPath, args, auditLogs, taskId) {
  if (!(await commandExists('ffmpeg'))) {
    auditLogs.push(auditLog(taskId, 'local_audio_extract_skipped', 'ffmpeg_not_found'))
    return { audioPath: '', cleanupDir: '' }
  }

  const cleanupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-knowledge-'))
  const audioPath = path.join(cleanupDir, 'audio.wav')
  const command = [
    'ffmpeg',
    '-y',
    '-hide_banner',
    '-loglevel error',
    '-i',
    shellQuote(videoPath),
    '-t',
    String(args.localAudioMaxSeconds),
    '-vn',
    '-ac 1',
    '-ar 16000',
    shellQuote(audioPath)
  ].join(' ')
  const result = await runShellCommand(command, { timeoutMs: 300000 })
  if (result.code !== 0) {
    auditLogs.push(auditLog(taskId, 'local_audio_extract_failed', truncateText(result.stderr || 'ffmpeg_failed', 240)))
    return { audioPath: '', cleanupDir }
  }
  auditLogs.push(auditLog(taskId, 'local_audio_extracted', `temporary_audio_digest=${hashText(audioPath)}`))
  return { audioPath, cleanupDir }
}

async function runAsr(audioPath, auditLogs, taskId) {
  const asrCommandTemplate = process.env.VIDEO_KNOWLEDGE_ASR_COMMAND || ''
  if (!asrCommandTemplate) {
    auditLogs.push(auditLog(taskId, 'asr_skipped', 'VIDEO_KNOWLEDGE_ASR_COMMAND_not_configured'))
    return ''
  }
  const command = interpolateCommand(asrCommandTemplate, { input: audioPath })
  const result = await runShellCommand(command, { timeoutMs: 600000 })
  if (result.code !== 0) {
    auditLogs.push(auditLog(taskId, 'asr_failed', truncateText(result.stderr || 'asr_command_failed', 240)))
    return ''
  }
  auditLogs.push(auditLog(taskId, 'asr_completed', `stdout_digest=${hashText(result.stdout)}`))
  return result.stdout
}

async function runOcrForVideo(videoPath, args, auditLogs, taskId) {
  const ocrCommandTemplate = process.env.VIDEO_KNOWLEDGE_OCR_COMMAND || ''
  if (!ocrCommandTemplate) {
    auditLogs.push(auditLog(taskId, 'ocr_skipped', 'VIDEO_KNOWLEDGE_OCR_COMMAND_not_configured'))
    return ''
  }
  if (!(await commandExists('ffmpeg'))) {
    auditLogs.push(auditLog(taskId, 'ocr_skipped', 'ffmpeg_not_found'))
    return ''
  }

  const cleanupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-knowledge-ocr-'))
  const framePattern = path.join(cleanupDir, 'frame_%03d.png')
  const extractCommand = [
    'ffmpeg',
    '-y',
    '-hide_banner',
    '-loglevel error',
    '-i',
    shellQuote(videoPath),
    '-vf',
    shellQuote(`fps=1/${args.ocrFrameIntervalSeconds}`),
    '-frames:v 40',
    shellQuote(framePattern)
  ].join(' ')
  const extracted = await runShellCommand(extractCommand, { timeoutMs: 300000 })
  if (extracted.code !== 0) {
    auditLogs.push(auditLog(taskId, 'ocr_frame_extract_failed', truncateText(extracted.stderr || 'ffmpeg_failed', 240)))
    await fs.rm(cleanupDir, { recursive: true, force: true })
    return ''
  }

  const files = (await fs.readdir(cleanupDir)).filter(name => name.endsWith('.png')).sort()
  const outputs = []
  for (const file of files) {
    const imagePath = path.join(cleanupDir, file)
    const command = interpolateCommand(ocrCommandTemplate, { input: imagePath })
    const result = await runShellCommand(command, { timeoutMs: 120000 })
    if (result.code === 0 && result.stdout.trim()) {outputs.push(result.stdout.trim())}
  }

  await fs.rm(cleanupDir, { recursive: true, force: true })
  auditLogs.push(auditLog(taskId, 'ocr_completed', `frame_count=${files.length}; output_digest=${hashText(outputs.join('\n'))}`))
  return outputs.join('\n')
}

async function runStructuringLlm(task, snippets, auditLogs) {
  const llmCommandTemplate = process.env.VIDEO_KNOWLEDGE_LLM_COMMAND || ''
  if (!llmCommandTemplate) {
    auditLogs.push(auditLog(task.id, 'llm_skipped', 'VIDEO_KNOWLEDGE_LLM_COMMAND_not_configured'))
    return null
  }

  const cleanupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-knowledge-llm-'))
  const inputPath = path.join(cleanupDir, 'structuring-input.json')
  await fs.writeFile(
    inputPath,
    JSON.stringify({
      instruction: buildAiPrompt({ ...task, snippets }),
      input_type: task.input_type,
      source_url: task.source_url || '',
      manual_topic: task.manual_topic || '',
      short_fragments: snippets
    }, null, 2),
    'utf8'
  )

  const command = interpolateCommand(llmCommandTemplate, { input: inputPath })
  const result = await runShellCommand(command, { timeoutMs: 600000 })
  await fs.rm(cleanupDir, { recursive: true, force: true })

  if (result.code !== 0) {
    auditLogs.push(auditLog(task.id, 'llm_failed', truncateText(result.stderr || 'llm_command_failed', 240)))
    return null
  }

  try {
    const parsed = JSON.parse(result.stdout)
    auditLogs.push(auditLog(task.id, 'llm_completed', `output_digest=${hashText(result.stdout)}`))
    return parsed
  } catch {
    auditLogs.push(auditLog(task.id, 'llm_parse_failed', `output_digest=${hashText(result.stdout)}`))
    return null
  }
}

async function collectLocalMediaText(task, args, auditLogs) {
  let audioPath = task.local_file_path
  let cleanupDir = ''
  if (task.input_type === 'local_video') {
    const extracted = await extractAudioFromVideo(task.local_file_path, args, auditLogs, task.id)
    audioPath = extracted.audioPath
    cleanupDir = extracted.cleanupDir
  }

  const asrText = audioPath ? await runAsr(audioPath, auditLogs, task.id) : ''
  const ocrText = task.input_type === 'local_video' ? await runOcrForVideo(task.local_file_path, args, auditLogs, task.id) : ''

  if (cleanupDir) {await fs.rm(cleanupDir, { recursive: true, force: true })}
  return [asrText, ocrText].filter(Boolean).join('\n')
}

function extractVisibleChapterSection(value = '') {
  const text = String(value || '').replace(/\r\n/g, '\n').trim()
  const start = text.indexOf('章节要点')
  if (start < 0) {return ''}

  const endMarkers = ['内容由AI生成', '举报', '发布时间：', '全部评论', '推荐视频']
  const endIndexes = endMarkers.map(marker => text.indexOf(marker, start)).filter(index => index > start)
  const end = endIndexes.length ? Math.min(...endIndexes) : start + 1200
  return text.slice(start, end)
}

async function collectUrlVisibleText(page, task) {
  await page.goto(task.source_url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(5000)

  const readVisible = async () => page.evaluate(() => {
    const selectors = ['[data-e2e="video-desc"]', '[data-e2e="detail-video-desc"]', 'h1', 'title']
    const values = []
    for (const selector of selectors) {
      for (const node of Array.from(document.querySelectorAll(selector))) {
        const text = (node.innerText || node.textContent || '').trim()
        if (text) {values.push(text)}
      }
    }
    const bodyText = document.body?.innerText || ''
    return {
      selected: Array.from(new Set(values)).join('\n'),
      chapter: bodyText
    }
  })

  let visible
  try {
    visible = await readVisible()
  } catch (error) {
    if (!/Execution context was destroyed|Cannot find context/.test(error?.message || '')) {throw error}
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(3000)
    visible = await readVisible()
  }

  return [visible.selected, extractVisibleChapterSection(visible.chapter)].filter(Boolean).join('\n')
}

function createEmptyKnowledgeCandidate(snippets = []) {
  return {
    plant_names: [],
    problem_clusters: [],
    observable_evidence: [],
    possible_causes: [],
    candidate_questions: [],
    candidate_actions: [],
    contraindications: [],
    key_takeaways: [],
    care_principles: [],
    common_mistakes: [],
    applicable_contexts: [],
    source_timeline: [],
    review_checklist: [],
    uncertainty_points: snippets.length
      ? ['当前结果只基于临时短片段，尚未经过人工审核。']
      : ['未获得足够可提炼内容，需要人工判断是否重试或废弃。'],
    risk_flags: [
      'pending_human_review',
      'no_original_video_saved',
      'no_full_transcript_saved'
    ]
  }
}

function normalizeKnowledgeCandidate(value, snippets = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {return createEmptyKnowledgeCandidate(snippets)}
  const empty = createEmptyKnowledgeCandidate(snippets)
  return {
    plant_names: Array.isArray(value.plant_names) ? value.plant_names : empty.plant_names,
    problem_clusters: Array.isArray(value.problem_clusters) ? value.problem_clusters : empty.problem_clusters,
    observable_evidence: Array.isArray(value.observable_evidence) ? value.observable_evidence : empty.observable_evidence,
    possible_causes: Array.isArray(value.possible_causes) ? value.possible_causes : empty.possible_causes,
    candidate_questions: Array.isArray(value.candidate_questions) ? value.candidate_questions : empty.candidate_questions,
    candidate_actions: Array.isArray(value.candidate_actions) ? value.candidate_actions : empty.candidate_actions,
    contraindications: Array.isArray(value.contraindications) ? value.contraindications : empty.contraindications,
    key_takeaways: Array.isArray(value.key_takeaways) ? value.key_takeaways : empty.key_takeaways,
    care_principles: Array.isArray(value.care_principles) ? value.care_principles : empty.care_principles,
    common_mistakes: Array.isArray(value.common_mistakes) ? value.common_mistakes : empty.common_mistakes,
    applicable_contexts: Array.isArray(value.applicable_contexts) ? value.applicable_contexts : empty.applicable_contexts,
    source_timeline: Array.isArray(value.source_timeline) ? value.source_timeline : empty.source_timeline,
    review_checklist: Array.isArray(value.review_checklist) ? value.review_checklist : empty.review_checklist,
    uncertainty_points: Array.isArray(value.uncertainty_points) ? value.uncertainty_points : empty.uncertainty_points,
    risk_flags: Array.isArray(value.risk_flags) ? Array.from(new Set([...empty.risk_flags, ...value.risk_flags])) : empty.risk_flags
  }
}

function buildCandidateKnowledge(task, snippets = [], auditLogs = [], llmKnowledge = null) {
  const createdAt = nowIso()
  const inputDigest = hashText(snippets.join('\n'))
  return {
    id: createId('candidate'),
    task_id: task.id,
    input_type: task.input_type,
    source_url: task.source_url || '',
    source_platform: task.source_platform,
    manual_topic: task.manual_topic,
    knowledge_candidate: normalizeKnowledgeCandidate(llmKnowledge, snippets),
    source_knowledge_layer: buildSourceKnowledgeLayer(task, snippets, auditLogs),
    llm_status: llmKnowledge ? 'completed' : 'not_configured_or_failed',
    review_status: 'pending',
    review_notes: '',
    extraction_input_digest: inputDigest,
    source_fragment_count: snippets.length,
    created_at: createdAt,
    updated_at: createdAt,
    audit_summary: auditLogs.filter(item => item.task_id === task.id).map(item => ({
      event_type: item.event_type,
      event_detail: item.event_detail
    }))
  }
}

function buildAiPrompt(task) {
  return [
    '你是绿植诊断知识结构化助手。',
    '',
    '任务：从输入的短片段摘要中提炼抽象养护知识。不要复述原文，不要保留完整逐字稿，不要生成文章，不要模仿博主表达。',
    '',
    '请输出结构化 JSON，字段包括：',
    '1. plant_names：涉及植物',
    '2. problem_clusters：问题簇',
    '3. observable_evidence：用户可观察证据',
    '4. possible_causes：可能原因，包含证据和置信等级',
    '5. candidate_questions：可转化为问诊的问题',
    '6. candidate_actions：候选行动建议',
    '7. contraindications：不适用条件或反证条件',
    '8. key_takeaways：核心抽象要点，覆盖视频主要知识点',
    '9. care_principles：可复用养护原则',
    '10. common_mistakes：常见误区',
    '11. applicable_contexts：适用场景或前提',
    '12. source_timeline：若输入有时间线，输出 time_label 与 abstract_point',
    '13. review_checklist：人工审核需要核对的关键项',
    '14. uncertainty_points：不确定点',
    '15. risk_flags：风险提示',
    '16. review_suggestion：人工审核建议',
    '',
    '要求：',
    '- 不输出原始句子；',
    '- 不输出完整字幕；',
    '- 不保留博主口吻；',
    '- 不生成可直接发布的文章；',
    '- 不将经验性内容当成确定事实；',
    '- 若信息不足，必须标记不确定；',
    '- 若涉及药剂、修根、强剪、换盆等高风险动作，必须标记需要人工复核。',
    '',
    '来源类型：',
    task.input_type || 'unknown',
    '',
    '来源 URL：',
    task.source_url || '未填写',
    '',
    '人工主题：',
    task.manual_topic || '未填写',
    '',
    '短片段摘要，仅用于抽象提炼，不得逐句复述：',
    JSON.stringify(task.snippets || [], null, 2)
  ].join('\n')
}

async function writeRunArtifacts({ tasks, candidates, auditLogs, outputDir }) {
  await fs.mkdir(outputDir, { recursive: true })
  const runId = createId('run')
  const baseName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${runId}`
  const jsonPath = path.join(outputDir, `${baseName}.json`)

  await fs.writeFile(
    jsonPath,
    JSON.stringify({
      run_id: runId,
      created_at: nowIso(),
      queue_type: 'manual_review',
      retention_policy: {
        saves_original_video: false,
        saves_original_audio: false,
        saves_full_transcript: false,
        saves_comments: false,
        saves_account_profile: false,
        saves_complete_subtitles: false
      },
      prohibited_actions: [
        'reverse_engineer_douyin_api',
        'handle_captcha',
        'use_proxy_pool',
        'crawl_comments',
        'crawl_account_homepage',
        'save_full_subtitles'
      ],
      tasks: tasks.map(serializeTaskForOutput),
      candidates,
      audit_logs: auditLogs
    }, null, 2),
    'utf8'
  )

  return { jsonPath }
}

function serializeTaskForOutput(task) {
  return {
    id: task.id,
    input_type: task.input_type,
    source_url: task.source_url || '',
    local_file_path: task.local_file_path || '',
    text_file_path: task.text_file_path || '',
    source_platform: task.source_platform,
    manual_topic: task.manual_topic,
    manual_note: task.manual_note,
    manual_text_digest: task.manual_text ? hashText(task.manual_text) : '',
    status: task.status,
    risk_level: task.risk_level,
    error_message: task.error_message,
    validation: task.validation,
    created_at: task.created_at,
    updated_at: task.updated_at,
    processed_at: task.processed_at
  }
}

async function createBrowser(args) {
  if (args.noBrowser) {return { context: null, page: null }}
  const chromium = await loadPlaywright()
  await fs.mkdir(args.userDataDir, { recursive: true })
  const context = await chromium.launchPersistentContext(args.userDataDir, {
    headless: args.headless,
    viewport: { width: 1360, height: 960 }
  })
  const page = context.pages()[0] || await context.newPage()
  page.setDefaultTimeout(30000)
  return { context, page }
}

function auditLog(taskId, eventType, eventDetail) {
  return {
    id: createId('audit'),
    task_id: taskId,
    event_type: eventType,
    event_detail: eventDetail,
    created_at: nowIso()
  }
}

async function processTask(task, page, args, auditLogs) {
  if (task.status === 'rejected') {
    auditLogs.push(auditLog(task.id, 'task_rejected', task.error_message))
    return null
  }

  try {
    let rawText = ''
    if (task.input_type === 'manual_text') {
      rawText = await collectManualText(task)
      auditLogs.push(auditLog(task.id, 'manual_text_loaded', `input_digest=${hashText(rawText)}`))
    } else if (task.input_type === 'local_video' || task.input_type === 'local_audio') {
      rawText = await collectLocalMediaText(task, args, auditLogs)
    } else if (task.input_type === 'url') {
      if (!page) {
        auditLogs.push(auditLog(task.id, 'url_accessibility_skipped', 'browser_disabled'))
      } else {
        rawText = await collectUrlVisibleText(page, task)
        auditLogs.push(auditLog(task.id, 'url_accessibility_attempted', `visible_text_digest=${hashText(rawText)}`))
      }
    }

    const snippets = splitSnippetText(
      [task.manual_topic, task.manual_note, rawText].filter(Boolean).join('\n'),
      { snippetLimit: args.snippetLimit, snippetMaxChars: args.snippetMaxChars }
    )
    const llmKnowledge = await runStructuringLlm(task, snippets, auditLogs)

    task.status = 'processed'
    task.processed_at = nowIso()
    task.updated_at = nowIso()
    auditLogs.push(auditLog(task.id, 'task_processed', `source_fragment_count=${snippets.length}`))
    return buildCandidateKnowledge(task, snippets, auditLogs, llmKnowledge)
  } catch (error) {
    task.status = 'failed'
    task.error_message = error?.message || String(error)
    task.updated_at = nowIso()
    auditLogs.push(auditLog(task.id, 'task_failed', task.error_message))
    return buildCandidateKnowledge(task, [], auditLogs)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const rawTasks = await readInputTasks(args)
  const tasks = enforceLimits(rawTasks, args)
  const auditLogs = []
  const candidates = []
  const needsBrowser = tasks.some(task => task.status === 'pending' && task.input_type === 'url' && !args.noBrowser)

  const { context, page } = needsBrowser ? await createBrowser(args) : { context: null, page: null }

  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index]
    console.log(`[${index + 1}/${tasks.length}] ${task.status === 'pending' ? '处理' : '跳过'}：${task.input_type}`)
    const candidate = await processTask(task, page, args, auditLogs)
    if (candidate) {candidates.push(candidate)}

    const hasNextRunnableUrl = tasks.slice(index + 1).some(item => item.status === 'pending' && item.input_type === 'url')
    if (task.input_type === 'url' && hasNextRunnableUrl) {
      const waitSeconds = randomInt(args.minIntervalSeconds, args.maxIntervalSeconds)
      console.log(`URL 低频等待 ${waitSeconds} 秒后处理下一条。`)
      await sleep(waitSeconds * 1000)
    }
  }

  if (context) {await context.close()}
  const artifacts = await writeRunArtifacts({ tasks, candidates, auditLogs, outputDir: args.outputDir })
  console.log(`已写入人工审核队列 JSON：${artifacts.jsonPath}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
