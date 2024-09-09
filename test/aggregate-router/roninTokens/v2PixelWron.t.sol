// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "forge-std/Test.sol";
import { ERC20 } from "solmate/tokens/ERC20.sol";
import { KatanaV2Test } from "../KatanaV2.t.sol";

contract V2PixelWron is KatanaV2Test {
  ERC20 constant PIXEL = ERC20(0x7EAe20d11Ef8c779433Eb24503dEf900b9d28ad7);

  function token0() internal pure override returns (address) {
    return address(WETH9);
  }

  function token1() internal pure override returns (address) {
    return address(PIXEL);
  }
}
