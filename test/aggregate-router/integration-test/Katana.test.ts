import type { Contract } from '@ethersproject/contracts'
import { TransactionReceipt } from '@ethersproject/abstract-provider'
import { FeeAmount } from '@uniswap/v3-sdk'
import { parseEvents, V2_EVENTS, V3_EVENTS } from './shared/parseEvents'
import { expect } from './shared/expect'
import { encodePath } from './shared/swapRouter02Helpers'
import { BigNumber, BigNumberish } from 'ethers'
import { Permit2, AggregateRouter } from '../../../typechain'
import { abi as TOKEN_ABI } from '../../../artifacts/solmate/tokens/ERC20.sol/ERC20.json'
import { resetFork, WETH, AXS, USDC, PIXEL } from './shared/mainnetForkHelpers'
import {
  ADDRESS_THIS,
  ALICE_ADDRESS,
  CONTRACT_BALANCE,
  DEADLINE,
  ETH_ADDRESS,
  MAX_UINT,
  MAX_UINT160,
  MSG_SENDER,
  ONE_PERCENT_BIPS,
  SOURCE_MSG_SENDER,
  SOURCE_ROUTER,
} from './shared/constants'
import { computePairAddress, expandTo18DecimalsBN, expandTo6DecimalsBN } from './shared/helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import deployAggregateRouter, { deployPermit2 } from './shared/deployAggregateRouter'
import { RoutePlanner, CommandType } from './shared/planner'
import hre from 'hardhat'
import { getPermitSignature, getPermitBatchSignature, PermitSingle } from './shared/protocolHelpers/permit2'
const { ethers } = hre

