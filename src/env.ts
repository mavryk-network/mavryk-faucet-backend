import "dotenv/config"

// This file is responsible for handling environment variables.
// It imports all environment variables from process.env and performs necessary type conversions.
// For some values, it's better to use the converted values from this file instead of process.env directly.
const {
  ENABLE_CAPTCHA,
  DISABLE_CHALLENGES,
  MAX_BALANCE,
  MAX_BALANCE_MVN,
  MAX_BALANCE_USDT,
  MIN_MAV,
  MAX_MAV,
  MIN_MVN,
  MAX_MVN,
  MIN_USDT,
  MAX_USDT,
  MIN_CHALLENGES,
  MAX_CHALLENGES,
  MAX_CHALLENGES_WITH_CAPTCHA,
  CHALLENGE_SIZE,
  DIFFICULTY,
  // Batch worker
  BATCH_INTERVAL_MS,
  MAX_BATCH_SIZE,
  MAX_RETRIES,
  // Cooldown
  ENABLE_COOLDOWN,
  COOLDOWN_HOURS,
  // Mainnet gate
  ENABLE_MAINNET_GATE,
  MAINNET_RPC_URL,
  MAINNET_MIN_BALANCE,
  MAINNET_CACHE_TTL_S,
  // FA2 token contracts
  MVN_CONTRACT_ADDRESS,
  USDT_CONTRACT_ADDRESS,
  // Telegram alerts
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  TELEGRAM_CHECK_INTERVAL_MS,
  TELEGRAM_WARNING_THRESHOLD,
  TELEGRAM_CRITICAL_THRESHOLD,
} = process.env

const env = {
  ...process.env,
  DISABLE_CHALLENGES: DISABLE_CHALLENGES === "true",
  ENABLE_CAPTCHA: ENABLE_CAPTCHA !== "false",
  MAX_BALANCE: MAX_BALANCE ? Number(MAX_BALANCE) : null,
  MAX_BALANCE_MVN: MAX_BALANCE_MVN ? Number(MAX_BALANCE_MVN) : null,
  MAX_BALANCE_USDT: MAX_BALANCE_USDT ? Number(MAX_BALANCE_USDT) : null,
  MIN_MAV: MIN_MAV ? Number(MIN_MAV) : 1,
  MAX_MAV: MAX_MAV ? Number(MAX_MAV) : 6000,
  MIN_MVN: MIN_MVN ? Number(MIN_MVN) : 1,
  MAX_MVN: MAX_MVN ? Number(MAX_MVN) : 400,
  MIN_USDT: MIN_USDT ? Number(MIN_USDT) : 1,
  MAX_USDT: MAX_USDT ? Number(MAX_USDT) : 1000,
  CHALLENGE_SIZE: CHALLENGE_SIZE ? Number(CHALLENGE_SIZE) : 2048,
  DIFFICULTY: DIFFICULTY ? Number(DIFFICULTY) : 4,
  MIN_CHALLENGES: MIN_CHALLENGES ? Number(MIN_CHALLENGES) : 1,
  MAX_CHALLENGES: MAX_CHALLENGES ? Number(MAX_CHALLENGES) : 550,
  MAX_CHALLENGES_WITH_CAPTCHA: MAX_CHALLENGES_WITH_CAPTCHA
    ? Number(MAX_CHALLENGES_WITH_CAPTCHA)
    : 66,
  // Batch worker
  BATCH_INTERVAL_MS: BATCH_INTERVAL_MS ? Number(BATCH_INTERVAL_MS) : 15000,
  MAX_BATCH_SIZE: MAX_BATCH_SIZE ? Number(MAX_BATCH_SIZE) : 50,
  MAX_RETRIES: MAX_RETRIES ? Number(MAX_RETRIES) : 3,
  // Cooldown
  ENABLE_COOLDOWN: ENABLE_COOLDOWN !== "false",
  COOLDOWN_HOURS: COOLDOWN_HOURS ? Number(COOLDOWN_HOURS) : 24,
  // Mainnet gate
  ENABLE_MAINNET_GATE: ENABLE_MAINNET_GATE === "true",
  MAINNET_RPC_URL: MAINNET_RPC_URL || "",
  MAINNET_MIN_BALANCE: MAINNET_MIN_BALANCE ? Number(MAINNET_MIN_BALANCE) : 10,
  MAINNET_CACHE_TTL_S: MAINNET_CACHE_TTL_S ? Number(MAINNET_CACHE_TTL_S) : 60,
  // FA2 token contracts
  MVN_CONTRACT_ADDRESS: MVN_CONTRACT_ADDRESS || "KT1EWqLYMjrimcJRFWSPkNGNLnpiKBZHWZ86",
  USDT_CONTRACT_ADDRESS: USDT_CONTRACT_ADDRESS || "KT1WTEKHD2fH24d7JNGbquSiLPktz796WBmA",
  // Telegram alerts
  TELEGRAM_BOT_TOKEN: TELEGRAM_BOT_TOKEN || "",
  TELEGRAM_CHAT_ID: TELEGRAM_CHAT_ID || "",
  TELEGRAM_CHECK_INTERVAL_MS: TELEGRAM_CHECK_INTERVAL_MS
    ? Number(TELEGRAM_CHECK_INTERVAL_MS)
    : 600000,
  TELEGRAM_WARNING_THRESHOLD: TELEGRAM_WARNING_THRESHOLD
    ? Number(TELEGRAM_WARNING_THRESHOLD)
    : 5000,
  TELEGRAM_CRITICAL_THRESHOLD: TELEGRAM_CRITICAL_THRESHOLD
    ? Number(TELEGRAM_CRITICAL_THRESHOLD)
    : 1000,
}

const vars: (keyof typeof env)[] = [
  "MAX_BALANCE",
  "MAX_MAV",
  "MIN_MAV",
  "CHALLENGE_SIZE",
  "DIFFICULTY",
  "MIN_CHALLENGES",
  "MAX_CHALLENGES",
  "MAX_CHALLENGES_WITH_CAPTCHA",
]

vars.forEach((v) => {
  const value: any = env[v]
  if (isNaN(value)) throw new Error(`Env var ${v} must be a number.`)

  if (
    [
      "CHALLENGE_SIZE",
      "DIFFICULTY",
      "MIN_CHALLENGES",
      "MAX_CHALLENGES",
      "MAX_CHALLENGES_WITH_CAPTCHA",
    ].includes(v)
  ) {
    if (value <= 0) {
      throw new Error(`Env var ${v} must be greater than 0.`)
    }
  }
})

if (
  env.MAX_CHALLENGES < env.MIN_CHALLENGES ||
  env.MAX_CHALLENGES_WITH_CAPTCHA < env.MIN_CHALLENGES
) {
  throw new Error(
    `Env vars MAX_CHALLENGES and MAX_CHALLENGES_WITH_CAPTCHA must be
  greater than or equal to MIN_CHALLENGES.`
  )
}

for (const [min, max, label] of [
  [env.MIN_MAV, env.MAX_MAV, "MAV"],
  [env.MIN_MVN, env.MAX_MVN, "MVN"],
  [env.MIN_USDT, env.MAX_USDT, "USDT"],
] as const) {
  if (max < min || min <= 0 || max <= 0) {
    throw new Error(
      `Env vars MAX_${label} and MIN_${label} must be greater than 0 and MAX_${label} must be >= MIN_${label}.`
    )
  }
}

export default env
