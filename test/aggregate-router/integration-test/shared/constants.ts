import { ethers } from 'hardhat'

// Router Helpers
export const MAX_UINT = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
export const MAX_UINT160 = '0xffffffffffffffffffffffffffffffffffffffff'
export const DEADLINE = 2000000000
export const CONTRACT_BALANCE = '0x8000000000000000000000000000000000000000000000000000000000000000'
export const ALREADY_PAID = 0
export const ALICE_ADDRESS = '0xb32e9a84ae0b55b8ab715e4ac793a61b277bafa3'
export const ETH_ADDRESS = ethers.constants.AddressZero
export const ZERO_ADDRESS = ethers.constants.AddressZero
export const ONE_PERCENT_BIPS = 100
export const MSG_SENDER: string = '0x0000000000000000000000000000000000000001'
export const ADDRESS_THIS: string = '0x0000000000000000000000000000000000000002'
export const SOURCE_MSG_SENDER: boolean = true
export const SOURCE_ROUTER: boolean = false
export const GOVERNANCE_ADDRESS: string = '0x2C1726346d83cBF848bD3C2B208ec70d32a9E44a'
export const PROXY_ADMIN_ADDRESS: string = '0xa3e7d085e65cb0b916f6717da876b7be5cc92f03'
export const LEGACY_PERMISSIONED_ROUTER: string = '0xc05afc8c9353c1dd5f872eccfacd60fd5a2a9ac7'
export const TREASURY_ADDRESS: string = '0x22cefc91e9b7c0f3890ebf9527ea89053490694e'  
export const WRON_ADDRESS: string = '0xe514d9deb7966c8be0ca922de8a064264ea6bcd4'

// Constructor Params
export const V2_FACTORY_MAINNET = '0xb255d6a720bb7c39fee173ce22113397119cb930'
export const V3_FACTORY_MAINNET = '0x0000000000000000000000000000000000000000'
export const V2_INIT_CODE_HASH_MAINNET = '0xe85772d2fe4ad93037659afaee57751696456eb5dd99987e43f3cf11c6e255a2'
export const V3_INIT_CODE_HASH_MAINNET = '0xb381dabeb6037396a764deb39e57a4a3f75b641ce3e9944b1e4b18d036e322e1'
