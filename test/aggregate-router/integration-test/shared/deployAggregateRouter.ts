import { ethers, network } from 'hardhat'
import { AggregateRouter, Permit2 } from '../../../../typechain'
import {
  V2_FACTORY_MAINNET,
  V2_INIT_CODE_HASH_MAINNET,
  V3_INIT_CODE_HASH_MAINNET,
  GOVERNANCE_ADDRESS,
  PROXY_ADMIN_ADDRESS,
  TREASURY_ADDRESS,
  ZERO_ADDRESS,
  WRON_ADDRESS,
  ALICE_ADDRESS,
  MAX_UINT,
  LEGACY_PERMISSIONED_ROUTER,
} from './constants'
import { bytecode as beaconBytecode, abi as beaconABI } from './contracts/KatanaV3PoolBeacon.json'
import { bytecode as poolBytecode, abi as poolABI } from './contracts/KatanaV3Pool.json'
import { bytecode as v3FactoryBytecode, abi as v3FactoryABI } from './contracts/KatanaV3Factory.json'
import { bytecode as positionManagerBytecode, abi as positionManagerABI } from './contracts/NonfungiblePositionManager.json'
import { encodePriceSqrt, expandTo18DecimalsBN, expandTo6DecimalsBN, getMaxTick, getMinTick } from './helpers'
import { FeeAmount, TICK_SPACINGS } from '@uniswap/v3-sdk'
import { AXS, USDC, WETH } from './mainnetForkHelpers'
import { abi as TOKEN_ABI } from '../../../../artifacts/solmate/tokens/ERC20.sol/ERC20.json'

export async function deployRouter(
  permit2: Permit2,
): Promise<AggregateRouter> {
  const v3Factory = await deployV3Factory()
  const positionManager = await deployPositionManager(v3Factory.address, WRON_ADDRESS)

  const routerParameters = {
    permit2: permit2.address,
    weth9: WRON_ADDRESS,
    governance: GOVERNANCE_ADDRESS,
    v2Factory: V2_FACTORY_MAINNET,
    v3Factory: v3Factory.address,
    pairInitCodeHash: V2_INIT_CODE_HASH_MAINNET,
    poolInitCodeHash: V3_INIT_CODE_HASH_MAINNET,
  }

  const routerFactory = await ethers.getContractFactory('AggregateRouter')
  const router = (await routerFactory.deploy(routerParameters)) as unknown as AggregateRouter

  await upgradeKatanaGovernance(v3Factory.address, positionManager.address, router.address)

  await initializeV3Pools(positionManager)

  return router
}

export default deployRouter

export async function deployPermit2(): Promise<Permit2> {
  const permit2Factory = await ethers.getContractFactory('Permit2')
  const permit2 = (await permit2Factory.deploy()) as unknown as Permit2
  return permit2
}

async function deployV3Factory() {
  const deployer = (await ethers.getSigners())[0]

  // Deploy the KatanaV3Pool implementation contract
  const poolImplementationFactory = new ethers.ContractFactory(poolABI, poolBytecode.object, deployer)
  const poolImplementation = await poolImplementationFactory.deploy()
  await poolImplementation.deployed()

  // Deploy the KatanaV3PoolBeacon contract
  const poolBeaconFactory = new ethers.ContractFactory(beaconABI, beaconBytecode.object, deployer)
  const beacon = await poolBeaconFactory.deploy(poolImplementation.address)

  // Deploy the KatanaV3Factory implementation contract
  const factoryImplementationFactory = new ethers.ContractFactory(v3FactoryABI, v3FactoryBytecode.object, deployer)
  const factoryImplementation = await factoryImplementationFactory.deploy()
  await factoryImplementation.deployed()

  // Deploy the KatanaV3Factory proxy contract
  const factoryProxyFactory = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer)
  const factoryProxy = await factoryProxyFactory.deploy(
    factoryImplementation.address,
    PROXY_ADMIN_ADDRESS,
    factoryImplementation.interface.encodeFunctionData("initialize", [beacon.address, GOVERNANCE_ADDRESS, TREASURY_ADDRESS])
  )
  await factoryProxy.deployed()
  const factory = factoryImplementation.attach(factoryProxy.address);

  return factory
}

