// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FishingPond} from "../src/FishingPond.sol";

interface VmDeployFishingPond {
    function envAddress(string calldata name) external returns (address);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployFishingPond {
    VmDeployFishingPond internal constant vm =
        VmDeployFishingPond(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (FishingPond pond) {
        address admin = vm.envAddress("FISHING_POND_ADMIN");
        address awardSigner = vm.envAddress("FISHING_POND_AWARD_SIGNER");
        uint256 walletDailyCap = vm.envUint("FISHING_POND_WALLET_DAILY_CAP");
        uint256 globalDailyCap = vm.envUint("FISHING_POND_GLOBAL_DAILY_CAP");

        vm.startBroadcast();
        pond = new FishingPond(admin, awardSigner, walletDailyCap, globalDailyCap);
        vm.stopBroadcast();
    }
}
