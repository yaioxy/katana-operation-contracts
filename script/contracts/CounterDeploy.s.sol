// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { Counter } from "src/Counter.sol";
import { Migration } from "script/Migration.s.sol";
import { Contract } from "script/utils/Contract.sol";

contract CounterDeploy is Migration {
  function run() public returns (Counter instance) {
    instance = Counter(_deployImmutable(Contract.Counter.key()));
  }
}