async function deployPositionManager(factory: string, weth9: string) {
  const deployer = (await ethers.getSigners())[0]
  const positionManagerFactory = new ethers.ContractFactory(positionManagerABI, positionManagerBytecode.object, deployer)
  const positionManager = await positionManagerFactory.deploy(factory, weth9, ZERO_ADDRESS)
  
  const positionManagerProxyFactory = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer)
  const positionManagerProxy = await positionManagerProxyFactory.deploy(
    positionManager.address,
    PROXY_ADMIN_ADDRESS,
    positionManager.interface.encodeFunctionData("initialize")
  )

  return positionManager.attach(positionManagerProxy.address)
}

async function upgradeKatanaGovernance(factory: string, positionManager: string, router: string) {
  const deployer = (await ethers.getSigners())[0]
  const governanceFactory = await ethers.getContractFactory("KatanaGovernance", deployer)
  const governance = await governanceFactory.deploy()

  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [PROXY_ADMIN_ADDRESS],
  })
  await network.provider.send("hardhat_setBalance", [
    PROXY_ADMIN_ADDRESS,
    "0xDE0B6B3A7640000", // 1 ETH
  ]);

  const proxyAdmin = await ethers.getSigner(PROXY_ADMIN_ADDRESS)

  const proxyFactory = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer)
  await proxyFactory
    .attach(GOVERNANCE_ADDRESS)
    .connect(proxyAdmin)
    .upgradeToAndCall(
      governance.address,
      governance.interface.encodeFunctionData("initializeV2", [
        factory,
        positionManager,
        ZERO_ADDRESS,
        LEGACY_PERMISSIONED_ROUTER,
        router,
      ])
    );
}

async function initializeV3Pools(nft: any) {
  const alice = await ethers.getSigner(ALICE_ADDRESS)

  const axsContract = new ethers.Contract(AXS.address, TOKEN_ABI, alice)
  const usdcContract = new ethers.Contract(USDC.address, TOKEN_ABI, alice)

  await axsContract.approve(nft.address, MAX_UINT)
  await usdcContract.approve(nft.address, MAX_UINT)
  
  await nft.connect(alice).multicall([
    nft.interface.encodeFunctionData(
      'createAndInitializePoolIfNecessary',
      [AXS.address, WETH.address, FeeAmount.MEDIUM, encodePriceSqrt(1, 3)]
    ),
    nft.interface.encodeFunctionData('mint', [
      {
        token0: AXS.address,
        token1: WETH.address,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        fee: FeeAmount.MEDIUM,
        recipient: ALICE_ADDRESS,
        amount0Desired: expandTo18DecimalsBN(30_000),
        amount1Desired: expandTo18DecimalsBN(10_000),
        amount0Min: 0,
        amount1Min: 0,
        deadline: MAX_UINT,
      },
    ]),
    nft.interface.encodeFunctionData('refundETH')
  ], {
    value: expandTo18DecimalsBN(10_000)
  })

  await nft.connect(alice).multicall([
    nft.interface.encodeFunctionData(
      'createAndInitializePoolIfNecessary',
      [USDC.address, AXS.address, FeeAmount.MEDIUM, encodePriceSqrt(expandTo18DecimalsBN(44), expandTo6DecimalsBN(10))]
    ),
    nft.interface.encodeFunctionData('mint', [
      {
        token0: USDC.address,
        token1: AXS.address,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        fee: FeeAmount.MEDIUM,
        recipient: ALICE_ADDRESS,
        amount0Desired: expandTo6DecimalsBN(10_000),
        amount1Desired: expandTo18DecimalsBN(44_000),
        amount0Min: 0,
        amount1Min: 0,
        deadline: MAX_UINT,
      },
    ]),
  ])

  await nft.connect(alice).multicall([
    nft.interface.encodeFunctionData(
      'createAndInitializePoolIfNecessary',
      [USDC.address, WETH.address, FeeAmount.MEDIUM, encodePriceSqrt(expandTo18DecimalsBN(15), expandTo6DecimalsBN(10))]
    ),
    nft.interface.encodeFunctionData('mint', [
      {
        token0: USDC.address,
        token1: WETH.address,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        fee: FeeAmount.MEDIUM,
        recipient: ALICE_ADDRESS,
        amount0Desired: expandTo6DecimalsBN(10_000),
        amount1Desired: expandTo18DecimalsBN(15_000),
        amount0Min: 0,
        amount1Min: 0,
        deadline: MAX_UINT,
      },
    ]),
    nft.interface.encodeFunctionData('refundETH')
  ], {
    value: expandTo18DecimalsBN(15_000)
  })
}