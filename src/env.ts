import "dotenv/config"

// This file is responsible for handling environment variables.
// It imports all environment variables from process.env and performs necessary type conversions.
// For some values, it's better to use the converted values from this file instead of process.env directly.
const {
  ENABLE_CAPTCHA,
  DISABLE_CHALLENGES,
  MAX_BALANCE,
  MIN_MAV,
  MAX_MAV,
  MIN_CHALLENGES,
  MAX_CHALLENGES,
  MAX_CHALLENGES_WITH_CAPTCHA,
  CHALLENGE_SIZE,
  DIFFICULTY,
} = process.env

const env = {
  ...process.env,
  DISABLE_CHALLENGES: DISABLE_CHALLENGES === "true",
  ENABLE_CAPTCHA: ENABLE_CAPTCHA !== "false",
  MAX_BALANCE: MAX_BALANCE ? Number(MAX_BALANCE) : null,
  MIN_MAV: MIN_MAV ? Number(MIN_MAV) : 1,
  MAX_MAV: MAX_MAV ? Number(MAX_MAV) : 6000,
  CHALLENGE_SIZE: CHALLENGE_SIZE ? Number(CHALLENGE_SIZE) : 2048,
  DIFFICULTY: DIFFICULTY ? Number(DIFFICULTY) : 4,
  MIN_CHALLENGES: MIN_CHALLENGES ? Number(MIN_CHALLENGES) : 1,
  MAX_CHALLENGES: MAX_CHALLENGES ? Number(MAX_CHALLENGES) : 550,
  MAX_CHALLENGES_WITH_CAPTCHA: MAX_CHALLENGES_WITH_CAPTCHA
    ? Number(MAX_CHALLENGES_WITH_CAPTCHA)
    : 66,
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

if (env.MAX_MAV < env.MIN_MAV || env.MIN_MAV <= 0 || env.MAX_MAV <= 0) {
  throw new Error(
    "Env vars MAX_MAV and MIN_MAV must be greater than 0 and MAX_MAV must be greater than or equal to MIN_MAV."
  )
}

export default env
