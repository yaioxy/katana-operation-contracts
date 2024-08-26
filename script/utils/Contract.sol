// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { LibString, TContract } from "@fdk/types/Types.sol";

enum Contract {
  Counter
}

using { key, name } for Contract global;

function key(Contract contractEnum) pure returns (TContract) {
  return TContract.wrap(LibString.packOne(name(contractEnum)));
}

function name(Contract contractEnum) pure returns (string memory) {
  if (contractEnum == Contract.Counter) return "Counter";
  revert("Contract: Unknown contract");
}
