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
      v3Factory: 0xa6d02D530e870A9753a2E2EbEb03Ff05b501587d,
      pairInitCodeHash: 0x1cc97ead4d6949b7a6ecb28652b21159b9fd5608ae51a1960224099caab07dca,
      poolInitCodeHash: 0xb381dabeb6037396a764deb39e57a4a3f75b641ce3e9944b1e4b18d036e322e1
    });

    proxyAdmin = 0x505d91E8fd2091794b45b27f86C045529fa92CD7;

    nonfungiblePositionManager = 0xe14cd235Ce8dCA3dD04db01E788671f25675c25A;
    v3Migrator = 0xAb520070A546E81E155Ce3c927366bbB3e889648;
    legacyPermissionedRouter = 0x3BD36748D17e322cFB63417B059Bcc1059012D83;
    katanaGovernanceProxy = 0x247F12836A421CDC5e22B93Bf5A9AAa0f521f986;

    vm.rememberKey(vm.envUint("TESTNET_PK"));

    super.setUp();
  }
}
