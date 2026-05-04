// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMferGptBurnable, IMferPayment, MferLaunchPass} from "../src/MferLaunchPass.sol";

interface VmDeploySeasonPass {
    function envAddress(string calldata name) external returns (address);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeploySeasonPass {
    VmDeploySeasonPass internal constant vm =
        VmDeploySeasonPass(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (MferLaunchPass launchPass) {
        address mfer = vm.envAddress("MFER_TOKEN");
        address mfergpt = vm.envAddress("MFERGPT_TOKEN");
        address payable treasury = payable(vm.envAddress("PASS_TREASURY"));
        address owner = vm.envAddress("PASS_OWNER");
        uint256 ethPrice = vm.envUint("PASS_ETH_PRICE_WEI");
        uint256 mferPrice = vm.envUint("PASS_MFER_PRICE_WEI");
        uint256 mferGptPrice = vm.envUint("PASS_MFERGPT_PRICE_WEI");
        uint256 maxSupply = vm.envUint("PASS_MAX_SUPPLY");

        vm.startBroadcast();
        launchPass = new MferLaunchPass(
            "mferland Season 0 Pass",
            "MFPASS0",
            IMferPayment(mfer),
            IMferGptBurnable(mfergpt),
            treasury,
            owner,
            ethPrice,
            mferPrice,
            mferGptPrice,
            maxSupply
        );
        vm.stopBroadcast();
    }
}
