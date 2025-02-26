import { InMemorySigner } from "@mavrykdynamics/taquito-signer"
import { TezosToolkit } from "@mavrykdynamics/taquito"
import env from "./env"
import { Response } from "express"

const mvnTokenAddress = 'KT1WdbBw5DXF9fXN378v8VgrPqTsCKu2BPgD';
const mvnTokenId = '0';
const usdtTokenAddress = 'KT1StUZzJ34MhSNjkQMSyvZVrR9ppkHMFdFf';
const usdtTokenId = '0';
const mvrkTokenAddress = 'mv2ZZZZZZZZZZZZZZZZZZZZZZZZZZZDXMF2d';
const mvrkTokenId = '0';

export enum Tokens {
  mvn = 'mvn',
  usdt = 'usdt',
  mvrk = 'mvrk',
}
const toMvn = (amount: number) => amount * 10**9;
const toUsdt = (amount: number) => amount * 10**6;
const toMvrk = (amount: number) => amount * 10**6;

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

const sendMvrk = async (
  userAddress: string,
  amount: number
): Promise<string> => {
  const mvrkAmount = toMvrk(amount);
  const mvnFaucetInstance = await Mavryk.contract.at(env.FAUCET_CONTRACT_ADDRESS);

  const operation = await mvnFaucetInstance.methods.requestToken(mvrkAmount, mvrkTokenAddress, mvrkTokenId, userAddress).send();
  await operation.confirmation();

  console.log(`Sent ${mvrkAmount} MVN to ${userAddress}\nHash: ${operation.hash}`)

  return operation.hash
}

const sendMvn = async (
  userAddress: string,
  amount: number
): Promise<string> => {
  const mvnAmount = toMvn(amount);
  const mvnFaucetInstance = await Mavryk.contract.at(env.FAUCET_CONTRACT_ADDRESS);

  const operation = await mvnFaucetInstance.methods.requestToken(mvnAmount, mvnTokenAddress, mvnTokenId, userAddress).send();
  await operation.confirmation();

  console.log(`Sent ${mvnAmount} MVN to ${userAddress}\nHash: ${operation.hash}`)

  return operation.hash
}

const sendUsdt = async (
  userAddress: string,
  amount: number
): Promise<string> => {
  const usdtAmount = toUsdt(amount);
  const usdtFaucetInstance = await Mavryk.contract.at(env.FAUCET_CONTRACT_ADDRESS);

  const operation = await usdtFaucetInstance.methods.requestToken(usdtAmount, usdtTokenAddress, usdtTokenId, userAddress).send();
  await operation.confirmation();

  console.log(`Sent ${usdtAmount} USDT to ${userAddress}\nHash: ${operation.hash}`)

  return operation.hash
}

export const sendMavAndRespond = async (
  res: Response,
  address: string,
  amount: number,
  token: string,
) => {
  try {

    let txHash = '';

    switch (token) {
      case Tokens.mvn:
        txHash = await sendMvn(address, amount)
        break;
      case Tokens.usdt:
        txHash = await sendUsdt(address, amount)
        break;
      case Tokens.mvrk:
        txHash = await sendMvrk(address, amount)
        break;
      default:
        return res
            .status(400)
            .send({ status: "ERROR", message: "Incorrect token" })
    }

    if (!txHash) {
      return res
          .status(403)
          .send({ status: "ERROR", message: "You have already enough ꜩ" })
    }

    return res
        .status(200)
        .send({ txHash, status: "SUCCESS", message: "Token sent" })
  } catch (err: any) {
    console.error(`Error sending token to ${address}.`, err)

    const { message } = err

    if (
      message.includes("subtraction_underflow") ||
      message.includes("storage_exhausted") ||
      message.includes("FA2_INSUFFICIENT_BALANCE") ||
      message.includes("empty_implicit_contract")
    ) {
      return res.status(500).send({
        status: "ERROR",
        message: "Faucet is low or has gone empty. Please contact the team.",
      })
    }

    if (
        message.includes("TOKEN_REQUEST_EXCEEDS_MAXIMUM_ALLOWED")
    ) {
      return res.status(500).send({
        status: "ERROR",
        message: "TOKEN REQUEST EXCEEDS MAXIMUM ALLOWED",
      })
    }

    if (
        message.includes("ERROR_MVN_BALANCE_TOO_LOW")
    ) {
      return res.status(500).send({
        status: "ERROR",
        message: "MVN BALANCE TOO LOW",
      })
    }

    if (
        message.includes("ERROR_USDT_BALANCE_TOO_LOW")
    ) {
      return res.status(500).send({
        status: "ERROR",
        message: "USDT BALANCE TOO LOW",
      })
    }

    throw err
  }
}
