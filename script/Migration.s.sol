// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { BaseMigration } from "@fdk/BaseMigration.s.sol";
import { DefaultNetwork } from "@fdk/utils/DefaultNetwork.sol";
import { ISharedArgument } from "./interfaces/ISharedArgument.sol";
import { Network } from "./utils/Network.sol";

contract Migration is BaseMigration {
  ISharedArgument public constant vme = ISharedArgument(address(CONFIG));

  function _configByteCode() internal virtual override returns (bytes memory) {
    return vm.getCode("GeneralConfig.sol:GeneralConfig");
  }

  function _sharedArguments() internal virtual override returns (bytes memory rawArgs) {
    ISharedArgument.SharedParameter memory param;

    if (network() == Network.Goerli.key()) {
      // Undefined
    } else if (network() == DefaultNetwork.RoninTestnet.key()) {
      // Undefined
    } else if (network() == DefaultNetwork.Local.key()) {
      // Undefined
    } else {
      revert("Migration: Network Unknown Shared Parameters Unimplemented!");
    }

    rawArgs = abi.encode(param);
  }
}
