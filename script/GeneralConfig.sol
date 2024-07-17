// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { BaseGeneralConfig } from "@fdk/BaseGeneralConfig.sol";
import { Contract } from "./utils/Contract.sol";
import { Network } from "./utils/Network.sol";

contract GeneralConfig is BaseGeneralConfig {
  constructor() BaseGeneralConfig("", "deployments/") { }

  function _setUpNetworks() internal virtual override {
    setNetworkInfo(
      Network.Goerli.chainId(),
      Network.Goerli.key(),
      Network.Goerli.chainAlias(),
      Network.Goerli.deploymentDir(),
      Network.Goerli.envLabel(),
      Network.Goerli.explorer()
    );
    setNetworkInfo(
      Network.EthMainnet.chainId(),
      Network.EthMainnet.key(),
      Network.EthMainnet.chainAlias(),
      Network.EthMainnet.deploymentDir(),
      Network.EthMainnet.envLabel(),
      Network.EthMainnet.explorer()
    );
    setNetworkInfo(
      Network.RoninDevnet.chainId(),
      Network.RoninDevnet.key(),
      Network.RoninDevnet.chainAlias(),
      Network.RoninDevnet.deploymentDir(),
      Network.RoninDevnet.envLabel(),
      Network.RoninDevnet.explorer()
    );
  }

  function _setUpContracts() internal virtual override {
    _mapContractName(Contract.Counter);
  }

  function _mapContractName(Contract contractEnum) internal {
    _contractNameMap[contractEnum.key()] = contractEnum.name();
  }
}
