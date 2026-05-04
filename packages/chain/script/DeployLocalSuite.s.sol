// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MferGearNFT} from "../src/MferGearNFT.sol";
import {IBurnableToken, IERC20Payment, MferGearStore} from "../src/MferGearStore.sol";
import {MferCoin} from "../src/MferCoin.sol";
import {MferGptToken} from "../src/MferGptToken.sol";
import {IMferGptBurnable, MferLaunchPass} from "../src/MferLaunchPass.sol";
import {MferGold} from "../src/MferGold.sol";
import {QuestRewardDistributor} from "../src/QuestRewardDistributor.sol";

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
    uint256 internal constant GEAR_TOKEN_PRICE = 100 ether;
    uint256 internal constant ROAD_LID_ETH_PRICE = 0.012 ether;
    uint256 internal constant ROAD_LID_TOKEN_PRICE = 125 ether;
    uint256 internal constant LUCKY_LIGHTER_ETH_PRICE = 0.0069 ether;
    uint256 internal constant LUCKY_LIGHTER_TOKEN_PRICE = 69 ether;
    uint256 internal constant LAUNCH_PASS_ETH_PRICE = 0.0069 ether;
    uint256 internal constant LAUNCH_PASS_MFERGPT_PRICE = 690 ether;
    uint256 internal constant LAUNCH_PASS_MAX_SUPPLY = 500;

    function run() external {
        address deployer = msg.sender;
        address payable treasury = LOCAL_TREASURY;

        vm.startBroadcast();
        MferGold gold = new MferGold("mferland gold", "GOLD", deployer);
        MferCoin mfer = new MferCoin(deployer, 1_000_000 ether);
        MferGptToken mfergpt = new MferGptToken(deployer, 1_000_000 ether);
        MferGearNFT gear = new MferGearNFT("mferland gear", "MGEAR", deployer);
        QuestRewardDistributor rewards = new QuestRewardDistributor(gold, deployer);
        new MferLaunchPass(
            "mferland Season 0 Pass",
            "MFPASS0",
            IMferGptBurnable(address(mfergpt)),
            treasury,
            deployer,
            LAUNCH_PASS_ETH_PRICE,
            LAUNCH_PASS_MFERGPT_PRICE,
            LAUNCH_PASS_MAX_SUPPLY
        );
        MferGearStore store = new MferGearStore(
            gear, gold, IERC20Payment(address(mfer)), IBurnableToken(address(mfergpt)), treasury, deployer
        );

        gold.setMinter(address(rewards), true);
        gear.setMinter(address(store));
        store.listGear(BEATER_DECK, GEAR_ETH_PRICE, GEAR_TOKEN_PRICE);
        store.listGear(ROAD_LID, ROAD_LID_ETH_PRICE, ROAD_LID_TOKEN_PRICE);
        store.listGear(LUCKY_LIGHTER, LUCKY_LIGHTER_ETH_PRICE, LUCKY_LIGHTER_TOKEN_PRICE);
        vm.stopBroadcast();
    }
}
