import Database from "better-sqlite3"
import path from "path"
import fs from "fs"
import { FaucetRequest } from "./Types"

let db: Database.Database

export const initDatabase = (): void => {
  const dbPath = process.env.SQLITE_PATH || "./data/faucet.db"
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")

  db.exec(`
    CREATE TABLE IF NOT EXISTS faucet_requests (
      id            TEXT PRIMARY KEY,
      address       TEXT NOT NULL,
      amount        REAL NOT NULL,
      token         TEXT NOT NULL DEFAULT 'mvrk',
      status        TEXT NOT NULL DEFAULT 'pending',
      retries       INTEGER NOT NULL DEFAULT 0,
      tx_hash       TEXT,
      error_message TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_faucet_requests_status
      ON faucet_requests(status);
    CREATE INDEX IF NOT EXISTS idx_faucet_requests_address
      ON faucet_requests(address);
    CREATE INDEX IF NOT EXISTS idx_faucet_requests_created_at
      ON faucet_requests(created_at);
  `)

  console.log("Database initialized.")
}

export const closeDatabase = (): void => {
  if (db) {
    db.close()
    console.log("Database closed.")
  }
}

export const insertRequest = (
  id: string,
  address: string,
  amount: number,
  token: string
): void => {
  db.prepare(
    `INSERT INTO faucet_requests (id, address, amount, token)
     VALUES (?, ?, ?, ?)`
  ).run(id, address, amount, token)
}

export const getPendingRequests = (limit: number): FaucetRequest[] => {
  return db
    .prepare(
      `SELECT * FROM faucet_requests
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(limit) as FaucetRequest[]
}

export const markAsBatched = (ids: string[]): void => {
  const stmt = db.prepare(
    `UPDATE faucet_requests
     SET status = 'batched', updated_at = datetime('now')
     WHERE id = ?`
  )
  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) stmt.run(id)
  })
  tx(ids)
}

export const markAsConfirmed = (ids: string[], txHash: string): void => {
  const stmt = db.prepare(
    `UPDATE faucet_requests
     SET status = 'confirmed', tx_hash = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) stmt.run(txHash, id)
  })
  tx(ids)
}

export const markAsFailed = (ids: string[], errorMessage: string): void => {
  const stmt = db.prepare(
    `UPDATE faucet_requests
     SET status = 'failed', error_message = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) stmt.run(errorMessage, id)
  })
  tx(ids)
}

export const resetToPending = (ids: string[]): void => {
  const stmt = db.prepare(
    `UPDATE faucet_requests
     SET status = 'pending', retries = retries + 1, updated_at = datetime('now')
     WHERE id = ?`
  )
  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) stmt.run(id)
  })
  tx(ids)
}

export const getRequestById = (id: string): FaucetRequest | undefined => {
  return db
    .prepare(`SELECT * FROM faucet_requests WHERE id = ?`)
    .get(id) as FaucetRequest | undefined
}

export const getRecentRequestForToken = (
  address: string,
  token: string,
  windowHours: number
): FaucetRequest | undefined => {
  /** Check for any non-failed request (pending, batched, or confirmed). */
  return db
    .prepare(
      `SELECT * FROM faucet_requests
       WHERE address = ? AND token = ? AND status != 'failed'
       AND created_at > datetime('now', '-' || ? || ' hours')
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(address, token, windowHours) as FaucetRequest | undefined
}

/** Reset orphaned 'batched' requests back to 'pending' on startup. */
export const recoverOrphanedBatched = (): number => {
  const result = db
    .prepare(
      `UPDATE faucet_requests
       SET status = 'pending', updated_at = datetime('now')
       WHERE status = 'batched'`
    )
    .run()
  return result.changes
}

export const getPendingPosition = (id: string): number => {
  const request = getRequestById(id)
  if (!request || request.status !== "pending") return 0

  const result = db
    .prepare(
      `SELECT COUNT(*) as count FROM faucet_requests
       WHERE status = 'pending' AND created_at <= ?`
    )
    .get(request.created_at) as { count: number }

  return result.count
}
