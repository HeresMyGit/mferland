// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMferPayment, IMferProductPricing, MferLaunchPass} from "../src/MferLaunchPass.sol";
import {MferPricing} from "../src/MferPricing.sol";

interface VmDeploySeasonPass {
    function envAddress(string calldata name) external returns (address);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeploySeasonPass {
    VmDeploySeasonPass internal constant vm =
        VmDeploySeasonPass(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (MferPricing pricing, MferLaunchPass launchPass) {
        address deployer = msg.sender;
        address mfer = vm.envAddress("MFER_TOKEN");
        address mfergpt = vm.envAddress("MFERGPT_TOKEN");
        address payable treasury = payable(vm.envAddress("PASS_TREASURY"));
        address owner = vm.envAddress("PASS_OWNER");
        uint256 ethPrice = vm.envUint("PASS_ETH_PRICE_WEI");
        uint256 mferPrice = vm.envUint("PASS_MFER_PRICE_WEI");
        uint256 mferGptPrice = vm.envUint("PASS_MFERGPT_PRICE_WEI");
        uint256 maxSupply = vm.envUint("PASS_MAX_SUPPLY");

        vm.startBroadcast();
        pricing = new MferPricing(deployer);
        pricing.setSeason0PassPrice(ethPrice, mferPrice, mferGptPrice);
        launchPass = new MferLaunchPass(
            "mferland Season 0 Pass",
            "MFPASS0",
            IMferPayment(mfer),
            IMferPayment(mfergpt),
            IMferProductPricing(address(pricing)),
            treasury,
            owner,
            maxSupply
        );
        if (owner != deployer) pricing.transferOwnership(owner);
        vm.stopBroadcast();
    }
}
