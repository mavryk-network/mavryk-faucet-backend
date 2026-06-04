import axios from "axios"
import env from "./env"
import { Mavryk, checkBalance } from "./Mavryk"

type AlertLevel = "normal" | "warning" | "critical"

let intervalId: ReturnType<typeof setInterval> | null = null
let lastAlertLevel: AlertLevel = "normal"

const sendTelegramMessage = async (text: string): Promise<void> => {
  try {
    await axios.post(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }
    )
  } catch (err: any) {
    console.error("Failed to send Telegram alert:", err.message || err)
  }
}

const checkBalanceAndAlert = async (): Promise<void> => {
  try {
    const faucetAddress = await Mavryk.signer.publicKeyHash()
    const balance = await checkBalance(faucetAddress)

    let currentLevel: AlertLevel = "normal"
    if (balance < env.TELEGRAM_CRITICAL_THRESHOLD) {
      currentLevel = "critical"
    } else if (balance < env.TELEGRAM_WARNING_THRESHOLD) {
      currentLevel = "warning"
    }

    // Only send alerts on level transitions
    if (currentLevel === lastAlertLevel) return

    const previousLevel = lastAlertLevel
    lastAlertLevel = currentLevel

    if (currentLevel === "warning") {
      await sendTelegramMessage(
        `<b>⚠️ Faucet Low Balance Warning</b>\n\n` +
          `Balance: <b>${balance.toLocaleString()} MVRK</b>\n` +
          `Warning threshold: ${env.TELEGRAM_WARNING_THRESHOLD.toLocaleString()} MVRK\n\n` +
          `Faucet address: <code>${faucetAddress}</code>\n` +
          `Please refill.`
      )
    } else if (currentLevel === "critical") {
      await sendTelegramMessage(
        `<b>🚨 Faucet CRITICAL Balance</b>\n\n` +
          `Balance: <b>${balance.toLocaleString()} MVRK</b>\n` +
          `Critical threshold: ${env.TELEGRAM_CRITICAL_THRESHOLD.toLocaleString()} MVRK\n\n` +
          `Faucet address: <code>${faucetAddress}</code>\n` +
          `<b>Immediate refill required!</b>`
      )
    } else if (
      currentLevel === "normal" &&
      (previousLevel === "warning" || previousLevel === "critical")
    ) {
      await sendTelegramMessage(
        `<b>✅ Faucet Balance Recovered</b>\n\n` +
          `Balance: <b>${balance.toLocaleString()} MVRK</b>\n\n` +
          `Faucet address: <code>${faucetAddress}</code>`
      )
    }
  } catch (err) {
    console.error("Telegram alert check error:", err)
  }
}

export const startTelegramAlerts = (): void => {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.log("Telegram alerts disabled (no bot token or chat ID).")
    return
  }

  console.log(
    `Telegram alerts started (interval: ${env.TELEGRAM_CHECK_INTERVAL_MS}ms, ` +
      `warning: ${env.TELEGRAM_WARNING_THRESHOLD}, critical: ${env.TELEGRAM_CRITICAL_THRESHOLD}).`
  )

  // Run an initial check
  checkBalanceAndAlert()
  intervalId = setInterval(checkBalanceAndAlert, env.TELEGRAM_CHECK_INTERVAL_MS)
}

export const stopTelegramAlerts = (): void => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log("Telegram alerts stopped.")
  }
}
