// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { console } from "forge-std/console.sol";
import { StdStyle } from "forge-std/StdStyle.sol";

import { TNetwork, TContract } from "@fdk/types/Types.sol";
import { DefaultNetwork } from "@fdk/utils/DefaultNetwork.sol";
import { DefaultContract } from "@fdk/utils/DefaultContract.sol";

import { LibSig } from "@fdk/libraries/LibSig.sol";
import { LibProxy } from "@fdk/libraries/LibProxy.sol";
import { LibSharedAddress } from "@fdk/libraries/LibSharedAddress.sol";

import { ISharedArgument } from "./interfaces/ISharedArgument.sol";
import { Network } from "./utils/Network.sol";
import { Contract } from "./utils/Contract.sol";

import { GeneralConfig } from "./GeneralConfig.sol";
import { Migration } from "./Migration.s.sol";

import { LibErrorHandler } from "@contract-libs/LibErrorHandler.sol";

import { LibString } from "@solady/utils/LibString.sol";
import { GasBurnerLib } from "@solady/utils/GasBurnerLib.sol";
import { JSONParserLib } from "@solady/utils/JSONParserLib.sol";
