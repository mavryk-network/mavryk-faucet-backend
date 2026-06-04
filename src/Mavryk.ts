import { InMemorySigner } from "@mavrykdynamics/webmavryk-signer"
import { MavrykToolkit } from "@mavrykdynamics/webmavryk"
import { format } from "@mavrykdynamics/webmavryk-utils"

import env from "./env"

// Setup the MavrykToolkit to interact with the chain.
export const Mavryk = (() => {
  const rpcUrl = env.RPC_URL
  if (!rpcUrl) {
    throw new Error("No RPC_URL defined.")
  }

  const MavToolkit = new MavrykToolkit(rpcUrl)

  const faucetPrivateKey = env.FAUCET_PRIVATE_KEY
  if (!faucetPrivateKey) {
    throw new Error("No FAUCET_PRIVATE_KEY defined.")
  }

  MavToolkit.setProvider({
    signer: new InMemorySigner(faucetPrivateKey),
  })

  return MavToolkit
})()

/** Returns the balance in MVRK (not mumav). */
export const checkBalance = async (address: string): Promise<number> => {
  const balanceMumav = await Mavryk.mv.getBalance(address)
  return Number(format("mumav", "mv", balanceMumav).valueOf())
}
