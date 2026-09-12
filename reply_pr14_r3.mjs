import https from 'node:https'

const GH_TOKEN = process.argv[2]
const OWNER = 'dang0705'
const REPO = 'planting'
const PR = 14

const replies = [
  {
    in_reply_to: 3651769491,
    body: "Addressed in e0682a5. buildNonPestDirectResult now populates outcomeType='problematic', resultId, finalResult.problemId and topProblem.problemId so session persistence recognizes the direct result and downstream consumers can resolve the problem identifier."
  },
  {
    in_reply_to: 3651769492,
    body: "Addressed in e0682a5. loadWeatherDays now resolves plant.careLocation first and uses it for both D0 injection (locationKey) and the forecast window, falling back to userStore.location only when the plant has no careLocation. This keeps D0 and forecast from the same source, matching the WateringReminderSheet fix from the previous round."
  },
  {
    in_reply_to: 3651769496,
    body: "Addressed in e0682a5. timelinePayload now checks hasSelection && selectedMl===null first and returns amountMl:null explicitly, so an explicit 'don't know' choice is no longer replaced by fallbackMl. Only truly unset values (hasSelection=false) fall through to the default second-gear fallback."
  },
  {
    in_reply_to: 3651769498,
    body: "Addressed in e0682a5. Split pest-visual-orchestrator.js (was 521 lines, exceeding the 500-line limit) into three files: pest-visual-orchestrator.js (399 lines, routing orchestration), pest-route-evidence.js (routeResult -> evidence ledger + direct tier candidate promotion) and non-pest-direct-result.js (non-pest visual_direct_only direct result + candidate tier resolver). All three are well under the 500-line limit."
  },
  {
    in_reply_to: 3651769499,
    body: "Addressed in e0682a5. diagnosis-round-presenter.js now propagates questionPackage and questions through the non-question branch when questionPackage.optionalFollowUp=true. Both buildCompactAnswerRoundResponse and buildPublicRoundResponse emit questions[0] so the client can render the optional confirmation question alongside the likely finalResult."
  }
]

function postReply(reply) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      body: reply.body,
      in_reply_to: reply.in_reply_to
    })
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}/pulls/${PR}/comments`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${OWNER}:${GH_TOKEN}`).toString('base64')}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'node-script'
      }
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ in_reply_to: reply.in_reply_to, new_id: json.id, status: res.statusCode, error: json.message || null })
        } catch (e) {
          resolve({ in_reply_to: reply.in_reply_to, status: res.statusCode, error: 'parse error: ' + data.slice(0, 200) })
        }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

const results = []
for (const reply of replies) {
  const r = await postReply(reply)
  results.push(r)
  console.log(JSON.stringify(r))
}
console.log('All replies done. Success:', results.filter(r => r.status === 201).length, '/', results.length)
