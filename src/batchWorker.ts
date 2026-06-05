import env from "./env"
import {
  Mavryk,
  checkBalance,
  getFaucetAddress,
  getFA2Contract,
  FA2_TOKEN_IDS,
  toRawAmount,
} from "./Mavryk"
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

    // Check MVRK balances and filter out recipients over MAX_BALANCE (only applies to native MVRK transfers)
    const valid: FaucetRequest[] = []
    const overBalance: string[] = []

    for (const req of pending) {
      if (req.token === "mvrk" && env.MAX_BALANCE !== null) {
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
        }
      }
      valid.push(req)
    }

    if (overBalance.length > 0) {
      markAsFailed(overBalance, "Recipient balance exceeds maximum allowed")
    }

    if (valid.length === 0) return

    const validIds = valid.map((r) => r.id)
    const faucetAddress = await getFaucetAddress()

    // Build the batch with mixed transfer types
    const batch = Mavryk.contract.batch()

    for (const req of valid) {
      if (req.token === "mvrk") {
        // Native MVRK transfer
        batch.withTransfer({ to: req.address, amount: req.amount })
      } else {
        // FA2 token transfer (mvn or usdt)
        const contract = await getFA2Contract(req.token)
        if (!contract) {
          markAsFailed([req.id], `Unknown token type: ${req.token}`)
          continue
        }

        const tokenId = FA2_TOKEN_IDS[req.token] ?? 0
        const rawAmount = toRawAmount(req.token, req.amount)
        batch.withContractCall(
          contract.methods.transfer([
            {
              from_: faucetAddress,
              txs: [
                {
                  to_: req.address,
                  token_id: tokenId,
                  amount: rawAmount,
                },
              ],
            },
          ])
        )
      }
    }

    let opHash: string | undefined

    try {
      const op = await batch.send()
      opHash = op.hash
      const tokenSummary = summarizeTokens(valid)
      console.log(
        `Batch sent: ${op.hash} (${tokenSummary}). Waiting for confirmation...`
      )
      await op.confirmation()
      console.log(`Batch confirmed: ${op.hash}`)

      markAsConfirmed(validIds, op.hash)
    } catch (err: any) {
      console.error("Batch failed:", err.message || err)

      if (opHash) {
        console.log(
          `Operation ${opHash} was injected but confirmation failed. Marking as confirmed.`
        )
        markAsConfirmed(validIds, opHash)
      } else {
        handleRetry(valid)
      }
    }
  } catch (err) {
    console.error("Batch worker error:", err)
  } finally {
    isProcessing = false
  }
}

const summarizeTokens = (requests: FaucetRequest[]): string => {
  const counts: Record<string, number> = {}
  for (const req of requests) {
    counts[req.token] = (counts[req.token] || 0) + 1
  }
  return Object.entries(counts)
    .map(([token, count]) => `${count} ${token.toUpperCase()}`)
    .join(", ")
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
