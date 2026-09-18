'use strict'
const crypto = require('node:crypto')
function createSessionStore(models) {
  const query = async (sql, params) =>
    (await models.$runSQL(sql, params))?.data?.executeResultList || []
  return {
    async insert(row) {
      await query(
        `INSERT INTO agent_web_sessions
        (ticket_hash, user_id, parent_token_hash, ticket_expires_at, expires_at)
        VALUES ({{ticketHash}}, {{userId}}, {{parentHash}}, {{ticketExpiresAt}}, {{expiresAt}})`,
        row
      )
    },
    async consume(ticketHash, sessionHash, now) {
      await query(
        `UPDATE agent_web_sessions SET session_hash = {{sessionHash}}
        WHERE ticket_hash = {{ticketHash}} AND session_hash <=> NULL AND ticket_expires_at > {{now}}`,
        { ticketHash, sessionHash, now }
      )
      const rows = await query(
        'SELECT session_hash FROM agent_web_sessions WHERE ticket_hash = {{ticketHash}}',
        { ticketHash }
      )
      return rows[0]?.session_hash === sessionHash
    },
    async find(sessionHash) {
      const rows = await query(
        `SELECT ticket_hash, user_id, parent_token_hash, expires_at, agent_session_id
        FROM agent_web_sessions WHERE session_hash = {{sessionHash}} LIMIT 1`,
        { sessionHash }
      )
      const row = rows[0]
      return row
        ? {
            ticketHash: row.ticket_hash,
            userId: row.user_id,
            parentHash: row.parent_token_hash,
            expiresAt: Number(row.expires_at),
            agentSessionId: row.agent_session_id || ''
          }
        : null
    },
    async resolveIdentity(row) {
      const rows = await query(
        `SELECT s.user_id, s.platform, s.app_id, u._openid AS storage_openid
         FROM user_sessions s
         LEFT JOIN users u ON BINARY u._id = BINARY s.user_id
        WHERE s.token_hash = {{parentHash}} AND s.user_id = {{userId}}
          AND s.expires_at > {{now}} AND s.revoked_at <=> NULL
        LIMIT 1`,
        { parentHash: row?.parentHash || '', userId: row?.userId || '', now: Date.now() }
      )
      const identity = rows[0]
      if (!identity) {
        return null
      }
      return {
        userId: String(identity.user_id || '').trim(),
        openid: String(identity.storage_openid || identity.user_id || '').trim(),
        platform: String(identity.platform || '').trim(),
        appId: String(identity.app_id || '').trim()
      }
    },
    async parentActive(row, now) {
      const rows = await query(
        `SELECT s.user_id FROM user_sessions s JOIN users u ON BINARY u._id = BINARY s.user_id
        WHERE s.token_hash = {{parentHash}} AND s.user_id = {{userId}} AND s.expires_at > {{now}}
        AND s.revoked_at <=> NULL AND u.isActive = 1 LIMIT 1`,
        { ...row, now }
      )
      return rows.length === 1
    },
    async lock(row) {
      const lock = crypto.randomBytes(16).toString('hex'),
        now = Date.now()
      await query(
        `UPDATE agent_web_sessions SET request_lock = {{lock}}, busy_until = {{until}}
        WHERE ticket_hash = {{ticketHash}} AND busy_until < {{now}}`,
        { ticketHash: row.ticketHash, lock, now, until: now + 90000 }
      )
      const rows = await query(
        'SELECT request_lock FROM agent_web_sessions WHERE ticket_hash = {{ticketHash}}',
        row
      )
      return rows[0]?.request_lock === lock ? lock : ''
    },
    async finish(row, lock, agentSessionId) {
      await query(
        `UPDATE agent_web_sessions SET request_lock = NULL, busy_until = 0, agent_session_id = {{agentSessionId}}
        WHERE ticket_hash = {{ticketHash}} AND request_lock = {{lock}}`,
        { ticketHash: row.ticketHash, lock, agentSessionId: agentSessionId || null }
      )
    }
  }
}
module.exports = { createSessionStore }
