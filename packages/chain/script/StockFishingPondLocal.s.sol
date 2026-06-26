// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {FishingPond} from "../src/FishingPond.sol";

interface Vm {
    function envAddress(string calldata name) external returns (address);
    function startBroadcast(address sender) external;
    function stopBroadcast() external;
}

contract StockFishingPondLocal {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address internal constant DEPOSITOR = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    function run() external {
        FishingPond pond = FishingPond(vm.envAddress("FISHING_POND_ADDRESS"));

        vm.startBroadcast(DEPLOYER);
        LocalPondStock721 nft721 = new LocalPondStock721();
        LocalPondStock1155 nft1155 = new LocalPondStock1155();
        nft721.mint(DEPOSITOR, 9001);
        nft721.mint(DEPOSITOR, 9002);
        nft721.mint(DEPOSITOR, 9003);
        nft721.mint(DEPOSITOR, 9004);
        nft1155.mint(DEPOSITOR, 9101, 5);
        vm.stopBroadcast();

        vm.startBroadcast(DEPOSITOR);
        nft721.approve(address(pond), 9001);
        pond.depositERC721(address(nft721), 9001);
        nft721.approve(address(pond), 9002);
        pond.depositERC721(address(nft721), 9002);
        nft721.approve(address(pond), 9003);
        pond.depositERC721(address(nft721), 9003);
        nft721.approve(address(pond), 9004);
        pond.depositERC721(address(nft721), 9004);
        nft1155.setApprovalForAll(address(pond), true);
        pond.depositERC1155(address(nft1155), 9101, 5);
        vm.stopBroadcast();
    }
}

contract LocalPondStock721 is ERC721 {
    constructor() ERC721("Local Fishing Pond Stock", "LFP721") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function tokenURI(uint256 tokenId) public pure override returns (string memory) {
        return string.concat(
            "data:application/json,{\"name\":\"Local Pond Prize #",
            Strings.toString(tokenId),
            "\",\"description\":\"A local mock ERC-721 prize stocked in the mferland fishing pond.\",\"image\":\"https://heads.mfers.dev/8292.png\"}"
        );
    }
}

contract LocalPondStock1155 is ERC1155 {
    constructor() ERC1155("") {}

    function mint(address to, uint256 tokenId, uint256 amount) external {
        _mint(to, tokenId, amount, "");
    }

    function uri(uint256 tokenId) public pure override returns (string memory) {
        return string.concat(
            "data:application/json,{\"name\":\"Local Pond Stack #",
            Strings.toString(tokenId),
            "\",\"description\":\"A local mock ERC-1155 prize stacked in the mferland fishing pond.\",\"image\":\"https://heads.mfers.dev/8292.png\"}"
        );
    }
}
