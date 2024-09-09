// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "forge-std/Test.sol";
import { ERC20 } from "solmate/tokens/ERC20.sol";
import { KatanaV2Test } from "../KatanaV2.t.sol";

contract V2WronAxs is KatanaV2Test {
  ERC20 constant AXS = ERC20(0x97a9107C1793BC407d6F527b77e7fff4D812bece);

  function token0() internal pure override returns (address) {
    return address(AXS);
  }

  function token1() internal pure override returns (address) {
    return address(WETH9);
  }
}
