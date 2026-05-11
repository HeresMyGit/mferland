// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MferGearNFT} from "../src/MferGearNFT.sol";
import {IBurnableToken, IERC20Payment, IGearProductPricing, MferGearStore} from "../src/MferGearStore.sol";
import {MferCoin} from "../src/MferCoin.sol";
import {MferGptToken} from "../src/MferGptToken.sol";
import {IMferGptBurnable, IMferPayment, IMferProductPricing, MferLaunchPass} from "../src/MferLaunchPass.sol";
import {MferPricing} from "../src/MferPricing.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployLocalSuite {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address payable internal constant LOCAL_TREASURY = payable(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
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
    uint256 internal constant LAUNCH_PASS_ETH_PRICE = 0.0069 ether;
    uint256 internal constant LAUNCH_PASS_MFER_PRICE = 621 ether;
    uint256 internal constant LAUNCH_PASS_MFERGPT_PRICE = 517.5 ether;
    uint256 internal constant LAUNCH_PASS_MAX_SUPPLY = 500;

    function run() external {
        address deployer = msg.sender;
        address payable treasury = LOCAL_TREASURY;

        vm.startBroadcast();
        MferCoin mfer = new MferCoin(deployer, 1_000_000 ether);
        MferGptToken mfergpt = new MferGptToken(deployer, 1_000_000 ether);
        MferGearNFT gear = new MferGearNFT("mferland gear", "MGEAR", deployer);
        MferPricing pricing = new MferPricing(deployer);
        pricing.setSeason0PassPrice(LAUNCH_PASS_ETH_PRICE, LAUNCH_PASS_MFER_PRICE, LAUNCH_PASS_MFERGPT_PRICE);
        pricing.setGearPrice(BEATER_DECK, GEAR_ETH_PRICE, GEAR_MFER_PRICE, GEAR_MFERGPT_PRICE);
        pricing.setGearPrice(ROAD_LID, ROAD_LID_ETH_PRICE, ROAD_LID_MFER_PRICE, ROAD_LID_MFERGPT_PRICE);
        pricing.setGearPrice(
            LUCKY_LIGHTER, LUCKY_LIGHTER_ETH_PRICE, LUCKY_LIGHTER_MFER_PRICE, LUCKY_LIGHTER_MFERGPT_PRICE
        );
        new MferLaunchPass(
            "mferland Season 0 Pass",
            "MFPASS0",
            IMferPayment(address(mfer)),
            IMferGptBurnable(address(mfergpt)),
            IMferProductPricing(address(pricing)),
            treasury,
            deployer,
            LAUNCH_PASS_MAX_SUPPLY
        );
        MferGearStore store =
            new MferGearStore(
                gear,
                IGearProductPricing(address(pricing)),
                IERC20Payment(address(mfer)),
                IBurnableToken(address(mfergpt)),
                treasury,
                deployer
            );

        gear.setMinter(address(store));
        store.listGear(BEATER_DECK);
        store.listGear(ROAD_LID);
        store.listGear(LUCKY_LIGHTER);
        vm.stopBroadcast();
    }
}
