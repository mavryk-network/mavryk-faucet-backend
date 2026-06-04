import env from "./env"
import { v4 as uuidv4 } from "uuid"

import bodyParser from "body-parser"
import express, { Express, Request, Response } from "express"

import redis from "./redis"
import { cors, challengeMiddleware, verifyMiddleware } from "./middleware"
import { httpLogger } from "./logging"
import { Mavryk } from "./Mavryk"
import { validateCaptcha } from "./Captcha"
import * as pow from "./pow"
import {
  initDatabase,
  closeDatabase,
  insertRequest,
  getRequestById,
  getRecentSuccessfulRequest,
  getPendingPosition,
} from "./database"
import { startBatchWorker, stopBatchWorker } from "./batchWorker"
import { startTelegramAlerts, stopTelegramAlerts } from "./telegramAlerts"
import { InfoResponseBody, StatusResponseBody } from "./Types"
import { checkMainnetBalance } from "./mainnetGate"

const app: Express = express()
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(httpLogger)
app.use(cors)

app.get("/info", async (_, res: Response) => {
  try {
    const info: InfoResponseBody = {
      faucetAddress: await Mavryk.signer.publicKeyHash(),
      captchaEnabled: env.ENABLE_CAPTCHA,
      challengesEnabled: !env.DISABLE_CHALLENGES,
      maxBalance: env.MAX_BALANCE,
      minMav: env.MIN_MAV,
      maxMav: env.MAX_MAV,
    }
    return res.status(200).send(info)
  } catch (error) {
    console.error(error)
    return res
      .status(500)
      .send({ status: "ERROR", message: "An exception occurred" })
  }
})

app.post(
  "/challenge",
  challengeMiddleware,
  async (req: Request, res: Response) => {
    const { address, amount, captchaToken } = req.body

    if (captchaToken && !(await validateCaptcha(res, captchaToken))) return

    try {
      const challengeKey = pow.getChallengeKey(address)
      let {
        amount: currentAmount,
        challenge,
        challengesNeeded,
        challengeCounter,
        difficulty,
      } = (await pow.getChallenge(challengeKey)) || {}

      // Create a new challenge if none exists or if the amount has changed.
      if (!challenge || currentAmount !== amount) {
        // If a captcha was sent it was validated above.
        const usedCaptcha = env.ENABLE_CAPTCHA && !!captchaToken

        ;({ challenge, challengesNeeded, difficulty } = pow.createChallenge(
          amount,
          usedCaptcha
        ))

        challengeCounter = challengeCounter || 1

        await pow.saveChallenge(challengeKey, {
          amount,
          challenge,
          challengesNeeded,
          challengeCounter,
          difficulty,
          usedCaptcha,
        })
      }

      return res.status(200).send({
        status: "SUCCESS",
        challenge,
        challengeCounter,
        challengesNeeded,
        difficulty,
      })
    } catch (err: any) {
      const message = "Error getting challenge"
      console.error(message, err)
      return res.status(500).send({ status: "ERROR", message })
    }
  }
)

