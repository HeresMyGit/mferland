// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MferGearNFT} from "../src/MferGearNFT.sol";
import {IERC20Payment, IGearProductPricing, MferGearStore} from "../src/MferGearStore.sol";
import {MferCoin} from "../src/MferCoin.sol";
import {FishingPond} from "../src/FishingPond.sol";
import {MferGptToken} from "../src/MferGptToken.sol";
import {IMferPayment, IMferProductPricing, MferLaunchPass} from "../src/MferLaunchPass.sol";
import {ILocalSwapToken, LocalMferGptSwapRouter} from "../src/LocalMferGptSwapRouter.sol";
import {MferPricing} from "../src/MferPricing.sol";
import {OnchainFishingRod} from "../src/OnchainFishingRod.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployLocalSuite {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address payable internal constant LOCAL_TREASURY = payable(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
    address internal constant LOCAL_ALLOWLIST_TESTER = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address internal constant LOCAL_REQUESTED_TEST_WALLET = 0x0a8138C495Cd47367E635B94FEB7612A230221a4;
    address internal constant MFERGPT_BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint16 internal constant BEATER_DECK = 1;
    uint16 internal constant ROAD_LID = 2;
    uint16 internal constant LUCKY_LIGHTER = 3;
    uint256 internal constant GEAR_ETH_PRICE = 0.01 ether;
    uint256 internal constant GEAR_MFER_PRICE = 90 ether;
    uint256 internal constant GEAR_MFERGPT_PRICE = 75 ether;
    uint256 internal constant ROAD_LID_ETH_PRICE = 0.012 ether;
    uint256 internal constant ROAD_LID_MFER_PRICE = 112.5 ether;
    uint256 internal constant ROAD_LID_MFERGPT_PRICE = 93.75 ether;
    uint256 internal constant LUCKY_LIGHTER_ETH_PRICE = 0.0069 ether;
    uint256 internal constant LUCKY_LIGHTER_MFER_PRICE = 62.1 ether;
    uint256 internal constant LUCKY_LIGHTER_MFERGPT_PRICE = 51.75 ether;
    bytes32 internal constant TRAIT_CHANGE_PRODUCT_ID = keccak256("trait-change");
    uint256 internal constant TRAIT_CHANGE_ETH_PRICE = 0.01 ether;
    uint256 internal constant TRAIT_CHANGE_MFER_PRICE = 90 ether;
    uint256 internal constant TRAIT_CHANGE_MFERGPT_PRICE = 75 ether;
    uint256 internal constant LAUNCH_PASS_ETH_PRICE = 0.0069 ether;
    uint256 internal constant LAUNCH_PASS_MFER_PRICE = 621 ether;
    uint256 internal constant LAUNCH_PASS_MFERGPT_PRICE = 517.5 ether;
    uint256 internal constant LAUNCH_PASS_MAX_SUPPLY = 500;
    uint256 internal constant LOCAL_MOCK_TOKEN_SUPPLY = 1_000_000_000_000 ether;
    uint256 internal constant LOCAL_SWAP_MFERGPT_PER_ETH = 1_000_000_000 ether;
    uint256 internal constant LOCAL_SWAP_MFERGPT_LIQUIDITY = 250_000_000_000 ether;
    uint256 internal constant FISHING_POND_DAILY_WALLET_CAP = 3;
    uint256 internal constant FISHING_POND_DAILY_GLOBAL_CAP = 50;
    uint256 internal constant ONCHAIN_FISHING_ROD_MFERGPT_PRICE = 25_000_000 ether;
    string internal constant LOCAL_FISHING_ROD_BASE_URI = "https://game.mfergpt.lol/metadata/onchain-fishing-rod/";

    function run() external {
        address deployer = msg.sender;
        address payable treasury = LOCAL_TREASURY;

        vm.startBroadcast();
        MferCoin mfer = new MferCoin(deployer, LOCAL_MOCK_TOKEN_SUPPLY);
        MferGptToken mfergpt = new MferGptToken(deployer, LOCAL_MOCK_TOKEN_SUPPLY);
        LocalMferGptSwapRouter swapRouter =
            new LocalMferGptSwapRouter(ILocalSwapToken(address(mfergpt)), treasury, LOCAL_SWAP_MFERGPT_PER_ETH);
        MferGearNFT gear = new MferGearNFT("mferland gear", "MGEAR", deployer);
        MferPricing pricing = new MferPricing(deployer);
        OnchainFishingRod fishingRod =
            new OnchainFishingRod("mferland Onchain Fishing Rod", "MROD", LOCAL_FISHING_ROD_BASE_URI, deployer);
        pricing.setSeason0PassPrice(LAUNCH_PASS_ETH_PRICE, LAUNCH_PASS_MFER_PRICE, LAUNCH_PASS_MFERGPT_PRICE);
        pricing.setGearPrice(BEATER_DECK, GEAR_ETH_PRICE, GEAR_MFER_PRICE, GEAR_MFERGPT_PRICE);
        pricing.setGearPrice(ROAD_LID, ROAD_LID_ETH_PRICE, ROAD_LID_MFER_PRICE, ROAD_LID_MFERGPT_PRICE);
        pricing.setGearPrice(
            LUCKY_LIGHTER, LUCKY_LIGHTER_ETH_PRICE, LUCKY_LIGHTER_MFER_PRICE, LUCKY_LIGHTER_MFERGPT_PRICE
        );
        pricing.setProductPrice(
            TRAIT_CHANGE_PRODUCT_ID, TRAIT_CHANGE_ETH_PRICE, TRAIT_CHANGE_MFER_PRICE, TRAIT_CHANGE_MFERGPT_PRICE
        );
        new MferLaunchPass(
            "mferland Season 0 Pass",
            "MFPASS0",
            IMferPayment(address(mfer)),
            IMferPayment(address(mfergpt)),
            IMferProductPricing(address(pricing)),
            treasury,
            deployer,
            LAUNCH_PASS_MAX_SUPPLY
        );
        new FishingPond(deployer, deployer, FISHING_POND_DAILY_WALLET_CAP, FISHING_POND_DAILY_GLOBAL_CAP);
        MferGearStore store =
            new MferGearStore(
                gear,
                IGearProductPricing(address(pricing)),
                IERC20Payment(address(mfer)),
                IERC20Payment(address(mfergpt)),
                treasury,
                deployer
            );

        gear.setMinter(address(store));
        store.listGear(BEATER_DECK);
        store.listGear(ROAD_LID);
        store.listGear(LUCKY_LIGHTER);
        fishingRod.setMintPayment(address(mfergpt), MFERGPT_BURN_ADDRESS, ONCHAIN_FISHING_ROD_MFERGPT_PRICE);
        fishingRod.mint(deployer);
        if (deployer != treasury) fishingRod.mint(treasury);
        if (deployer != LOCAL_ALLOWLIST_TESTER && treasury != LOCAL_ALLOWLIST_TESTER) fishingRod.mint(LOCAL_ALLOWLIST_TESTER);
        if (
            deployer != LOCAL_REQUESTED_TEST_WALLET && treasury != LOCAL_REQUESTED_TEST_WALLET
                && LOCAL_ALLOWLIST_TESTER != LOCAL_REQUESTED_TEST_WALLET
        ) {
            fishingRod.mint(LOCAL_REQUESTED_TEST_WALLET);
        }
        mfergpt.transfer(address(swapRouter), LOCAL_SWAP_MFERGPT_LIQUIDITY);
        vm.stopBroadcast();
    }
}
