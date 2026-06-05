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

/** Get the faucet's own address. */
export const getFaucetAddress = async (): Promise<string> => {
  return Mavryk.signer.publicKeyHash()
}

/** FA2 token contract addresses. */
export const FA2_CONTRACTS: Record<string, string> = {
  mvn: env.MVN_CONTRACT_ADDRESS,
  usdt: env.USDT_CONTRACT_ADDRESS,
}

/** Token IDs on the FA2 contracts (both use token_id 0). */
export const FA2_TOKEN_IDS: Record<string, number> = {
  mvn: 0,
  usdt: 0,
}

/** Decimals for each token. */
export const FA2_DECIMALS: Record<string, number> = {
  mvn: 9,
  usdt: 6,
}

/** Convert a human-readable FA2 amount to the raw on-chain amount. */
export const toRawAmount = (token: string, amount: number): number => {
  const decimals = FA2_DECIMALS[token]
  if (decimals === undefined) return amount
  return Math.floor(amount * 10 ** decimals)
}

/** Cache for FA2 contract instances to avoid re-fetching on each batch cycle. */
const contractCache = new Map<string, any>()

export const getFA2Contract = async (token: string) => {
  const address = FA2_CONTRACTS[token]
  if (!address) return null

  if (contractCache.has(address)) {
    return contractCache.get(address)
  }

  const contract = await Mavryk.contract.at(address)
  contractCache.set(address, contract)
  return contract
}