app.post("/verify", verifyMiddleware, async (req: Request, res: Response) => {
  try {
    const { address, solution, nonce, token } = req.body
    let amount: number

    if (env.DISABLE_CHALLENGES) {
      // When challenges are disabled, amount comes from the request body
      amount = Number(req.body.amount) || env.MIN_MAV
    } else {
      const challengeKey = pow.getChallengeKey(address)
      const redisChallenge = await pow.getChallenge(challengeKey)
      if (!redisChallenge) {
        return res
          .status(400)
          .send({ status: "ERROR", message: "No challenge found" })
      }

      const {
        challenge,
        challengesNeeded,
        challengeCounter,
        difficulty,
        usedCaptcha,
      } = redisChallenge
      amount = redisChallenge.amount

      const isValidSolution = pow.verifySolution({
        challenge,
        difficulty,
        nonce,
        solution,
      })

      if (!isValidSolution) {
        return res
          .status(400)
          .send({ status: "ERROR", message: "Incorrect solution" })
      }

      if (challengeCounter < challengesNeeded) {
        const newChallenge = pow.createChallenge(amount, usedCaptcha)
        const resData = {
          challenge: newChallenge.challenge,
          challengeCounter: challengeCounter + 1,
          challengesNeeded,
          difficulty: newChallenge.difficulty,
        }

        await pow.saveChallenge(challengeKey, {
          amount,
          ...resData,
        })
        return res.status(200).send({ status: "SUCCESS", ...resData })
      }

      // Delete challenge from Redis before enqueuing to prevent replay.
      const deletedCount = await redis.del(challengeKey).catch((err: any) => {
        console.error(`Redis failed to delete ${challengeKey}.`)
        throw err
      })

      if (deletedCount === 0) {
        return res
          .status(403)
          .send({ status: "ERROR", message: "PoW challenge not found" })
      }
    }

    // Mainnet balance gate (runs here to cover both challenge and no-challenge paths)
    if (env.ENABLE_MAINNET_GATE) {
      try {
        const { eligible, balance } = await checkMainnetBalance(address)
        if (!eligible) {
          return res.status(403).send({
            status: "ERROR",
            message: `Your mainnet MVRK balance (${balance}) is below the required minimum of ${env.MAINNET_MIN_BALANCE} MVRK.`,
          })
        }
      } catch (err: any) {
        console.error("Mainnet balance gate error:", err.message || err)
      }
    }

    // 24-hour cooldown check
    if (env.ENABLE_COOLDOWN) {
      const recent = getRecentSuccessfulRequest(address, env.COOLDOWN_HOURS)
      if (recent) {
        const requestTime = new Date(recent.created_at + "Z").getTime()
        const cooldownEnd =
          requestTime + env.COOLDOWN_HOURS * 3600 * 1000
        const remainingMs = cooldownEnd - Date.now()
        const remainingHours = Math.max(1, Math.ceil(remainingMs / 3600000))
        return res.status(429).send({
          status: "ERROR",
          message: `Address has already received tokens. Please wait ${remainingHours} hour(s).`,
        })
      }
    }

    // Enqueue the request for batch processing
    const requestId = uuidv4()
    insertRequest(requestId, address, amount, token || "mvrk")
    console.log(`Request ${requestId} enqueued for ${address} (${amount} ${token || "mvrk"})`)

    return res.status(202).send({
      status: "ACCEPTED",
      requestId,
    })
  } catch (err: any) {
    console.error(err)
    return res
      .status(500)
      .send({ status: "ERROR", message: "An error occurred" })
  }
})

app.get("/status/:requestId", async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params
    const request = getRequestById(requestId)

    if (!request) {
      return res
        .status(404)
        .send({ status: "ERROR", message: "Request not found" })
    }

    const response: StatusResponseBody = {
      status: "SUCCESS",
      requestId: request.id,
      requestStatus: request.status,
    }

    if (request.status === "confirmed" && request.tx_hash) {
      response.txHash = request.tx_hash
    }

    if (request.status === "failed" && request.error_message) {
      response.errorMessage = request.error_message
    }

    if (request.status === "pending") {
      response.position = getPendingPosition(request.id)
    }

    return res.status(200).send(response)
  } catch (error) {
    console.error(error)
    return res
      .status(500)
      .send({ status: "ERROR", message: "An error occurred" })
  }
})

// Initialize services and start server.
;(async () => {
  initDatabase()

  if (!env.DISABLE_CHALLENGES) {
    await redis.connect()
  } else {
    console.log("Challenges are disabled. Not connecting to redis.")
  }

  startBatchWorker()
  startTelegramAlerts()

  const port = process.env.API_PORT || 3000
  const server = app.listen(port, () =>
    console.log(`Listening on port ${port}.`)
  )

  const gracefulShutdown = async (signal: string) => {
    console.log(`${signal} signal received`)

    stopBatchWorker()
    stopTelegramAlerts()
    closeDatabase()

    if (!env.DISABLE_CHALLENGES) {
      try {
        await redis.quit()
        console.log("Redis connection closed.")
      } catch (err) {
        console.error("Error closing Redis connection:", err)
      }
    }

    server.close(() => {
      console.log("HTTP server closed.")
      process.exit(0)
    })
  }

  process.on("SIGINT", () => gracefulShutdown("SIGINT"))
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
})()
