import { MavrykToolkit } from "@mavrykdynamics/webmavryk"
import { format } from "@mavrykdynamics/webmavryk-utils"
import env from "./env"

type CacheEntry = { balance: number; timestamp: number }
const balanceCache = new Map<string, CacheEntry>()

let mainnetToolkit: MavrykToolkit | null = null

const getMainnetToolkit = (): MavrykToolkit | null => {
  if (!env.ENABLE_MAINNET_GATE || !env.MAINNET_RPC_URL) return null
  if (!mainnetToolkit) {
    mainnetToolkit = new MavrykToolkit(env.MAINNET_RPC_URL)
  }
  return mainnetToolkit
}

export const checkMainnetBalance = async (
  address: string
): Promise<{ eligible: boolean; balance: number }> => {
  if (!env.ENABLE_MAINNET_GATE || !env.MAINNET_RPC_URL) {
    return { eligible: true, balance: 0 }
  }

  // Check cache
  const cached = balanceCache.get(address)
  const now = Date.now()
  if (cached && now - cached.timestamp < env.MAINNET_CACHE_TTL_S * 1000) {
    return {
      eligible: cached.balance >= env.MAINNET_MIN_BALANCE,
      balance: cached.balance,
    }
  }

  const toolkit = getMainnetToolkit()
  if (!toolkit) return { eligible: true, balance: 0 }

  const balanceMumav = await toolkit.mv.getBalance(address)
  const balance = Number(format("mumav", "mv", balanceMumav).valueOf())

  balanceCache.set(address, { balance, timestamp: now })

  return {
    eligible: balance >= env.MAINNET_MIN_BALANCE,
    balance,
  }
}
