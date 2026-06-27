// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OnchainFishingRod} from "../src/OnchainFishingRod.sol";

interface Vm {
    function prank(address sender) external;
}

contract OnchainFishingRodTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal admin = address(this);
    address internal fisher = address(0xF15);
    address internal friend = address(0xB0B);
    address internal burn = address(0x000000000000000000000000000000000000dEaD);

    OnchainFishingRod internal rod;

    function setUp() public {
        rod = new OnchainFishingRod("mferland Onchain Fishing Rod", "MROD", "ipfs://rod/", admin);
    }

    function testOwnerCanMintTransferableErc721Rod() public {
        uint256 tokenId = rod.mint(fisher);

        assertEq(tokenId, 1);
        assertEq(rod.ownerOf(tokenId), fisher);
        assertEq(rod.balanceOf(fisher), 1);
        assertEq(rod.tokenURI(tokenId), "ipfs://rod/1");

        vm.prank(fisher);
        rod.transferFrom(fisher, friend, tokenId);

        assertEq(rod.ownerOf(tokenId), friend);
        assertEq(rod.balanceOf(fisher), 0);
        assertEq(rod.balanceOf(friend), 1);
    }

    function testOnlyOwnerCanMintAndSetMetadataBase() public {
        vm.prank(fisher);
        try rod.mint(fisher) {
            fail("non-owner mint should revert");
        } catch {}

        vm.prank(fisher);
        try rod.setBaseURI("ipfs://hijack/") {
            fail("non-owner base uri update should revert");
        } catch {}

        rod.setBaseURI("https://game.mfergpt.lol/metadata/rod/");
        uint256 tokenId = rod.mint(fisher);
        assertEq(rod.tokenURI(tokenId), "https://game.mfergpt.lol/metadata/rod/1");
    }

    function testPublicMintChargesConfiguredPaymentToken() public {
        MockPaymentToken token = new MockPaymentToken(fisher, 100 ether);
        rod.setMintPayment(address(token), burn, 25 ether);

        vm.prank(fisher);
        try rod.mint() {
            fail("unapproved paid mint should revert");
        } catch {}

        vm.prank(fisher);
        token.approve(address(rod), 25 ether);

        vm.prank(fisher);
        uint256 tokenId = rod.mint();

        assertEq(tokenId, 1);
        assertEq(rod.ownerOf(tokenId), fisher);
        assertEq(token.balanceOf(fisher), 75 ether);
        assertEq(token.balanceOf(burn), 25 ether);
    }

    function assertEq(uint256 left, uint256 right) internal pure {
        if (left != right) revert("uint mismatch");
    }

    function assertEq(address left, address right) internal pure {
        if (left != right) revert("address mismatch");
    }

    function assertEq(string memory left, string memory right) internal pure {
        if (keccak256(bytes(left)) != keccak256(bytes(right))) revert("string mismatch");
    }

    function fail(string memory message) internal pure {
        revert(message);
    }
}

contract MockPaymentToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(address initialHolder, uint256 initialSupply) {
        balanceOf[initialHolder] = initialSupply;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 approved = allowance[from][msg.sender];
        if (approved < amount) revert("allowance");
        if (balanceOf[from] < amount) revert("balance");
        allowance[from][msg.sender] = approved - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
