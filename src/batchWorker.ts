import env from "./env"
import { Mavryk, checkBalance } from "./Mavryk"
import {
  getPendingRequests,
  markAsBatched,
  markAsConfirmed,
  markAsFailed,
  resetToPending,
} from "./database"
import { FaucetRequest } from "./Types"

let intervalId: ReturnType<typeof setInterval> | null = null
let isProcessing = false

const processBatch = async (): Promise<void> => {
  if (isProcessing) return
  isProcessing = true

  try {
    const pending = getPendingRequests(env.MAX_BATCH_SIZE)
    if (pending.length === 0) return

    const ids = pending.map((r) => r.id)
    markAsBatched(ids)

    // Check balances and filter out recipients over MAX_BALANCE
    const valid: FaucetRequest[] = []
    const overBalance: string[] = []

    for (const req of pending) {
      if (env.MAX_BALANCE !== null) {
        try {
          const balance = await checkBalance(req.address)
          if (balance + req.amount > env.MAX_BALANCE) {
            overBalance.push(req.id)
            continue
          }
        } catch (err) {
          console.error(
            `Error checking balance for ${req.address}:`,
            err
          )
          // On balance check failure, still include in batch — the chain
          // will reject if there's an actual issue.
        }
      }
      valid.push(req)
    }

    if (overBalance.length > 0) {
      markAsFailed(overBalance, "Recipient balance exceeds maximum allowed")
    }

    if (valid.length === 0) return

    const validIds = valid.map((r) => r.id)

    // Build and send the batch
    const batch = Mavryk.contract.batch()
    for (const req of valid) {
      batch.withTransfer({ to: req.address, amount: req.amount })
    }

    let opHash: string | undefined

    try {
      const op = await batch.send()
      opHash = op.hash
      console.log(
        `Batch sent: ${op.hash} (${valid.length} transfers). Waiting for confirmation...`
      )
      await op.confirmation()
      console.log(`Batch confirmed: ${op.hash}`)

      markAsConfirmed(validIds, op.hash)
    } catch (err: any) {
      console.error("Batch failed:", err.message || err)

      if (opHash) {
        // Injection succeeded but confirmation failed — the operation may
        // have landed on-chain. Mark as confirmed optimistically with the
        // hash. The next cycle will not re-process these since they are
        // no longer pending.
        console.log(
          `Operation ${opHash} was injected but confirmation failed. Marking as confirmed.`
        )
        markAsConfirmed(validIds, opHash)
      } else {
        // Injection failed — safe to retry
        handleRetry(valid)
      }
    }
  } catch (err) {
    console.error("Batch worker error:", err)
  } finally {
    isProcessing = false
  }
}

const handleRetry = (requests: FaucetRequest[]): void => {
  const toRetry: string[] = []
  const toFail: string[] = []

  for (const req of requests) {
    if (req.retries + 1 >= env.MAX_RETRIES) {
      toFail.push(req.id)
    } else {
      toRetry.push(req.id)
    }
  }

  if (toRetry.length > 0) {
    resetToPending(toRetry)
    console.log(`${toRetry.length} request(s) reset to pending for retry.`)
  }

  if (toFail.length > 0) {
    markAsFailed(toFail, "Max retries exceeded")
    console.log(
      `${toFail.length} request(s) permanently failed after ${env.MAX_RETRIES} retries.`
    )
  }
}

export const startBatchWorker = (): void => {
  console.log(
    `Batch worker started (interval: ${env.BATCH_INTERVAL_MS}ms, max batch: ${env.MAX_BATCH_SIZE}).`
  )
  intervalId = setInterval(processBatch, env.BATCH_INTERVAL_MS)
}

export const stopBatchWorker = (): void => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log("Batch worker stopped.")
  }
}
