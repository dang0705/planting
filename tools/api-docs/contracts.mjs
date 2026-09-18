/* oxlint-disable no-magic-numbers */
/**
 * API 文档的唯一展示目录。字段说明面向调用方；接口行为仍以云函数源码为准。
 * 不在这里保存 URL 凭据、会话令牌或任何可用于提权的内部字段。
 */
const field = (name, required, description, example) => ({ name, required, description, example })

const envelope = [
  field('code', true, 'HTTP 处理结果；200 表示本次业务处理成功。', 200),
  field('message', false, '给调用方显示或记录的简短结果说明。', '获取成功'),
  field('data', true, '本接口的业务数据；具体结构见下方“返回数据”。', {})
]

const endpoint = (category, method, path, name, description, options = {}) => ({
  id: `${method}-${path}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
  category,
  method,
  path,
  name,
  description,
  auth: options.auth || '需要登录会话',
  query: options.query || [],
  body: options.body || [],
  response: options.response || envelope,
  example: options.example || {},
  caution: options.caution || ''
})

export const categories = [
  { id: 'health', name: '服务状态', description: '只验证函数是否可达，不代表业务链路或登录态已经验证。' },
  { id: 'diagnosis', name: '植物诊断', description: '图片/症状诊断、问诊题包、结果与历史。' },
  { id: 'plant', name: '植物与养护', description: '植物目录、我的植物、浇水、施肥与环境。' },
  { id: 'weather', name: '天气环境', description: '天气、城市和诊断/养护所需环境窗口。' },
  { id: 'media', name: '识别与文件', description: '植物识别、图片与文件管理。' },
  { id: 'account', name: '账号与订阅', description: '账户、手机号会话和订阅订单。' },
  { id: 'review', name: '运营审查', description: '仅授权运营角色使用的诊断复核和视觉候选治理接口。' }
]

export const endpoints = [
  endpoint('health', 'GET', 'diagnose-http/health', '诊断服务健康检查', '确认诊断函数已加载。', { auth: '无需登录', response: [field('data.status', true, '服务状态。', 'ok'), field('data.timestamp', true, '服务端时间戳。', 1710000000000)] }),
  endpoint('health', 'GET', 'plant-catalog-http/catalog/health', '植物目录健康检查', '确认植物目录函数可达。', { auth: '无需登录' }),
  endpoint('health', 'GET', 'plant-user-http/user-plants/health', '我的植物健康检查', '确认用户植物函数可达。', { auth: '无需登录' }),
  endpoint('health', 'GET', 'identify-http/identify/health', '识别服务健康检查', '确认植物识别函数可达。', { auth: '无需登录' }),
  endpoint('health', 'GET', 'weather-http/weather/health', '天气服务健康检查', '确认天气函数可达。', { auth: '无需登录' }),
  endpoint('health', 'GET', 'storage-http/storage/health', '文件服务健康检查', '确认上传/文件函数可达。', { auth: '无需登录' }),
  endpoint('health', 'GET', 'auth-user-http/auth/user/health', '账户服务健康检查', '确认账户函数可达。', { auth: '无需登录' }),
  endpoint('health', 'GET', 'platform-phone-bootstrap-http/auth/platform-phone/health', '手机号引导健康检查', '确认跨端手机号引导函数可达。', { auth: '无需登录' }),
  endpoint('health', 'GET', 'subscription-http/subscription/health', '订阅服务健康检查', '确认订阅函数可达。', { auth: '无需登录' }),

  endpoint('diagnosis', 'POST', 'diagnose-http/diagnosis/start', '发起植物诊断', '提交图片或人工症状，创建一轮诊断并返回下一步（诊断、问诊或最终结果）。', {
    body: [field('imageUrls', false, '待分析图片的可访问地址列表；无图诊断时可不传。', ['https://example.com/plant.jpg']), field('plantId / userPlantId', false, '目录植物或“我的植物”记录，用于补充养护背景。', '123'), field('description', false, '用户观察到的补充现象。', '叶尖开始发黄'), field('clientContext', false, '调用端与入口上下文，帮助服务端选择兼容处理。', { platform: 'mp-weixin' })],
    response: [field('data.diagnosisSessionId', true, '本轮诊断会话标识，后续答题/取结果使用。', 'diag_xxx'), field('data.stage', true, '当前阶段，如 question_package 或 final。', 'question_package'), field('data.questions', false, '需要用户回答的问题集合。', []), field('data.finalResult', false, '已可输出时的诊断结论和建议。', {})],
    example: { imageUrls: ['https://example.com/plant.jpg'], description: '叶片发黄' }, caution: '此接口会消耗诊断能力；在线调试请使用测试图片和测试账号。'
  }),
  endpoint('diagnosis', 'POST', 'diagnosis-question-start-http/diagnosis/question/start', '初始化固定问诊题包', '针对黄叶或发蔫等人工症状，直接生成整包问题。', { body: [field('symptomClassKey', true, '症状类别。yellowing_mode 为黄叶，wilting_droop_mode 为发蔫下垂。', 'yellowing_mode'), field('userPlantId / plantCatalogId', false, '被诊断植物；诊断 Tab 匿名入口可不传。', '123')], response: [field('data.diagnosisSessionId', true, '后续提交答案所需的会话标识。', 'diag_xxx'), field('data.questions', true, '整包待答问题与选项。', []), field('data.questionPackageContinuationToken', true, '提交该题包答案所需的续接凭据。', 'token')], example: { symptomClassKey: 'yellowing_mode', plantCatalogId: '123' } }),
  endpoint('diagnosis', 'POST', 'diagnose-http/diagnosis/question/start', '初始化问诊题包（兼容路由）', '与独立题包服务功能一致的兼容入口；现有客户端会在非固定题包模式使用它。', { body: [field('symptomClassKey', false, '人工症状类别；固定题包优先使用专用接口。', 'yellowing_mode'), field('userPlantId / plantCatalogId', false, '被诊断植物。', '123')], response: [field('data.diagnosisSessionId', true, '后续提交答案所需的会话标识。', 'diag_xxx'), field('data.questions', false, '服务端要求回答的问题。', [])], example: { symptomClassKey: 'yellowing_mode', plantCatalogId: '123' } }),
  endpoint('diagnosis', 'POST', 'diagnosis-answer-http/diagnosis/answer', '提交整包问诊答案', '一次提交当前题包的所有回答并获取后续结论。', { body: [field('diagnosisSessionId', true, '由开始诊断或初始化问诊返回。', 'diag_xxx'), field('answers', true, '题目答案列表；每项必须对应返回的问题。', [{ questionKey: 'q_xxx', optionKey: 'unknown' }]), field('questionPackageContinuationToken', true, '由题包初始化返回，用于校验同一会话。', 'token')], response: [field('data.stage', true, '处理后的阶段。', 'final'), field('data.finalResult', false, '诊断结论、原因与建议。', {})], example: { diagnosisSessionId: 'diag_xxx', answers: [], questionPackageContinuationToken: 'token' } }),
  endpoint('diagnosis', 'POST', 'diagnose-http/diagnosis/answer', '提交问诊答案（兼容路由）', '兼容旧诊断会话的答题入口；固定题包优先使用独立答题服务。', { body: [field('diagnosisSessionId', true, '当前诊断会话标识。', 'diag_xxx'), field('answers', true, '当前问题的答案列表。', [])], response: [field('data.stage', true, '处理后的诊断阶段。', 'final'), field('data.finalResult', false, '可输出时的诊断结论。', {})], example: { diagnosisSessionId: 'diag_xxx', answers: [] } }),
  endpoint('diagnosis', 'GET', 'diagnose-http/diagnosis/result', '读取诊断结果', '按会话或结果标识读取用户可见的已完成诊断。', { query: [field('id', true, '诊断会话 ID 或结果 ID。', 'diag_xxx')], response: [field('data.resultId', true, '结果标识。', 'result_xxx'), field('data.summary', true, '面向用户的结论摘要。', '可能是浇水过频'), field('data.nextSteps', true, '可执行的下一步建议。', [])], example: { id: 'diag_xxx' } }),
  endpoint('diagnosis', 'GET', 'diagnose-http/diagnosis/history', '查询诊断历史', '分页读取当前用户自己的诊断记录。', { query: [field('page', false, '页码，从 1 开始。', 1), field('pageSize', false, '每页数量。', 20)], response: [field('data.list', true, '历史记录列表。', []), field('data.total', true, '符合条件的记录总数。', 1)], example: { page: 1, pageSize: 20 } }),
  endpoint('diagnosis', 'POST', 'diagnose-http/diagnosis/feedback', '提交诊断反馈', '记录用户对一条诊断结果的评价，用于后续改进。', { body: [field('resultId', true, '被反馈的诊断结果。', 'result_xxx'), field('feedback', true, '用户评价或纠正说明。', '建议有效')], example: { resultId: 'result_xxx', feedback: '建议有效' } }),
  endpoint('diagnosis', 'POST', 'diagnose-http/diagnosis/retake/authorize', '申请补拍', '为当前诊断申请补拍图片的授权或指引。', { body: [field('diagnosisSessionId', true, '当前诊断会话。', 'diag_xxx')], example: { diagnosisSessionId: 'diag_xxx' } }),
  endpoint('diagnosis', 'POST', 'diagnose-http/diagnosis/retake/skip', '跳过补拍', '用户明确不补拍时继续当前诊断流程。', { body: [field('diagnosisSessionId', true, '当前诊断会话。', 'diag_xxx')], example: { diagnosisSessionId: 'diag_xxx' } }),
  endpoint('diagnosis', 'POST', 'diagnose-http/watering/soil-evidence', '保存临时盆土证据', '为浇水建议暂存用户确认的盆土状态，后续计算会读取它。', { body: [field('soilState', true, '用户观察到的土壤状态。', 'dry'), field('plantId', false, '关联的用户植物。', 123)], example: { soilState: 'dry', plantId: 123 } }),

  endpoint('plant', 'GET', 'plant-catalog-http/catalog/plants', '查询植物目录', '按名称筛选可添加的植物目录。', { auth: '无需登录', query: [field('keyword', false, '植物中文名或别名关键词。', '绿萝'), field('page', false, '页码。', 1), field('pageSize', false, '每页数量。', 10)], response: [field('data.list', true, '目录植物列表。', []), field('data.total', true, '匹配总数。', 1)], example: { keyword: '绿萝', page: 1, pageSize: 10 } }),
  endpoint('plant', 'GET', 'plant-catalog-http/catalog/map', '获取植物目录映射', '获取适合选择器使用的精简目录映射。', { auth: '无需登录', query: [field('keyword', false, '可选筛选关键词。', '绿萝')], response: [field('data', true, '植物 ID 到展示信息的映射。', {})], example: { keyword: '绿萝' } }),
  endpoint('plant', 'POST', 'plant-catalog-http/catalog/image-urls', '换取目录图片地址', '将目录图片标识批量解析为可展示的访问地址。', { body: [field('fileIds', true, '需要换取地址的图片文件标识列表。', ['cloud://xxx'])], response: [field('data.urls', true, '与传入文件对应的可访问地址。', [])], example: { fileIds: ['cloud://xxx'] } }),
  endpoint('plant', 'GET', 'plant-user-http/user-plants', '查询我的植物或详情', '不带 id 时分页查询；带 id 时返回一株植物的完整养护档案。', { query: [field('id', false, '“我的植物”记录 ID；传入后读取详情。', 123), field('page', false, '列表页码。', 1), field('pageSize', false, '列表每页数量。', 20)], response: [field('data.list', false, '列表模式下的植物数组。', []), field('data', true, '详情模式为单株植物；列表模式含分页数据。', {})], example: { page: 1, pageSize: 20 } }),
  endpoint('plant', 'POST', 'plant-user-http/user-plants', '添加我的植物', '以目录植物或用户填写信息创建个人植物档案。', { body: [field('catalogPlantId', false, '关联的标准植物目录 ID。', 123), field('nickname', false, '用户为植物起的昵称。', '客厅绿萝'), field('careLocation', false, '养护位置，影响天气与浇水建议。', { city: '上海市' })], response: [field('data.id', true, '新建的个人植物记录 ID。', 456)], example: { catalogPlantId: 123, nickname: '客厅绿萝' } }),
  endpoint('plant', 'PUT', 'plant-user-http/user-plants', '更新我的植物', '更新已有植物的昵称、位置、盆型或养护资料。', { body: [field('id', true, '要更新的个人植物记录 ID。', 456), field('nickname', false, '新的展示昵称。', '窗边绿萝'), field('careLocation / potProfile', false, '养护位置或盆型资料。', {})], example: { id: 456, nickname: '窗边绿萝' } }),
  endpoint('plant', 'DELETE', 'plant-user-http/user-plants', '删除我的植物', '移除当前用户的一株植物及其关联资料。', { query: [field('id', true, '要删除的个人植物记录 ID。', 456)], example: { id: 456 }, caution: '此操作会删除当前用户的植物档案，请只在测试数据上调用。' }),
  endpoint('plant', 'GET', 'plant-user-http/user-plants/air-environment', '读取空气环境', '读取某株植物的通风、空间和设备风等养护环境。', { query: [field('plantId', true, '个人植物记录 ID。', 456)], example: { plantId: 456 } }),
  endpoint('plant', 'PUT', 'plant-user-http/user-plants/air-environment', '保存空气环境', '保存影响蒸腾与养护建议的空气环境信息。', { body: [field('plantId', true, '个人植物记录 ID。', 456), field('airEnvironment', true, '通风、空间和设备风的结构化描述。', { ventilation: 'normal' })], example: { plantId: 456, airEnvironment: { ventilation: 'normal' } } }),
  endpoint('plant', 'GET', 'plant-user-http/user-plants/watering-reminders', '读取浇水提醒', '读取一株植物已保存的浇水计划和历史。', { query: [field('plantId', true, '个人植物记录 ID。', 456)], example: { plantId: 456 } }),
  endpoint('plant', 'POST', 'plant-user-http/user-plants/watering-reminders', '保存浇水提醒', '保存用户确认的浇水日期和提醒计划。', { body: [field('plantId', true, '个人植物记录 ID。', 456), field('wateringEvents', true, '近期实际浇水日期集合。', ['2026-09-01'])], example: { plantId: 456, wateringEvents: ['2026-09-01'] } }),
  endpoint('plant', 'POST', 'plant-user-http/user-plants/watering-reminders/complete', '确认已浇水', '将计划中的一次浇水标记为已完成。', { body: [field('plantId', true, '个人植物记录 ID。', 456), field('date', false, '实际浇水日期，默认当前日期。', '2026-09-13')], example: { plantId: 456, date: '2026-09-13' } }),
  endpoint('plant', 'POST', 'plant-user-http/user-plants/watering-reminders/undo', '撤销浇水确认', '撤销刚才误操作的已浇水记录。', { body: [field('plantId', true, '个人植物记录 ID。', 456), field('date', true, '需要撤销的浇水日期。', '2026-09-13')], example: { plantId: 456, date: '2026-09-13' } }),
  endpoint('plant', 'GET', 'plant-user-http/user-plants/fertilization-reminders', '读取施肥提醒', '读取一株植物当前的施肥提醒状态。', { query: [field('plantId', true, '个人植物记录 ID。', 456)], example: { plantId: 456 } }),
  endpoint('plant', 'POST', 'plant-user-http/user-plants/fertilization-reminders/preview', '预览施肥提醒', '根据养护情况生成施肥建议，但不保存。', { body: [field('plantId', true, '个人植物记录 ID。', 456)], example: { plantId: 456 } }),
  endpoint('plant', 'POST', 'plant-user-http/user-plants/fertilization-reminders/confirm', '确认施肥提醒', '确认并保存生成的施肥提醒。', { body: [field('plantId', true, '个人植物记录 ID。', 456)], example: { plantId: 456 } }),
  endpoint('plant', 'POST', 'plant-user-http/user-plants/fertilization-reminders/complete', '确认已施肥', '记录一次实际施肥完成。', { body: [field('plantId', true, '个人植物记录 ID。', 456)], example: { plantId: 456 } }),
  endpoint('plant', 'POST', 'plant-user-http/user-plants/fertilization-reminders/dismiss', '暂不处理施肥提醒', '暂时关闭本次施肥提醒，不删除植物资料。', { body: [field('plantId', true, '个人植物记录 ID。', 456)], example: { plantId: 456 } }),
  endpoint('plant', 'POST', 'plant-user-http/user-plants/fertilization-reminders/cancel', '取消施肥提醒', '取消当前已保存的施肥提醒。', { body: [field('plantId', true, '个人植物记录 ID。', 456)], example: { plantId: 456 } }),
  endpoint('plant', 'POST', 'plant-user-http/user-plants/watering-planner', '计算我的植物浇水建议', '结合用户植物、实际浇水记录和天气，生成下一次浇水建议。', { body: [field('plantId', true, '个人植物记录 ID。', 456), field('wateringEvents', false, '最近浇水记录；为空时服务端读取已保存记录。', ['2026-09-01']), field('weatherDays / forecastDays', false, '调用端已有的天气窗口；服务端会做必要校正。', [])], response: [field('data.nextWateringDate', true, '建议的下一次浇水日期。', '2026-09-16'), field('data.amountRangeMl', false, '建议用水量范围。', { min: 200, max: 300 })], example: { plantId: 456, wateringEvents: ['2026-09-01'] } }),
  endpoint('plant', 'GET', 'plant-user-http/user-plants/watering-advisor', '读取临时浇水建议历史', '读取未绑定“我的植物”的临时浇水建议会话。', { query: [field('page', false, '页码。', 1), field('pageSize', false, '每页数量。', 20)], example: { page: 1, pageSize: 20 } }),
  endpoint('plant', 'POST', 'plant-user-http/user-plants/watering-advisor', '计算或保存临时浇水建议', 'action=compute 计算，save 保存，confirm_watered 记录已浇水。', { body: [field('action', false, '操作类型：compute、save 或 confirm_watered；默认 compute。', 'compute'), field('catalogPlantId', true, '目录植物 ID。', '123'), field('potProfile', false, '临时盆型资料。', {}), field('wateringEvents', false, '近期浇水记录。', [])], example: { action: 'compute', catalogPlantId: '123', wateringEvents: ['2026-09-01'] } }),

  endpoint('weather', 'GET', 'weather-http/weather/hot-cities', '查询热门城市', '返回内置热门城市，供位置选择器使用。', { auth: '无需登录', response: [field('data.list', true, '城市列表及定位信息。', [])] }),
  endpoint('weather', 'GET', 'weather-http/weather/hot-cities/resolve', '解析热门城市位置', '按城市名或经纬度定位到可用于天气查询的城市。', { auth: '无需登录', query: [field('cityName / city / name', false, '城市名称。', '上海市'), field('lat / lng', false, '可选经纬度。', 31.23)], example: { cityName: '上海市' } }),
  endpoint('weather', 'POST', 'weather-http/weather/current', '获取当前天气', '按坐标获取当前天气及可复用缓存信息。', { body: [field('lat', true, '纬度。', 31.22352), field('lng', true, '经度。', 121.45591), field('city / province', false, '城市、省份，用于提升缓存命中。', '上海市'), field('useCache', false, '是否允许使用天气缓存，默认 true。', true)], example: { lat: 31.22352, lng: 121.45591, city: '上海市', province: '上海市', useCache: true } }),
  endpoint('weather', 'POST', 'weather-http/weather/environment-context', '获取养护/诊断环境窗口', '返回诊断或浇水建议所需的历史和预测天气窗口。', { body: [field('lat / lng', false, '非诊断模式下必填的坐标。', 31.22352), field('mode', false, '环境窗口用途，例如 diagnosis。', 'diagnosis'), field('diagnosisDate', false, '需要对齐的诊断日期。', '2026-09-13'), field('locationKey', false, '调用端已知的位置键。', 'city:shanghai')], example: { lat: 31.22352, lng: 121.45591, mode: 'diagnosis' } }),
  endpoint('weather', 'GET', 'weather-http/weather/recent', '读取近期天气归档', '读取指定位置的近期天气记录。', { query: [field('locationKey', true, '位置键。', 'city:shanghai'), field('days', false, '需要的天数。', 10)], example: { locationKey: 'city:shanghai', days: 10 } }),
  endpoint('weather', 'POST', 'weather-http/weather/v7/weather/24h', '查询 24 小时天气', '查询小时级天气数据。', { body: [field('location', true, '天气服务使用的位置标识。', '101020100')], example: { location: '101020100' } }),
  endpoint('weather', 'POST', 'weather-http/weather/ingestion/recent-10d', '写入近期天气归档', '供受控采集任务写入近期天气；不供普通客户端调用。', { auth: '仅受控任务', body: [field('locationKey', true, '位置键。', 'city:shanghai'), field('days', true, '待归档的日天气集合。', [])], example: { locationKey: 'city:shanghai', days: [] }, caution: '运营写接口，普通会话无权调用。' }),

  endpoint('media', 'POST', 'identify-http/identify/plant', '识别植物', '以图片地址识别植物类别并返回候选结果。', { body: [field('imageUrl', true, '已上传图片的可访问地址。', 'https://example.com/plant.jpg')], response: [field('data.candidates', true, '识别候选及置信度。', []), field('data.routePrimaryAction', false, '建议调用端采取的下一步。', 'show_candidates')], example: { imageUrl: 'https://example.com/plant.jpg' } }),
  endpoint('media', 'POST', 'storage-http/storage/diagnose-images', '上传诊断图片', '上传用于诊断的图片并取得文件标识/访问地址。微信端优先原生云存储直传。', { body: [field('file', true, 'multipart 文件；JSON 调试仅用于兼容路径。', '<binary>'), field('plantId', false, '关联的植物。', '456')], example: { plantId: '456' }, caution: '页面代理不代替小程序的二进制上传；请用客户端或专用上传工具验证文件流。' }),
  endpoint('media', 'GET', 'storage-http/storage/files', '读取文件信息', '按文件标识读取当前用户可访问的文件信息。', { query: [field('fileId', true, '文件标识。', 'cloud://xxx')], example: { fileId: 'cloud://xxx' } }),
  endpoint('media', 'POST', 'storage-http/storage/files', '保存通用文件', '保存当前用户授权上传的通用文件。', { body: [field('file', true, '待上传文件。', '<binary>')], example: {} }),
  endpoint('media', 'DELETE', 'storage-http/storage/files', '删除通用文件', '删除当前用户拥有的文件。', { query: [field('fileId', true, '待删除的文件标识。', 'cloud://xxx')], example: { fileId: 'cloud://xxx' }, caution: '删除不可恢复，请只对测试文件调用。' }),
  endpoint('media', 'GET', 'storage-http/storage/plant-images', '读取植物图片', '读取当前用户植物关联图片。', { query: [field('plantId', true, '个人植物记录 ID。', 456)], example: { plantId: 456 } }),

  endpoint('account', 'POST', 'auth-user-http/auth/user', '账户资料与登录动作', '以 action 区分手机号登录、微信登录、资料更新或账号查询。', { body: [field('action', true, 'phoneLogin、platformPhoneLogin、wechatLogin、updateEmail、updatePhoneNumber、getUserByUnionId、getUserByOpenid 或 getUserByEmail。', 'wechatLogin'), field('phone / email / openid / unionid', false, '与 action 对应的身份或资料字段。', 'user@example.com')], example: { action: 'wechatLogin' } }),
  endpoint('account', 'POST', 'platform-phone-bootstrap-http/auth/platform-phone', '手机号会话引导', '三端首次手机号登录的 HTTPS 引导入口。', { auth: '无需已有会话', body: [field('action', true, '按服务端定义选择手机号引导操作。', 'bootstrap'), field('phoneCredential', false, '平台提供的手机号授权凭据。', 'credential')], example: { action: 'bootstrap' }, caution: '不得在文档或截图中粘贴真实手机号凭据。' }),
  endpoint('account', 'GET', 'subscription-http/subscription/plans', '读取订阅方案', '读取当前可购买的订阅方案和展示价格。', { auth: '无需登录' }),
  endpoint('account', 'GET', 'subscription-http/subscription/orders', '查询订阅订单', '分页读取当前用户自己的订阅订单。', { query: [field('page', false, '页码。', 1), field('pageSize', false, '每页数量。', 20)], example: { page: 1, pageSize: 20 } }),
  endpoint('account', 'POST', 'subscription-http/subscription/orders', '创建订阅订单', '为当前用户创建待支付订阅订单。', { body: [field('planId', true, '所选订阅方案。', 'monthly')], example: { planId: 'monthly' }, caution: '可能触发支付链路；默认示例仅用于查看参数，不应直接提交真实支付。' }),
  endpoint('account', 'POST', 'subscription-http/subscription/notify', '处理订阅支付通知', '支付平台回调入口，不面向浏览器或普通用户会话。', { auth: '仅支付平台', body: [field('notification', true, '支付平台签名后的通知原文。', '<platform payload>')], example: {}, caution: '回调签名由支付平台校验，不能用普通网页调试。' }),

  endpoint('review', 'GET', 'diagnose-http/diagnosis/review/list', '查询诊断审查列表', '运营人员筛选需要人工审查的诊断记录。', { auth: '仅运营授权', query: [field('page / pageSize', false, '分页参数。', 1)], example: { page: 1, pageSize: 20 } }),
  endpoint('review', 'GET', 'diagnose-http/diagnosis/review/images', '读取审查图片', '获取一条诊断审查所关联的图片。', { auth: '仅运营授权', query: [field('id', true, '审查或诊断记录标识。', 'diag_xxx')], example: { id: 'diag_xxx' } }),
  endpoint('review', 'GET', 'diagnose-http/diagnosis/review/detail', '读取诊断审查详情', '读取审查所需的完整诊断上下文。', { auth: '仅运营授权', query: [field('id', true, '审查记录标识。', 'diag_xxx')], example: { id: 'diag_xxx' } }),
  endpoint('review', 'GET', 'diagnose-http/visual/out-of-pool/list', '查询池外视觉候选', '运营人员查看未被当前视觉知识池覆盖的候选。', { auth: '仅运营授权', query: [field('page / pageSize', false, '分页参数。', 1)], example: { page: 1, pageSize: 20 } }),
  endpoint('review', 'GET', 'diagnose-http/visual/out-of-pool/image', '读取池外候选图片', '读取一个池外候选的图片资料。', { auth: '仅运营授权', query: [field('id', true, '候选标识。', 'candidate_xxx')], example: { id: 'candidate_xxx' } }),
  endpoint('review', 'POST', 'diagnose-http/visual/out-of-pool/review', '审查池外视觉候选', '提交运营人员对池外候选的审查结论。', { auth: '仅运营授权', body: [field('id', true, '候选标识。', 'candidate_xxx'), field('decision', true, '审查结论。', 'approve')], example: { id: 'candidate_xxx', decision: 'approve' } }),
  endpoint('review', 'GET', 'diagnose-http/visual/out-of-pool/proxy-mappings/list', '查询候选映射', '读取已配置的池外候选代理映射。', { auth: '仅运营授权', query: [field('page / pageSize', false, '分页参数。', 1)], example: { page: 1, pageSize: 20 } }),
  endpoint('review', 'POST', 'diagnose-http/visual/out-of-pool/proxy-mappings/upsert', '保存候选映射', '新增或更新池外候选到受控处理策略的映射。', { auth: '仅运营授权', body: [field('candidateKey', true, '候选键。', 'candidate_xxx'), field('targetKey', true, '映射到的受控目标键。', 'target_xxx')], example: { candidateKey: 'candidate_xxx', targetKey: 'target_xxx' } }),
  endpoint('review', 'POST', 'diagnose-http/visual/out-of-pool/proxy-mappings/disable', '停用候选映射', '停用一条已配置的代理映射。', { auth: '仅运营授权', body: [field('id', true, '映射记录标识。', 'mapping_xxx')], example: { id: 'mapping_xxx' } })
]

export const apiDocument = {
  title: '青花植 API 文档',
  version: '1.0.0',
  responseEnvelope: envelope,
  categories,
  endpoints
}
