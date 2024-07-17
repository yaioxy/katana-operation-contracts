// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { IGeneralConfig } from "@fdk/interfaces/IGeneralConfig.sol";

interface ISharedArgument is IGeneralConfig {
  struct SharedParameter {
    bool undefined;
  }

  function sharedArguments() external view returns (SharedParameter memory param);
}
