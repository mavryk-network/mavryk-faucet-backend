export type RequestBody = {
  captchaToken: string
  address: string
}

export type ResponseBody = {
  status: string
  txHash?: string
  requestId?: string
  message?: string
}

export type InfoResponseBody = {
  faucetAddress: string
  captchaEnabled: boolean
  challengesEnabled: boolean
  maxBalance: number | null
  minMav: number
  maxMav: number
  minMvn: number
  maxMvn: number
  minUsdt: number
  maxUsdt: number
}

export type FaucetRequest = {
  id: string
  address: string
  amount: number
  token: string
  status: "pending" | "batched" | "confirmed" | "failed"
  retries: number
  tx_hash: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export type StatusResponseBody = {
  status: string
  requestId: string
  requestStatus: FaucetRequest["status"]
  txHash?: string
  errorMessage?: string
  position?: number
}
