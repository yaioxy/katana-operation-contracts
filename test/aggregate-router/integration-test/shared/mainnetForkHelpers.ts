import { ERC20, ERC20__factory } from '../../../../typechain'
import { abi as V2_PAIR_ABI } from '../../../../artifacts/@katana/v3-contracts/periphery/interfaces/IKatanaV2Pair.sol/IKatanaV2Pair.json'
import { Currency, Token, WETH9 } from '@uniswap/sdk-core'
import { TransactionResponse } from '@ethersproject/abstract-provider'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BigNumber, constants } from 'ethers'
import { ethers, network } from 'hardhat'
import { MethodParameters } from '@uniswap/v3-sdk'
import { Pair } from '@uniswap/v2-sdk'

export const WETH = new Token(2020, '0xe514d9deb7966c8be0ca922de8a064264ea6bcd4', 18, 'WRON', 'Wrapped Ronin')
export const AXS = new Token(2020, '0x97a9107c1793bc407d6f527b77e7fff4d812bece', 18, 'AXS', 'Axie Infinity Shard')
export const USDC = new Token(2020, '0x0B7007c13325C48911F73A2daD5FA5dCBf808aDc', 6, 'USDC', 'USD Coin')
export const PIXEL = new Token(2020, '0x7eae20d11ef8c779433eb24503def900b9d28ad7', 18, 'PIXEL', 'PIXEL')
export const V2_FACTORY = 0xb255d6a720bb7c39fee173ce22113397119cb930

type Reserves = {
  reserve0: BigNumber
  reserve1: BigNumber
}

export const getV2PoolReserves = async (alice: SignerWithAddress, tokenA: Token, tokenB: Token): Promise<Reserves> => {
  const contractAddress = Pair.getAddress(tokenA, tokenB)
  const contract = new ethers.Contract(contractAddress, V2_PAIR_ABI, alice)

  const { reserve0, reserve1 } = await contract.getReserves()
  return { reserve0, reserve1 }
}


export const resetFork = async () => {
  await network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: "https://api-archived.roninchain.com/rpc",
          blockNumber: 38063933,
        },
      },
    ],
  })
}