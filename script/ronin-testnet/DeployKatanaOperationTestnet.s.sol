// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import { RouterParameters } from "@katana/operation-contracts/aggregate-router/base/RouterImmutables.sol";
import { UpgradeKatanaGovernance } from "../UpgradeKatanaGovernance.s.sol";

contract DeployKatanaOperationTestnet is UpgradeKatanaGovernance {
  function setUp() public override {
    params = RouterParameters({
      permit2: 0x1Bd5aA9818D94DcABfE02794553e76f7Cceea0cd,
      weth9: 0xA959726154953bAe111746E265E6d754F48570E6,
      governance: 0x247F12836A421CDC5e22B93Bf5A9AAa0f521f986,
      v2Factory: 0x86587380C4c815Ba0066c90aDB2B45CC9C15E72c,
      v3Factory: 0x7AB00BE3a34325d4DFfDe22d9440EeA6dd3d289F,
      pairInitCodeHash: 0x1cc97ead4d6949b7a6ecb28652b21159b9fd5608ae51a1960224099caab07dca,
      poolInitCodeHash: 0xa1b5e7ab94049a77a9dcd7b20ddad1241d9549a08b0fb1e53cfb5b73c320b483
    });

    proxyAdmin = 0x505d91E8fd2091794b45b27f86C045529fa92CD7;

    nonfungiblePositionManager = 0xdCad4D3a77F0E971C2372Be922dF02Cff1e81f5B;
    v3Migrator = 0x3b1C5F1F7C6421829044fc8afA59953f095F6ed3;
    katanaGovernanceProxy = 0x247F12836A421CDC5e22B93Bf5A9AAa0f521f986;

    vm.rememberKey(vm.envUint("TESTNET_PK"));

    super.setUp();
  }
}
