import { validateKeyHash } from "@taquito/utils"
import { Request, Response, NextFunction } from "express"

import env from "./env"

export const cors = (_: Request, res: Response, next: NextFunction) => {
  const host = process.env.AUTHORIZED_HOST || "*"
  res
    .setHeader("Access-Control-Allow-Origin", host)
    .setHeader("Access-Control-Allow-Methods", "GET, POST")
    .setHeader(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    )
  next()
}

const checkChallengesEnabled = (
  _: Request,
  res: Response,
  next: NextFunction
) => {
  if (env.DISABLE_CHALLENGES) {
    return res.status(200).send({
      status: "SUCCESS",
      message: "Challenges are disabled. Use the /verify endpoint.",
    })
  }
  next()
}

const validateAddress = (req: Request, res: Response, next: NextFunction) => {
  const { address } = req.body

  if (!address) {
    return res.status(400).send({
      status: "ERROR",
      message: "'address' field is required",
    })
  }

  if (validateKeyHash(address) !== 3) {
    return res.status(400).send({
      status: "ERROR",
      message: `The address '${address}' is invalid`,
    })
  }

  next()
}

const validateAmount = (req: Request, res: Response, next: NextFunction) => {
  const amount = Number(req.body.amount)

  if (!amount) {
    return res.status(400).send({
      status: "ERROR",
      message: "'amount' field is required",
    })
  }

  if (amount < env.MIN_TEZ || amount > env.MAX_TEZ) {
    return res.status(400).send({
      status: "ERROR",
      message: `The amount '${amount}' is not within the allowed range`,
    })
  }

  req.body.amount = amount
  next()
}

const validateChallengeBody = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { solution, nonce } = req.body

  if (!env.DISABLE_CHALLENGES && (!solution || !nonce)) {
    return res.status(400).send({
      status: "ERROR",
      message: "'solution', and 'nonce', fields are required",
    })
  }

  next()
}

export const challengeMiddleware = [
  checkChallengesEnabled,
  validateAddress,
  validateAmount,
]

export const verifyMiddleware = [validateAddress, validateChallengeBody]
env.DISABLE_CHALLENGES && verifyMiddleware.push(validateAmount)