import { InMemorySigner } from "@mavrykdynamics/taquito-signer"
import { TezosToolkit } from "@mavrykdynamics/taquito"
import { format } from "@mavrykdynamics/taquito-utils"

import env from "./env"

import { Response } from "express"

// Setup the TezosToolkit to interact with the chain.
export const Mavryk = (() => {
  const rpcUrl = env.RPC_URL
  if (!rpcUrl) {
    throw new Error("No RPC_URL defined.")
  }

  const MavToolkit = new TezosToolkit(rpcUrl)

  const faucetPrivateKey = env.FAUCET_PRIVATE_KEY
  if (!faucetPrivateKey) {
    throw new Error("No FAUCET_PRIVATE_KEY defined.")
  }

  // Create signer
  MavToolkit.setProvider({
    signer: new InMemorySigner(faucetPrivateKey),
  })

  return MavToolkit
})()

const sendMav = async (
  address: string,
  amount: number
): Promise<string | void> => {
  // Check max balance
  const userBalanceMumav = await Mavryk.tz.getBalance(address)
  const userBalance = Number(format("mumav", "mv", userBalanceMumav).valueOf())

  if (env.MAX_BALANCE !== null && userBalance + amount > env.MAX_BALANCE) {
    console.log(`${address} balance too high (${userBalance}). Not sending.`)
    return
  }

  /* Note: `transfer` doesn't work well when running on node v19+. The
    underlying Axios requests breaks with "ECONNRESET error socket hang up".
    This is likely because node v19 sets HTTP(S) `keepAlive` to true by default
    and the Mavryk node ends up killing the long-lived connection. It isn't easy
    to configure Axios in Taquito to work around this. */
  const operation = await Mavryk.contract.transfer({ to: address, amount })
  console.log(`Sent ${amount} xtz to ${address}\nHash: ${operation.hash}`)
  return operation.hash
}

export const sendMavAndRespond = async (
  res: Response,
  address: string,
  amount: number
) => {
  try {
    const txHash = await sendMav(address, amount)

    if (!txHash) {
      return res
        .status(403)
        .send({ status: "ERROR", message: "You have already enough ꜩ" })
    }

    return res
      .status(200)
      .send({ txHash, status: "SUCCESS", message: "Mav sent" })
  } catch (err: any) {
    console.error(`Error sending Mav to ${address}.`, err)

    const { message } = err

    if (
      message.includes("subtraction_underflow") ||
      message.includes("storage_exhausted") ||
      message.includes("empty_implicit_contract")
    ) {
      return res.status(500).send({
        status: "ERROR",
        message: "Faucet is low or has gone empty. Please contact the team.",
      })
    }

    throw err
  }
}