describe('Katana V2 and V3 Tests:', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let router: AggregateRouter
  let permit2: Permit2
  let axsContract: Contract
  let wethContract: Contract
  let usdcContract: Contract
  let planner: RoutePlanner

  beforeEach(async () => {
    await resetFork()
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [ALICE_ADDRESS],
    })
    alice = await ethers.getSigner(ALICE_ADDRESS)
    bob = (await ethers.getSigners())[1]

    // alice deposit some ETH into the WETH contract
    ;(await ethers.getContractAt('IWETH9', WETH.address, alice)).deposit({ value: expandTo18DecimalsBN(1_000_000) })

    axsContract = new ethers.Contract(AXS.address, TOKEN_ABI, bob)
    wethContract = new ethers.Contract(WETH.address, TOKEN_ABI, bob)
    usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, bob)
    permit2 = (await deployPermit2()).connect(bob) as Permit2
    router = (await deployAggregateRouter(permit2)).connect(bob) as AggregateRouter
    await permit2.connect((await ethers.getSigners())[0]).grantSpender(router.address)
    planner = new RoutePlanner()

    // alice gives bob some tokens
    await axsContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100000))
    await wethContract.connect(alice).transfer(bob.address, expandTo18DecimalsBN(100000))
    await usdcContract.connect(alice).transfer(bob.address, expandTo6DecimalsBN(100000))

    // Bob max-approves the permit2 contract to access his AXS and WETH
    await axsContract.connect(bob).approve(permit2.address, MAX_UINT)
    await wethContract.connect(bob).approve(permit2.address, MAX_UINT)
    await usdcContract.connect(bob).approve(permit2.address, MAX_UINT)
  })

  describe('Trade on Katana with Permit2, giving approval every time', () => {
    describe('ERC20 --> ERC20', () => {
      let permit: PermitSingle

      it('V2 exactIn, permiting the exact amount', async () => {
        const amountInAXS = expandTo18DecimalsBN(100)
        const minAmountOutWETH = expandTo18DecimalsBN(0.03)

        // second bob signs a permit to allow the router to access his AXS
        permit = {
          details: {
            token: AXS.address,
            amount: amountInAXS,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
          spender: router.address,
          sigDeadline: DEADLINE,
        }
        const sig = await getPermitSignature(permit, bob, permit2)

        // 1) permit the router to access funds, 2) withdraw the funds into the pair, 3) trade
        planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          MSG_SENDER,
          amountInAXS,
          minAmountOutWETH,
          [AXS.address, WETH.address],
          SOURCE_MSG_SENDER,
        ])
        const { wethBalanceBefore, wethBalanceAfter, axsBalanceAfter, axsBalanceBefore } = await executeRouter(planner)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOutWETH)
        expect(axsBalanceBefore.sub(axsBalanceAfter)).to.be.eq(amountInAXS)
      })

      it('V2 exactOut, permiting the maxAmountIn', async () => {
        const maxAmountInAXS = expandTo18DecimalsBN(3000)
        const amountOutWETH = expandTo18DecimalsBN(1)

        // second bob signs a permit to allow the router to access his AXS
        permit = {
          details: {
            token: AXS.address,
            amount: maxAmountInAXS,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
          spender: router.address,
          sigDeadline: DEADLINE,
        }
        const sig = await getPermitSignature(permit, bob, permit2)

        // 1) permit the router to access funds, 2) trade - the transfer happens within the trade for exactOut
        planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
        planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
          MSG_SENDER,
          amountOutWETH,
          maxAmountInAXS,
          [AXS.address, WETH.address],
          SOURCE_MSG_SENDER,
        ])
        const { wethBalanceBefore, wethBalanceAfter, axsBalanceAfter, axsBalanceBefore } = await executeRouter(planner)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(amountOutWETH)
        expect(axsBalanceBefore.sub(axsBalanceAfter)).to.be.lte(maxAmountInAXS)
      })

      it('V2 exactIn, swapping more than max_uint160 should revert', async () => {
        const max_uint = BigNumber.from(MAX_UINT160)
        const minAmountOutWETH = expandTo18DecimalsBN(0.03)

        // second bob signs a permit to allow the router to access his AXS
        permit = {
          details: {
            token: AXS.address,
            amount: max_uint,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
          spender: router.address,
          sigDeadline: DEADLINE,
        }
        const sig = await getPermitSignature(permit, bob, permit2)

        // 1) permit the router to access funds, 2) withdraw the funds into the pair, 3) trade
        planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          MSG_SENDER,
          BigNumber.from(MAX_UINT160).add(1),
          minAmountOutWETH,
          [AXS.address, WETH.address],
          SOURCE_MSG_SENDER,
        ])

        const testCustomErrors = await (await ethers.getContractFactory('TestCustomErrors')).deploy()
        await expect(executeRouter(planner)).to.be.revertedWithCustomError(testCustomErrors, 'UnsafeCast')
      })

      it('V3 exactIn, permiting the exact amount', async () => {
        const amountInAXS = expandTo18DecimalsBN(100)
        const minAmountOutWETH = expandTo18DecimalsBN(0.03)

        // first bob approves permit2 to access his AXS
        await axsContract.connect(bob).approve(permit2.address, MAX_UINT)

        // second bob signs a permit to allow the router to access his AXS
        permit = {
          details: {
            token: AXS.address,
            amount: amountInAXS,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
          spender: router.address,
          sigDeadline: DEADLINE,
        }
        const sig = await getPermitSignature(permit, bob, permit2)

        const path = encodePathExactInput([AXS.address, WETH.address])

        // 1) permit the router to access funds, 2) trade, which takes the funds directly from permit2
        planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          MSG_SENDER,
          amountInAXS,
          minAmountOutWETH,
          path,
          SOURCE_MSG_SENDER,
        ])
        const { wethBalanceBefore, wethBalanceAfter, axsBalanceAfter, axsBalanceBefore } = await executeRouter(planner)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOutWETH)
        expect(axsBalanceBefore.sub(axsBalanceAfter)).to.be.eq(amountInAXS)
      })

      it('V3 exactOut, permiting the exact amount', async () => {
        const maxAmountInAXS = expandTo18DecimalsBN(3000)
        const amountOutWETH = expandTo18DecimalsBN(1)

        // first bob approves permit2 to access his AXS
        await axsContract.connect(bob).approve(permit2.address, MAX_UINT)

        // second bob signs a permit to allow the router to access his AXS
        permit = {
          details: {
            token: AXS.address,
            amount: maxAmountInAXS,
            expiration: 0, // expiration of 0 is block.timestamp
            nonce: 0, // this is his first trade
          },
          spender: router.address,
          sigDeadline: DEADLINE,
        }
        const sig = await getPermitSignature(permit, bob, permit2)

        const path = encodePathExactOutput([AXS.address, WETH.address])

        // 1) permit the router to access funds, 2) trade, which takes the funds directly from permit2
        planner.addCommand(CommandType.PERMIT2_PERMIT, [permit, sig])
        planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [
          MSG_SENDER,
          amountOutWETH,
          maxAmountInAXS,
          path,
          SOURCE_MSG_SENDER,
        ])
        const { wethBalanceBefore, wethBalanceAfter, axsBalanceAfter, axsBalanceBefore } = await executeRouter(planner)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.eq(amountOutWETH)
        expect(axsBalanceBefore.sub(axsBalanceAfter)).to.be.lte(maxAmountInAXS)
      })
    })
  })

  describe('Trade on KatanaV2', () => {
    const amountIn: BigNumber = expandTo18DecimalsBN(5)
    beforeEach(async () => {
      // for these tests Bob gives the router max approval on permit2
      await permit2.approve(AXS.address, router.address, MAX_UINT160, DEADLINE)
      await permit2.approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
    })

    describe('ERC20 --> ERC20', () => {
      it('completes a V2 exactIn swap', async () => {
        const minAmountOut = expandTo18DecimalsBN(0.0001)
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          MSG_SENDER,
          amountIn,
          minAmountOut,
          [AXS.address, WETH.address],
          SOURCE_MSG_SENDER,
        ])
        const { wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gt(minAmountOut)
      })

      it('completes a V2 exactOut swap', async () => {
        const amountOut = expandTo18DecimalsBN(1)
        planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
          MSG_SENDER,
          amountOut,
          expandTo18DecimalsBN(10000),
          [WETH.address, AXS.address],
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, 0])
        const { axsBalanceBefore, axsBalanceAfter } = await executeRouter(planner)
        expect(axsBalanceAfter.sub(axsBalanceBefore)).to.be.gte(amountOut)
      })

      it('exactIn trade, where an output fee is taken', async () => {
        // back to the router so someone can take a fee
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          amountIn,
          1,
          [AXS.address, WETH.address],
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.PAY_PORTION, [WETH.address, alice.address, ONE_PERCENT_BIPS])
        planner.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, 1])

        const { commands, inputs } = planner
        const wethBalanceBeforeAlice = await wethContract.balanceOf(alice.address)
        const wethBalanceBeforeBob = await wethContract.balanceOf(bob.address)

        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)

        const wethBalanceAfterAlice = await wethContract.balanceOf(alice.address)
        const wethBalanceAfterBob = await wethContract.balanceOf(bob.address)

        const aliceFee = wethBalanceAfterAlice.sub(wethBalanceBeforeAlice)
        const bobEarnings = wethBalanceAfterBob.sub(wethBalanceBeforeBob)

        expect(bobEarnings).to.be.gt(0)
        expect(aliceFee).to.be.gt(0)

        // total fee is 1% of bob's output
        expect(aliceFee.add(bobEarnings).mul(ONE_PERCENT_BIPS).div(10_000)).to.eq(aliceFee)
      })

      it('completes a V2 exactIn swap with longer path', async () => {
        const minAmountOut = expandTo18DecimalsBN(0.0001)
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          MSG_SENDER,
          amountIn,
          minAmountOut,
          [AXS.address, USDC.address, WETH.address],
          SOURCE_MSG_SENDER,
        ])

        const { wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gt(minAmountOut)
      })
    })

    describe('ERC20 --> ETH', () => {
      it('completes a V2 exactIn swap', async () => {
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          amountIn,
          1,
          [AXS.address, WETH.address],
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0])

        const { gasSpent, ethBalanceBefore, ethBalanceAfter, v2SwapEventArgs } = await executeRouter(planner)
        const { amount1Out: wethTraded } = v2SwapEventArgs!

        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(wethTraded.sub(gasSpent))
      })

      it('completes a V2 exactOut swap', async () => {
        const amountOut = expandTo18DecimalsBN(1)
        planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
          ADDRESS_THIS,
          amountOut,
          expandTo18DecimalsBN(10000),
          [AXS.address, WETH.address],
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, amountOut])
        planner.addCommand(CommandType.SWEEP, [AXS.address, MSG_SENDER, 0])

        const { gasSpent, ethBalanceBefore, ethBalanceAfter, v2SwapEventArgs } = await executeRouter(planner)
        const { amount1Out: wethTraded } = v2SwapEventArgs!
        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.gte(amountOut.sub(gasSpent))
        expect(wethTraded).to.gte(amountOut)
        expect(wethTraded).to.eq(ethBalanceAfter.sub(ethBalanceBefore).add(gasSpent))
      })

      it('completes a V2 exactOut swap, with ETH fee', async () => {
        const amountOut = expandTo18DecimalsBN(1)
        const totalPortion = amountOut.mul(ONE_PERCENT_BIPS).div(10000)
        const actualAmountOut = amountOut.sub(totalPortion)

        planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
          ADDRESS_THIS,
          amountOut,
          expandTo18DecimalsBN(10000),
          [AXS.address, WETH.address],
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.UNWRAP_WETH, [ADDRESS_THIS, amountOut])
        planner.addCommand(CommandType.PAY_PORTION, [ETH_ADDRESS, alice.address, ONE_PERCENT_BIPS])
        planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, MSG_SENDER, 0])

        const { commands, inputs } = planner

        await expect(router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)).to.changeEtherBalances(
          [alice, bob],
          [totalPortion, actualAmountOut.add(2)]
        )
      })
    })

    describe('ETH --> ERC20', () => {
      it('completes a V2 exactIn swap', async () => {
        const minAmountOut = expandTo18DecimalsBN(0.001)
        const pairAddress = computePairAddress(AXS, WETH)
        planner.addCommand(CommandType.WRAP_ETH, [pairAddress, amountIn])
        // amountIn of 0 because the weth is already in the pair
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          MSG_SENDER,
          0,
          minAmountOut,
          [WETH.address, AXS.address],
          SOURCE_MSG_SENDER,
        ])

        const { axsBalanceBefore, axsBalanceAfter, v2SwapEventArgs } = await executeRouter(planner, amountIn)
        const { amount0Out: axsTraded } = v2SwapEventArgs!

        expect(axsBalanceAfter.sub(axsBalanceBefore)).to.be.gt(minAmountOut)
        expect(axsBalanceAfter.sub(axsBalanceBefore)).to.equal(axsTraded)
      })

      it('completes a V2 exactOut swap', async () => {
        const amountOut = expandTo18DecimalsBN(100)
        const value = expandTo18DecimalsBN(400)

        planner.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, value])
        planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
          MSG_SENDER,
          amountOut,
          expandTo18DecimalsBN(400),
          [WETH.address, AXS.address],
          SOURCE_ROUTER,
        ])
        planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0])

        const { ethBalanceBefore, ethBalanceAfter, axsBalanceBefore, axsBalanceAfter, v2SwapEventArgs, gasSpent } =
          await executeRouter(planner, value)
        const { amount0Out: axsTraded, amount1In: wethTraded } = v2SwapEventArgs!
        expect(axsBalanceAfter.sub(axsBalanceBefore)).eq(amountOut)
        expect(axsBalanceAfter.sub(axsBalanceBefore)).eq(axsTraded)
        expect(ethBalanceBefore.sub(ethBalanceAfter)).to.eq(wethTraded.add(gasSpent))
      })
    })
  })

  describe('Trade on KatanaV3', () => {
    const amountIn: BigNumber = expandTo18DecimalsBN(500)
    const amountInMax: BigNumber = expandTo18DecimalsBN(2000)
    const amountOut: BigNumber = expandTo18DecimalsBN(1)

    beforeEach(async () => {
      // for these tests Bob gives the router max approval on permit2
      await permit2.approve(AXS.address, router.address, MAX_UINT160, DEADLINE)
      await permit2.approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
    })

    const addV3ExactInTrades = (
      planner: RoutePlanner,
      numTrades: BigNumberish,
      amountOutMin: BigNumberish,
      recipient?: string,
      tokens: string[] = [AXS.address, WETH.address],
      tokenSource: boolean = SOURCE_MSG_SENDER
    ) => {
      const path = encodePathExactInput(tokens)
      for (let i = 0; i < Number(numTrades); i++) {
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          recipient ?? MSG_SENDER,
          amountIn,
          amountOutMin,
          path,
          tokenSource,
        ])
      }
    }

    describe('ERC20 --> ERC20', () => {
      it('completes a V3 exactIn swap', async () => {
        const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)
        addV3ExactInTrades(planner, 1, amountOutMin)

        const { wethBalanceBefore, wethBalanceAfter, v3SwapEventArgs } = await executeRouter(planner)
        const { amount1: wethTraded } = v3SwapEventArgs!
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(amountOutMin)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.eq(wethTraded.mul(-1))
      })

      it('completes a V3 exactIn swap with longer path', async () => {
        const amountOutMin: number = 3 * 10 ** 6
        addV3ExactInTrades(
          planner,
          1,
          amountOutMin,
          MSG_SENDER,
          [AXS.address, WETH.address, USDC.address],
          SOURCE_MSG_SENDER
        )

        const {
          axsBalanceBefore,
          axsBalanceAfter,
          wethBalanceBefore,
          wethBalanceAfter,
          usdcBalanceBefore,
          usdcBalanceAfter,
        } = await executeRouter(planner)

        expect(axsBalanceBefore.sub(amountIn)).to.eq(axsBalanceAfter)
        expect(wethBalanceAfter).to.eq(wethBalanceBefore)
        expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.be.gte(amountOutMin)
      })

      it('completes a V3 exactOut swap', async () => {
        // trade AXS in for WETH out
        const tokens = [AXS.address, WETH.address]
        const path = encodePathExactOutput(tokens)

        planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [MSG_SENDER, amountOut, amountInMax, path, SOURCE_MSG_SENDER])

        const { wethBalanceBefore, wethBalanceAfter, v3SwapEventArgs } = await executeRouter(planner)
        const { amount0: axsTraded } = v3SwapEventArgs!
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.eq(amountOut)
        expect(axsTraded).to.be.lt(amountInMax)
      })

      it('completes a V3 exactOut swap with longer path', async () => {
        // trade AXS in for WETH out
        const tokens = [AXS.address, USDC.address, WETH.address]
        const path = encodePathExactOutput(tokens)
        // for these tests Bob gives the router max approval on permit2
        // await permit2.approve(AXS.address, router.address, MAX_UINT160, DEADLINE)

        planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [MSG_SENDER, amountOut, amountInMax, path, SOURCE_MSG_SENDER])
        const { commands, inputs } = planner

        const balanceWethBefore = await wethContract.balanceOf(bob.address)
        await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE)
        const balanceWethAfter = await wethContract.balanceOf(bob.address)
        expect(balanceWethAfter.sub(balanceWethBefore)).to.eq(amountOut)
      })
    })

    describe('ERC20 --> ETH', () => {
      it('completes a V3 exactIn swap', async () => {
        const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)
        addV3ExactInTrades(planner, 1, amountOutMin, ADDRESS_THIS)
        planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0])

        const { ethBalanceBefore, ethBalanceAfter, v3SwapEventArgs, gasSpent } = await executeRouter(planner)
        const { amount1: wethTraded } = v3SwapEventArgs!

        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.be.gte(amountOutMin.sub(gasSpent))
        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(wethTraded.mul(-1).sub(gasSpent))
      })

      it('completes a V3 exactOut swap', async () => {
        // trade AXS in for WETH out
        const tokens = [AXS.address, WETH.address]
        const path = encodePathExactOutput(tokens)

        planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [
          ADDRESS_THIS,
          amountOut,
          amountInMax,
          path,
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, amountOut])

        const { ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(planner)

        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(amountOut.sub(gasSpent))
      })
    })

    describe('ETH --> ERC20', () => {
      it('completes a V3 exactIn swap', async () => {
        const tokens = [WETH.address, AXS.address]
        const amountOutMin: BigNumber = expandTo18DecimalsBN(0.0005)

        planner.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, amountIn])
        addV3ExactInTrades(planner, 1, amountOutMin, MSG_SENDER, tokens, SOURCE_ROUTER)

        const { ethBalanceBefore, ethBalanceAfter, axsBalanceBefore, axsBalanceAfter, gasSpent } = await executeRouter(
          planner,
          amountIn
        )

        expect(ethBalanceBefore.sub(ethBalanceAfter)).to.eq(amountIn.add(gasSpent))
        expect(axsBalanceAfter.sub(axsBalanceBefore)).to.be.gte(amountOutMin)
      })

      it('completes a V3 exactOut swap', async () => {
        const tokens = [WETH.address, AXS.address]
        const path = encodePathExactOutput(tokens)

        planner.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, amountInMax])
        planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [MSG_SENDER, amountOut, amountInMax, path, SOURCE_ROUTER])
        planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, 0])

        const { ethBalanceBefore, ethBalanceAfter, axsBalanceBefore, axsBalanceAfter, gasSpent, v3SwapEventArgs } =
          await executeRouter(planner, amountInMax)
        const { amount0: axsTraded, amount1: wethTraded } = v3SwapEventArgs!

        expect(axsBalanceBefore.sub(axsBalanceAfter)).to.eq(axsTraded)
        expect(ethBalanceBefore.sub(ethBalanceAfter)).to.eq(wethTraded.add(gasSpent))
      })
    })
  })

  describe('Mixing V2 and V3', () => {
    beforeEach(async () => {
      // for these tests Bob gives the router max approval on permit2
      await permit2.approve(AXS.address, router.address, MAX_UINT160, DEADLINE)
      await permit2.approve(WETH.address, router.address, MAX_UINT160, DEADLINE)
      await permit2.approve(USDC.address, router.address, MAX_UINT160, DEADLINE)
    })

    describe('Interleaving routes', () => {
      it('V3, then V2', async () => {
        const v3Tokens = [AXS.address, USDC.address]
        const v2Tokens = [USDC.address, WETH.address]
        const v3AmountIn: BigNumber = expandTo18DecimalsBN(5)
        const v3AmountOutMin = 0
        const v2AmountOutMin = expandTo18DecimalsBN(0.0005)

        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          computePairAddress(USDC, WETH),
          v3AmountIn,
          v3AmountOutMin,
          encodePathExactInput(v3Tokens),
          SOURCE_MSG_SENDER,
        ])
        // amountIn of 0 because the USDC is already in the pair
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [MSG_SENDER, 0, v2AmountOutMin, v2Tokens, SOURCE_MSG_SENDER])

        const { wethBalanceBefore, wethBalanceAfter, v2SwapEventArgs } = await executeRouter(planner)
        const { amount1Out: wethTraded } = v2SwapEventArgs!
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.eq(wethTraded)
      })

      it('V2, then V3', async () => {
        const v2Tokens = [AXS.address, USDC.address]
        const v3Tokens = [USDC.address, WETH.address]
        const v2AmountIn: BigNumber = expandTo18DecimalsBN(5)
        const v2AmountOutMin = 0 // doesnt matter how much USDC it is, what matters is the end of the trade
        const v3AmountOutMin = expandTo18DecimalsBN(0.0005)

        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          v2AmountIn,
          v2AmountOutMin,
          v2Tokens,
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          MSG_SENDER,
          CONTRACT_BALANCE,
          v3AmountOutMin,
          encodePathExactInput(v3Tokens),
          SOURCE_ROUTER,
        ])

        const { wethBalanceBefore, wethBalanceAfter, v3SwapEventArgs } = await executeRouter(planner)
        const { amount1: wethTraded } = v3SwapEventArgs!
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.eq(wethTraded.mul(-1))
      })
    })

    describe('Split routes', () => {
      it('ERC20 --> ERC20 split V2 and V2 different routes, each two hop, with explicit permit transfer from', async () => {
        const route1 = [AXS.address, USDC.address, WETH.address]
        const route2 = [AXS.address, PIXEL.address, WETH.address]
        const v2AmountIn1: BigNumber = expandTo18DecimalsBN(20)
        const v2AmountIn2: BigNumber = expandTo18DecimalsBN(30)
        const minAmountOut1 = expandTo18DecimalsBN(0.005)
        const minAmountOut2 = expandTo18DecimalsBN(0.0075)

        // 1) transfer funds into AXS-USDC and AXS-PIXEL pairs to trade
        planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [AXS.address, computePairAddress(AXS, USDC), v2AmountIn1])
        planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [AXS.address, computePairAddress(AXS, PIXEL), v2AmountIn2])

        // 2) trade route1 and return tokens to bob
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [MSG_SENDER, 0, minAmountOut1, route1, SOURCE_MSG_SENDER])
        // 3) trade route2 and return tokens to bob
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [MSG_SENDER, 0, minAmountOut2, route2, SOURCE_MSG_SENDER])

        const { wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOut1.add(minAmountOut2))
      })

      it('ERC20 --> ERC20 split V2 and V2 different routes, each two hop, with explicit permit transfer from batch', async () => {
        const route1 = [AXS.address, USDC.address, WETH.address]
        const route2 = [AXS.address, PIXEL.address, WETH.address]
        const v2AmountIn1: BigNumber = expandTo18DecimalsBN(20)
        const v2AmountIn2: BigNumber = expandTo18DecimalsBN(30)
        const minAmountOut1 = expandTo18DecimalsBN(0.005)
        const minAmountOut2 = expandTo18DecimalsBN(0.0075)

        const BATCH_TRANSFER = [
          {
            from: bob.address,
            to: computePairAddress(AXS, USDC),
            amount: v2AmountIn1,
            token: AXS.address,
          },
          {
            from: bob.address,
            to: computePairAddress(AXS, PIXEL),
            amount: v2AmountIn2,
            token: AXS.address,
          },
        ]

        // 1) transfer funds into AXS-USDC and AXS-PIXEL pairs to trade
        planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM_BATCH, [BATCH_TRANSFER])

        // 2) trade route1 and return tokens to bob
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [MSG_SENDER, 0, minAmountOut1, route1, SOURCE_MSG_SENDER])
        // 3) trade route2 and return tokens to bob
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [MSG_SENDER, 0, minAmountOut2, route2, SOURCE_MSG_SENDER])

        const { wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOut1.add(minAmountOut2))
      })

      it('ERC20 --> ERC20 split V2 and V2 different routes, each two hop, without explicit permit', async () => {
        const route1 = [AXS.address, USDC.address, WETH.address]
        const route2 = [AXS.address, PIXEL.address, WETH.address]
        const v2AmountIn1: BigNumber = expandTo18DecimalsBN(20)
        const v2AmountIn2: BigNumber = expandTo18DecimalsBN(30)
        const minAmountOut1 = expandTo18DecimalsBN(0.005)
        const minAmountOut2 = expandTo18DecimalsBN(0.0075)

        // 1) trade route1 and return tokens to bob
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          MSG_SENDER,
          v2AmountIn1,
          minAmountOut1,
          route1,
          SOURCE_MSG_SENDER,
        ])
        // 2) trade route2 and return tokens to bob
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          MSG_SENDER,
          v2AmountIn2,
          minAmountOut2,
          route2,
          SOURCE_MSG_SENDER,
        ])

        const { wethBalanceBefore, wethBalanceAfter } = await executeRouter(planner)
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOut1.add(minAmountOut2))
      })

      it('ERC20 --> ERC20 split V2 and V2 different routes, different input tokens, each two hop, with batch permit', async () => {
        const route1 = [AXS.address, WETH.address, USDC.address]
        const route2 = [WETH.address, AXS.address, USDC.address]
        const v2AmountIn1: BigNumber = expandTo18DecimalsBN(20)
        const v2AmountIn2: BigNumber = expandTo18DecimalsBN(5)
        const minAmountOut1 = BigNumber.from(0.005 * 10 ** 6)
        const minAmountOut2 = BigNumber.from(0.0075 * 10 ** 6)

        const BATCH_PERMIT = {
          details: [
            {
              token: AXS.address,
              amount: v2AmountIn1,
              expiration: 0, // expiration of 0 is block.timestamp
              nonce: 0, // this is his first trade
            },
            {
              token: WETH.address,
              amount: v2AmountIn2,
              expiration: 0, // expiration of 0 is block.timestamp
              nonce: 0, // this is his first trade
            },
          ],
          spender: router.address,
          sigDeadline: DEADLINE,
        }

        const sig = await getPermitBatchSignature(BATCH_PERMIT, bob, permit2)

        // 1) transfer funds into AXS-USDC and AXS-PIXEL pairs to trade
        planner.addCommand(CommandType.PERMIT2_PERMIT_BATCH, [BATCH_PERMIT, sig])

        // 2) trade route1 and return tokens to bob
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          MSG_SENDER,
          v2AmountIn1,
          minAmountOut1,
          route1,
          SOURCE_MSG_SENDER,
        ])
        // 3) trade route2 and return tokens to bob
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [
          MSG_SENDER,
          v2AmountIn2,
          minAmountOut2,
          route2,
          SOURCE_MSG_SENDER,
        ])

        const { usdcBalanceBefore, usdcBalanceAfter } = await executeRouter(planner)
        expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.be.gte(minAmountOut1.add(minAmountOut2))
      })

      it('ERC20 --> ERC20 V3 trades with different input tokens with batch permit and batch transfer', async () => {
        const route1 = [AXS.address, WETH.address]
        const route2 = [WETH.address, USDC.address]
        const v3AmountIn1: BigNumber = expandTo18DecimalsBN(20)
        const v3AmountIn2: BigNumber = expandTo18DecimalsBN(5)
        const minAmountOut1WETH = BigNumber.from(0)
        const minAmountOut1USDC = BigNumber.from(0.005 * 10 ** 6)
        const minAmountOut2USDC = BigNumber.from(0.0075 * 10 ** 6)

        const BATCH_PERMIT = {
          details: [
            {
              token: AXS.address,
              amount: v3AmountIn1,
              expiration: 0, // expiration of 0 is block.timestamp
              nonce: 0, // this is his first trade
            },
            {
              token: WETH.address,
              amount: v3AmountIn2,
              expiration: 0, // expiration of 0 is block.timestamp
              nonce: 0, // this is his first trade
            },
          ],
          spender: router.address,
          sigDeadline: DEADLINE,
        }

        const BATCH_TRANSFER = [
          {
            from: bob.address,
            to: router.address,
            amount: v3AmountIn1,
            token: AXS.address,
          },
          {
            from: bob.address,
            to: router.address,
            amount: v3AmountIn2,
            token: WETH.address,
          },
        ]

        const sig = await getPermitBatchSignature(BATCH_PERMIT, bob, permit2)

        // 1) permit axs and weth to be spent by router
        planner.addCommand(CommandType.PERMIT2_PERMIT_BATCH, [BATCH_PERMIT, sig])

        // 2) transfer axs and weth into router to use contract balance
        planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM_BATCH, [BATCH_TRANSFER])

        // v3SwapExactInput(recipient, amountIn, amountOutMin, path, payer);

        // 2) trade route1 and return tokens to router for the second trade
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          CONTRACT_BALANCE,
          minAmountOut1WETH,
          encodePathExactInput(route1),
          SOURCE_ROUTER,
        ])
        // 3) trade route2 and return tokens to bob
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          MSG_SENDER,
          CONTRACT_BALANCE,
          minAmountOut1USDC.add(minAmountOut2USDC),
          encodePathExactInput(route2),
          SOURCE_ROUTER,
        ])

        const { usdcBalanceBefore, usdcBalanceAfter } = await executeRouter(planner)
        expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.be.gte(minAmountOut1USDC.add(minAmountOut2USDC))
      })

      it('ERC20 --> ERC20 split V2 and V3, one hop', async () => {
        const tokens = [AXS.address, WETH.address]
        const v2AmountIn: BigNumber = expandTo18DecimalsBN(2)
        const v3AmountIn: BigNumber = expandTo18DecimalsBN(3)
        const minAmountOut = expandTo18DecimalsBN(0.0005)

        // V2 trades AXS for USDC, sending the tokens back to the router for v3 trade
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [ADDRESS_THIS, v2AmountIn, 0, tokens, SOURCE_MSG_SENDER])
        // V3 trades USDC for WETH, trading the whole balance, with a recipient of Alice
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          v3AmountIn,
          0,
          encodePathExactInput(tokens),
          SOURCE_MSG_SENDER,
        ])
        // aggregate slippage check
        planner.addCommand(CommandType.SWEEP, [WETH.address, MSG_SENDER, minAmountOut])

        const { wethBalanceBefore, wethBalanceAfter, v2SwapEventArgs, v3SwapEventArgs } = await executeRouter(planner)
        const { amount1Out: wethOutV2 } = v2SwapEventArgs!
        let { amount1: wethOutV3 } = v3SwapEventArgs!

        // expect(axsBalanceBefore.sub(axsBalanceAfter)).to.eq(v2AmountIn.add(v3AmountIn)) // TODO: with permit2 can check from alice's balance
        expect(wethBalanceAfter.sub(wethBalanceBefore)).to.eq(wethOutV2.sub(wethOutV3))
      })

      it('ETH --> ERC20 split V2 and V3, one hop', async () => {
        const tokens = [WETH.address, USDC.address]
        const v2AmountIn: BigNumber = expandTo18DecimalsBN(2)
        const v3AmountIn: BigNumber = expandTo18DecimalsBN(3)
        const value = v2AmountIn.add(v3AmountIn)

        planner.addCommand(CommandType.WRAP_ETH, [ADDRESS_THIS, value])
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [ADDRESS_THIS, v2AmountIn, 0, tokens, SOURCE_ROUTER])
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          v3AmountIn,
          0,
          encodePathExactInput(tokens),
          SOURCE_MSG_SENDER,
        ])
        // aggregate slippage check
        planner.addCommand(CommandType.SWEEP, [USDC.address, MSG_SENDER, 0.0005 * 10 ** 6])

        const { usdcBalanceBefore, usdcBalanceAfter, v2SwapEventArgs, v3SwapEventArgs } = await executeRouter(
          planner,
          value
        )
        const { amount0Out: usdcOutV2 } = v2SwapEventArgs!
        let { amount0: usdcOutV3 } = v3SwapEventArgs!
        usdcOutV3 = usdcOutV3.mul(-1)
        expect(usdcBalanceAfter.sub(usdcBalanceBefore)).to.eq(usdcOutV2.add(usdcOutV3))
      })

      it('ERC20 --> ETH split V2 and V3, one hop', async () => {
        const tokens = [AXS.address, WETH.address]
        const v2AmountIn: BigNumber = expandTo18DecimalsBN(20)
        const v3AmountIn: BigNumber = expandTo18DecimalsBN(30)

        planner.addCommand(CommandType.V2_SWAP_EXACT_IN, [ADDRESS_THIS, v2AmountIn, 0, tokens, SOURCE_MSG_SENDER])
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN, [
          ADDRESS_THIS,
          v3AmountIn,
          0,
          encodePathExactInput(tokens),
          SOURCE_MSG_SENDER,
        ])
        // aggregate slippage check
        planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, expandTo18DecimalsBN(0.0005)])

        const { ethBalanceBefore, ethBalanceAfter, gasSpent, v2SwapEventArgs, v3SwapEventArgs } = await executeRouter(
          planner
        )
        const { amount1Out: wethOutV2 } = v2SwapEventArgs!
        let { amount1: wethOutV3 } = v3SwapEventArgs!
        wethOutV3 = wethOutV3.mul(-1)

        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(wethOutV2.add(wethOutV3).sub(gasSpent))
      })

      it('ERC20 --> ETH split V2 and V3, exactOut, one hop', async () => {
        const tokens = [AXS.address, WETH.address]
        const v2AmountOut: BigNumber = expandTo18DecimalsBN(0.5)
        const v3AmountOut: BigNumber = expandTo18DecimalsBN(1)
        const path = encodePathExactOutput(tokens)
        const maxAmountIn = expandTo18DecimalsBN(4000)
        const fullAmountOut = v2AmountOut.add(v3AmountOut)

        planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, [
          ADDRESS_THIS,
          v2AmountOut,
          maxAmountIn,
          [AXS.address, WETH.address],
          SOURCE_MSG_SENDER,
        ])
        planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, [
          ADDRESS_THIS,
          v3AmountOut,
          maxAmountIn,
          path,
          SOURCE_MSG_SENDER,
        ])
        // aggregate slippage check
        planner.addCommand(CommandType.UNWRAP_WETH, [MSG_SENDER, fullAmountOut])

        const { ethBalanceBefore, ethBalanceAfter, gasSpent } = await executeRouter(planner)

        // TODO: permit2 test alice doesn't send more than maxAmountIn AXS
        expect(ethBalanceAfter.sub(ethBalanceBefore)).to.gte(fullAmountOut.sub(gasSpent)) // rouding
      })
    })
  })

  type V2SwapEventArgs = {
    amount0In: BigNumber
    amount0Out: BigNumber
    amount1In: BigNumber
    amount1Out: BigNumber
  }

  type V3SwapEventArgs = {
    amount0: BigNumber
    amount1: BigNumber
  }

  type ExecutionParams = {
    wethBalanceBefore: BigNumber
    wethBalanceAfter: BigNumber
    axsBalanceBefore: BigNumber
    axsBalanceAfter: BigNumber
    usdcBalanceBefore: BigNumber
    usdcBalanceAfter: BigNumber
    ethBalanceBefore: BigNumber
    ethBalanceAfter: BigNumber
    v2SwapEventArgs: V2SwapEventArgs | undefined
    v3SwapEventArgs: V3SwapEventArgs | undefined
    receipt: TransactionReceipt
    gasSpent: BigNumber
  }

  async function executeRouter(planner: RoutePlanner, value?: BigNumberish): Promise<ExecutionParams> {
    const ethBalanceBefore: BigNumber = await ethers.provider.getBalance(bob.address)
    const wethBalanceBefore: BigNumber = await wethContract.balanceOf(bob.address)
    const axsBalanceBefore: BigNumber = await axsContract.balanceOf(bob.address)
    const usdcBalanceBefore: BigNumber = await usdcContract.balanceOf(bob.address)

    const { commands, inputs } = planner

    const receipt = await (await router['execute(bytes,bytes[],uint256)'](commands, inputs, DEADLINE, { value })).wait()
    const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)
    const v2SwapEventArgs = parseEvents(V2_EVENTS, receipt)[0]?.args as unknown as V2SwapEventArgs
    const v3SwapEventArgs = parseEvents(V3_EVENTS, receipt)[0]?.args as unknown as V3SwapEventArgs

    const ethBalanceAfter: BigNumber = await ethers.provider.getBalance(bob.address)
    const wethBalanceAfter: BigNumber = await wethContract.balanceOf(bob.address)
    const axsBalanceAfter: BigNumber = await axsContract.balanceOf(bob.address)
    const usdcBalanceAfter: BigNumber = await usdcContract.balanceOf(bob.address)

    return {
      wethBalanceBefore,
      wethBalanceAfter,
      axsBalanceBefore,
      axsBalanceAfter,
      usdcBalanceBefore,
      usdcBalanceAfter,
      ethBalanceBefore,
      ethBalanceAfter,
      v2SwapEventArgs,
      v3SwapEventArgs,
      receipt,
      gasSpent,
    }
  }

  function encodePathExactInput(tokens: string[]) {
    return encodePath(tokens, new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
  }

  function encodePathExactOutput(tokens: string[]) {
    return encodePath(tokens.slice().reverse(), new Array(tokens.length - 1).fill(FeeAmount.MEDIUM))
  }
})
