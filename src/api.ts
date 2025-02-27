import env from "./env"

import bodyParser from "body-parser"
import express, { Express, Request, Response } from "express"

import redis from "./redis"
import { cors, challengeMiddleware, verifyMiddleware } from "./middleware"
import { httpLogger } from "./logging"
import { Mavryk, sendMavAndRespond } from "./Mavryk"
import { validateCaptcha } from "./Captcha"
import * as pow from "./pow"
import { InfoResponseBody } from "./Types"

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

    if (env.DISABLE_CHALLENGES) {
      await sendMavAndRespond(res, address, token)
      return
    }

    const challengeKey = pow.getChallengeKey(address)
    const redisChallenge = await pow.getChallenge(challengeKey)
    if (!redisChallenge) {
      return res
        .status(400)
        .send({ status: "ERROR", message: "No challenge found" })
    }

    const {
      amount,
      challenge,
      challengesNeeded,
      challengeCounter,
      difficulty,
      usedCaptcha,
    } = redisChallenge

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

    // The challenge should be deleted from redis before Mav is sent. If it
    // failed to delete or was already deleted by another request, the user
    // could keep getting Mav with the same solution.
    const deletedCount = await redis.del(challengeKey).catch((err: any) => {
      console.error(`Redis failed to delete ${challengeKey}.`)
      throw err
    })

    if (deletedCount === 0) {
      // Challenge was already used/deleted, so do not send Mav
      return res
        .status(403)
        .send({ status: "ERROR", message: "PoW challenge not found" })
    }

    await sendMavAndRespond(res, address, token)
    return
  } catch (err: any) {
    console.error(err)
    return res
      .status(500)
      .send({ status: "ERROR", message: "An error occurred" })
  }
})

// Connect to redis, start server, and setup listeners for graceful shutdown.
;(async () => {
  if (!env.DISABLE_CHALLENGES) {
    await redis.connect()
  } else {
    console.log("Challenges are disabled. Not connecting to redis.")
  }

  const port = process.env.API_PORT || 3000
  const server = app.listen(port, () =>
    console.log(`Listening on port ${port}.`)
  )

  const gracefulShutdown = async (signal: string) => {
    console.log(`${signal} signal received`)

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
