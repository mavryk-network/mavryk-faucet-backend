import { createHash, randomBytes } from "crypto"

import redis from "./redis"
import env from "./env"

export const getChallengeKey = (address: string): string => `address:${address}`

const determineDifficulty = () => {
  const challengeSize = env.CHALLENGE_SIZE
  const difficulty = env.DIFFICULTY
  return { challengeSize, difficulty }
}

const determineChallengesNeeded = (amount: number, usedCaptcha: boolean) => {
  const {
    MIN_MAV,
    MAX_MAV,
    MIN_CHALLENGES,
    MAX_CHALLENGES,
    MAX_CHALLENGES_WITH_CAPTCHA,
  } = env

  // Calculate the base number of challenges based on the Mav proportion and whether a captcha was used
  const maxChallenges = usedCaptcha
    ? MAX_CHALLENGES_WITH_CAPTCHA
    : MAX_CHALLENGES

  if (MIN_MAV === MAX_MAV) return maxChallenges

  // Calculate the proportion of the requested Mav to the maximum Mav
  const mavProportion = (amount - MIN_MAV) / (MAX_MAV - MIN_MAV)
  const challengesNeeded = Math.ceil(
    mavProportion * (maxChallenges - MIN_CHALLENGES) + MIN_CHALLENGES
  )

  return challengesNeeded
}

const generateChallenge = (bytesSize: number = 32) =>
  randomBytes(bytesSize).toString("hex")

export const createChallenge = (amount: number, usedCaptcha: boolean) => {
  const challengesNeeded = determineChallengesNeeded(amount, usedCaptcha)
  const { challengeSize, difficulty } = determineDifficulty()
  const challenge = generateChallenge(challengeSize)
  return { challenge, challengesNeeded, difficulty }
}

interface ChallengeState {
  amount: number
  challenge: string
  challengeCounter: number
  challengesNeeded: number
  difficulty: number
  usedCaptcha: boolean
}

type SaveChallengeArgs = Omit<ChallengeState, "usedCaptcha"> & {
  usedCaptcha?: boolean
  expiration?: number
}

const validateChallengeArgs = (challenge: SaveChallengeArgs) => {
  const keys: (keyof SaveChallengeArgs)[] = [
    "amount",
    "challenge",
    "challengeCounter",
    "challengesNeeded",
    "difficulty",
  ]

  for (const key of keys) {
    if (!challenge[key]) {
      throw new Error(`Challenge state is missing "${key}"`)
    }
  }
}

export const saveChallenge = async (
  challengeKey: string,
  {
    usedCaptcha,
    expiration = 1800, // 30m
    ...args
  }: SaveChallengeArgs
) => {
  validateChallengeArgs(args)

  await redis.hSet(challengeKey, {
    ...args,
    ...(typeof usedCaptcha === "boolean" && {
      usedCaptcha: String(usedCaptcha),
    }),
  })
  await redis.expire(challengeKey, expiration)
}

export const getChallenge = async (
  challengeKey: string
): Promise<ChallengeState | null> => {
  const data = await redis.hGetAll(challengeKey)

  if (!Object.keys(data).length) return null

  return {
    amount: Number(data.amount),
    challenge: data.challenge,
    challengeCounter: Number(data.challengeCounter),
    challengesNeeded: Number(data.challengesNeeded),
    difficulty: Number(data.difficulty),
    usedCaptcha: data.usedCaptcha === "true",
  } satisfies ChallengeState as ChallengeState
}

const getSolution = (challenge: string, nonce: number | string) =>
  createHash("sha256").update(`${challenge}:${nonce}`).digest("hex")

interface VerifySolutionArgs {
  challenge: string
  difficulty: number
  nonce: number | string
  solution: string
}
export const verifySolution = ({
  challenge,
  difficulty,
  nonce,
  solution,
}: VerifySolutionArgs) => {
  const hash = getSolution(challenge, nonce)
  // Validate the SHA-256 hash of the challenge concatenated with the nonce
  // starts with a certain number of zeroes (the difficulty).
  return hash === solution && hash.startsWith("0".repeat(difficulty))
}
