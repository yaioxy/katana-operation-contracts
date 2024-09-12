import "@nomicfoundation/hardhat-foundry";
import 'hardhat-typechain'
import '@nomiclabs/hardhat-ethers'
import '@nomicfoundation/hardhat-chai-matchers'
import {
	HardhatUserConfig,
	NetworkUserConfig,
} from "hardhat/types";
import * as dotenv from 'dotenv';

dotenv.config();

const { TESTNET_URL, MAINNET_URL } = process.env;

const testnet: NetworkUserConfig = {
	chainId: 2021,
	url: TESTNET_URL || "https://saigon-testnet.roninchain.com/rpc",
};

const mainnet: NetworkUserConfig = {
	chainId: 2020,
	url: MAINNET_URL || "https://api.roninchain.com/rpc",
};

const PERMIT2X_SETTINGS = {
	version: '0.8.17',
	settings: {
		viaIR: true,
		optimizer: {
			enabled: true,
			runs: 1_000_000,
		},
	},
}

const GOVERNANCE_SETTINGS = {
	version: '0.8.26',
	settings: {
		optimizer: {
			enabled: true,
			runs: 1_000_000,
		},
	},
}
const config: HardhatUserConfig = {
	paths: {
		sources: "./src",
	},

	networks: {
		"ronin-testnet": testnet,
		"ronin-mainnet": mainnet,
	},

	solidity: {
		compilers: [PERMIT2X_SETTINGS],
    overrides: {
			"src/governance/KatanaGovernance.sol": GOVERNANCE_SETTINGS,
			"@openzeppelin/contracts/utils/structs/EnumerableSet.sol": GOVERNANCE_SETTINGS,
			"@openzeppelin/contracts/utils/Address.sol": GOVERNANCE_SETTINGS,
			"@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol": GOVERNANCE_SETTINGS,
			"@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol": GOVERNANCE_SETTINGS,
			"@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol": GOVERNANCE_SETTINGS
		},
  },
	
	mocha: {
    timeout: 200000,
  },
};

export default config;
