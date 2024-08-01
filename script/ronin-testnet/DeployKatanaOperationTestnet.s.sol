// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import { RouterParameters } from "@katana/operation-contracts/aggregate-router/base/RouterImmutables.sol";
import { UpgradeKatanaGovernance } from "../UpgradeKatanaGovernance.s.sol";

contract DeployKatanaOperationTestnet is UpgradeKatanaGovernance {
  function setUp() public override {
    params = RouterParameters({
      permit2: 0x000000000022D473030F116dDEE9F6B43aC78BA3,
      weth9: 0xA959726154953bAe111746E265E6d754F48570E6,
      governance: 0x247F12836A421CDC5e22B93Bf5A9AAa0f521f986,
      v2Factory: 0x86587380C4c815Ba0066c90aDB2B45CC9C15E72c,
      v3Factory: 0x249F235bB9Fed56131B7E44Fe453E71b422B0A42,
      pairInitCodeHash: 0x1cc97ead4d6949b7a6ecb28652b21159b9fd5608ae51a1960224099caab07dca,
      poolInitCodeHash: 0x97ee45181a4d14c00cdcc956fefebfa98f8c8744e3fe6d83e1861dc77ff40a99
    });

    proxyAdmin = 0x505d91E8fd2091794b45b27f86C045529fa92CD7;

    nonfungiblePositionManager = 0x131A3C134EB0a957A69775A122e3688EdF8Ce05A;
    katanaGovernanceProxy = 0x247F12836A421CDC5e22B93Bf5A9AAa0f521f986;

    vm.rememberKey(vm.envUint("TESTNET_PK"));

    super.setUp();
  }
}
