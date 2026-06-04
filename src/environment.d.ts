declare global {
  namespace NodeJS {
    interface ProcessEnv {
      API_PORT: string
      FAUCET_CONTRACT_ADDRESS: string
      AUTHORIZED_HOST: string
      CAPTCHA_SECRET: string
      ENABLE_CAPTCHA: string
      DISABLE_CHALLENGES: string
      FAUCET_PRIVATE_KEY: string
      MAX_BALANCE: string
      REDIS_PASSWORD: string
      REDIS_URL: string
      RPC_URL: string
      MIN_MAV: string
      MAX_MAV: string
      MIN_CHALLENGES: string
      MAX_CHALLENGES: string
      MAX_CHALLENGES_WITH_CAPTCHA: string
      CHALLENGE_SIZE: string
      DIFFICULTY: string
      // Batch worker
      SQLITE_PATH: string
      BATCH_INTERVAL_MS: string
      MAX_BATCH_SIZE: string
      MAX_RETRIES: string
      // Cooldown
      ENABLE_COOLDOWN: string
      COOLDOWN_HOURS: string
      // Mainnet gate
      ENABLE_MAINNET_GATE: string
      MAINNET_RPC_URL: string
      MAINNET_MIN_BALANCE: string
      MAINNET_CACHE_TTL_S: string
      // Telegram alerts
      TELEGRAM_BOT_TOKEN: string
      TELEGRAM_CHAT_ID: string
      TELEGRAM_CHECK_INTERVAL_MS: string
      TELEGRAM_WARNING_THRESHOLD: string
      TELEGRAM_CRITICAL_THRESHOLD: string
    }
  }
}

export {}
