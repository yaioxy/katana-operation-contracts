// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "forge-std/Test.sol";
import { Permit2 } from "permit2/src/Permit2.sol";
import { ProxyAdmin } from "@openzeppelin-contracts-4.7.0/contracts/proxy/transparent/ProxyAdmin.sol";
import { TransparentUpgradeableProxy } from
  "@openzeppelin-contracts-4.7.0/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { ERC20 } from "solmate/tokens/ERC20.sol";
import { IKatanaV2Factory } from "src/governance/interfaces/IKatanaV2Factory.sol";
import { IKatanaV2Pair } from "@katana/v3-contracts/periphery/interfaces/IKatanaV2Pair.sol";
import { AggregateRouter } from "../../src/aggregate-router/AggregateRouter.sol";
import { Payments } from "../../src/aggregate-router/modules/Payments.sol";
import { Constants } from "../../src/aggregate-router/libraries/Constants.sol";
import { Commands } from "../../src/aggregate-router/libraries/Commands.sol";
import { RouterParameters } from "../../src/aggregate-router/base/RouterImmutables.sol";
import { IKatanaGovernance } from "@katana/v3-contracts/external/interfaces/IKatanaGovernance.sol";

abstract contract KatanaV2Test is Test {
  address constant RECIPIENT = address(10);
  uint256 constant AMOUNT = 1 ether;
  uint256 constant BALANCE = 100000 ether;
  IKatanaV2Factory constant FACTORY = IKatanaV2Factory(0xB255D6A720BB7c39fee173cE22113397119cB930);
  ERC20 constant WETH9 = ERC20(0xe514d9DEB7966c8BE0ca922de8a064264eA6bcd4);
  address constant FROM = address(1234);
  address constant GOVERNANCE = 0x2C1726346d83cBF848bD3C2B208ec70d32a9E44a;
  address constant ADMIN = 0x9D05D1F5b0424F8fDE534BC196FFB6Dd211D902a;
  address constant PROXY_ADMIN = 0xA3e7d085E65CB0B916f6717da876b7bE5cC92f03;
  address constant LEGACY_PERMISSIONED_ROUTER = 0xC05AFC8c9353c1dd5f872EcCFaCD60fd5A2a9aC7;
  Permit2 PERMIT2;

  AggregateRouter router;

  function setUp() public virtual {
    vm.createSelectFork("ronin-mainnet");
    PERMIT2 = new Permit2();
    setUpTokens();

    RouterParameters memory params = RouterParameters({
      permit2: address(PERMIT2),
      weth9: address(WETH9),
      governance: GOVERNANCE,
      v2Factory: address(FACTORY),
      v3Factory: address(0),
      pairInitCodeHash: bytes32(0xe85772d2fe4ad93037659afaee57751696456eb5dd99987e43f3cf11c6e255a2),
      poolInitCodeHash: bytes32(0)
    });
    router = new AggregateRouter(params);
    PERMIT2.grantSpender(address(router));

    address governanceLogic = deployCode("KatanaGovernance");
    vm.prank(ADMIN);
    ProxyAdmin(PROXY_ADMIN).upgradeAndCall(
      TransparentUpgradeableProxy(payable(GOVERNANCE)),
      governanceLogic,
      abi.encodeWithSignature(
        "initializeV2(address,address,address,address,address)",
        address(0),
        address(0),
        address(0),
        LEGACY_PERMISSIONED_ROUTER,
        address(router)
      )
    );

    // pair doesn't exist, make a mock one
    if (FACTORY.getPair(token0(), token1()) == address(0)) {
      address[] memory allowedsPlaceHolder;
      bool[] memory statusesPlaceHolder;
      vm.prank(ADMIN);
      IKatanaGovernance(GOVERNANCE).setPermission(
        address(token0()), type(uint40).max, allowedsPlaceHolder, statusesPlaceHolder
      );
      vm.prank(ADMIN);
      IKatanaGovernance(GOVERNANCE).setPermission(
        address(token1()), type(uint40).max, allowedsPlaceHolder, statusesPlaceHolder
      );
      vm.prank(GOVERNANCE);
      address pair = FACTORY.createPair(token0(), token1());
      deal(token0(), pair, 100 ether);
      deal(token1(), pair, 100 ether);
      IKatanaV2Pair(pair).sync();
    }

    vm.startPrank(FROM);
    deal(FROM, BALANCE);
    deal(token0(), FROM, BALANCE);
    deal(token1(), FROM, BALANCE);
    ERC20(token0()).approve(address(PERMIT2), type(uint256).max);
    ERC20(token1()).approve(address(PERMIT2), type(uint256).max);
    PERMIT2.approve(token0(), address(router), type(uint160).max, type(uint48).max);
    PERMIT2.approve(token1(), address(router), type(uint160).max, type(uint48).max);
  }

  function testExactInput0For1() public {
    bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
    address[] memory path = new address[](2);
    path[0] = token0();
    path[1] = token1();
    bytes[] memory inputs = new bytes[](1);
    inputs[0] = abi.encode(Constants.MSG_SENDER, AMOUNT, 0, path, true);

    router.execute(commands, inputs);
    assertEq(ERC20(token0()).balanceOf(FROM), BALANCE - AMOUNT);
    assertGt(ERC20(token1()).balanceOf(FROM), BALANCE);
  }

  function testExactInput1For0() public {
    bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
    address[] memory path = new address[](2);
    path[0] = token1();
    path[1] = token0();
    bytes[] memory inputs = new bytes[](1);
    inputs[0] = abi.encode(Constants.MSG_SENDER, AMOUNT, 0, path, true);

    router.execute(commands, inputs);
    assertEq(ERC20(token1()).balanceOf(FROM), BALANCE - AMOUNT);
    assertGt(ERC20(token0()).balanceOf(FROM), BALANCE);
  }

  function testExactInput0For1FromRouter() public {
    bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
    deal(token0(), address(router), AMOUNT);
    address[] memory path = new address[](2);
    path[0] = token0();
    path[1] = token1();
    bytes[] memory inputs = new bytes[](1);
    inputs[0] = abi.encode(Constants.MSG_SENDER, AMOUNT, 0, path, false);

    router.execute(commands, inputs);
    assertGt(ERC20(token1()).balanceOf(FROM), BALANCE);
  }

  function testExactInput1For0FromRouter() public {
    bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_IN)));
    deal(token1(), address(router), AMOUNT);
    address[] memory path = new address[](2);
    path[0] = token1();
    path[1] = token0();
    bytes[] memory inputs = new bytes[](1);
    inputs[0] = abi.encode(Constants.MSG_SENDER, AMOUNT, 0, path, false);

    router.execute(commands, inputs);
    assertGt(ERC20(token0()).balanceOf(FROM), BALANCE);
  }

  function testExactOutput0For1() public {
    bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_OUT)));
    address[] memory path = new address[](2);
    path[0] = token0();
    path[1] = token1();
    bytes[] memory inputs = new bytes[](1);
    inputs[0] = abi.encode(Constants.MSG_SENDER, AMOUNT, type(uint256).max, path, true);

    router.execute(commands, inputs);
    assertLt(ERC20(token0()).balanceOf(FROM), BALANCE);
    assertGe(ERC20(token1()).balanceOf(FROM), BALANCE + AMOUNT);
  }

  function testExactOutput1For0() public {
    bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_OUT)));
    address[] memory path = new address[](2);
    path[0] = token1();
    path[1] = token0();
    bytes[] memory inputs = new bytes[](1);
    inputs[0] = abi.encode(Constants.MSG_SENDER, AMOUNT, type(uint256).max, path, true);

    router.execute(commands, inputs);
    assertLt(ERC20(token1()).balanceOf(FROM), BALANCE);
    assertGe(ERC20(token0()).balanceOf(FROM), BALANCE + AMOUNT);
  }

  function testExactOutput0For1FromRouter() public {
    bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_OUT)));
    deal(token0(), address(router), BALANCE);
    address[] memory path = new address[](2);
    path[0] = token0();
    path[1] = token1();
    bytes[] memory inputs = new bytes[](1);
    inputs[0] = abi.encode(Constants.MSG_SENDER, AMOUNT, type(uint256).max, path, false);

    router.execute(commands, inputs);
    assertGe(ERC20(token1()).balanceOf(FROM), BALANCE + AMOUNT);
  }

  function testExactOutput1For0FromRouter() public {
    bytes memory commands = abi.encodePacked(bytes1(uint8(Commands.V2_SWAP_EXACT_OUT)));
    deal(token1(), address(router), BALANCE);
    address[] memory path = new address[](2);
    path[0] = token1();
    path[1] = token0();
    bytes[] memory inputs = new bytes[](1);
    inputs[0] = abi.encode(Constants.MSG_SENDER, AMOUNT, type(uint256).max, path, false);

    router.execute(commands, inputs);
    assertGe(ERC20(token0()).balanceOf(FROM), BALANCE + AMOUNT);
  }

  function token0() internal virtual returns (address);
  function token1() internal virtual returns (address);

  function setUpTokens() internal virtual { }
}
