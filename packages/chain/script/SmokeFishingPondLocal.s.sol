// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {FishingPond} from "../src/FishingPond.sol";

interface Vm {
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function startBroadcast(address sender) external;
    function stopBroadcast() external;
}

contract SmokeFishingPondLocal {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant DEPLOYER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address internal constant DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address internal constant DEPOSITOR = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address internal constant FISHER = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;

    function run() external {
        vm.startBroadcast(DEPLOYER);
        FishingPond pond = new FishingPond(DEPLOYER, DEPLOYER, 2, 50);
        FishingPondSmoke721 nft721 = new FishingPondSmoke721();
        FishingPondSmoke1155 nft1155 = new FishingPondSmoke1155();
        nft721.mint(DEPOSITOR, 1001);
        nft721.mint(DEPOSITOR, 1002);
        nft1155.mint(DEPOSITOR, 2001, 4);
        vm.stopBroadcast();

        vm.startBroadcast(DEPOSITOR);
        nft721.approve(address(pond), 1001);
        uint256 entry721 = pond.depositERC721(address(nft721), 1001);
        nft721.approve(address(pond), 1002);
        pond.depositERC721(address(nft721), 1002);
        nft1155.setApprovalForAll(address(pond), true);
        uint256 entry1155 = pond.depositERC1155(address(nft1155), 2001, 4);
        vm.stopBroadcast();

        FishingPond.ClaimVoucher memory erc721Voucher = makeVoucher(
            pond, keccak256("local-smoke-erc721"), FishingPond.TokenStandard.ERC721, address(nft721), 1001, 1, entry721
        );
        vm.startBroadcast(FISHER);
        pond.claim(erc721Voucher, signVoucher(pond, erc721Voucher));
        vm.stopBroadcast();
        require(nft721.ownerOf(1001) == FISHER, "erc721 claim failed");

        FishingPond.ClaimVoucher memory erc1155Voucher = makeVoucher(
            pond,
            keccak256("local-smoke-erc1155"),
            FishingPond.TokenStandard.ERC1155,
            address(nft1155),
            2001,
            1,
            entry1155
        );
        vm.startBroadcast(FISHER);
        pond.claim(erc1155Voucher, signVoucher(pond, erc1155Voucher));
        vm.stopBroadcast();
        require(nft1155.balanceOf(FISHER, 2001) == 1, "erc1155 claim failed");
        require(nft1155.balanceOf(address(pond), 2001) == 3, "erc1155 remaining amount mismatch");
        require(pond.activeEntryCount() == 2, "active index after claims mismatch");

        vm.startBroadcast(DEPLOYER);
        pond.adminReturnCollectionDeposits(address(nft721), 0, pond.MAX_RETURN_BATCH_SIZE());
        vm.stopBroadcast();
        require(nft721.ownerOf(1002) == DEPOSITOR, "admin collection return failed");
        require(pond.activeEntryCount() == 1, "active index after admin collection return mismatch");

        vm.startBroadcast(DEPLOYER);
        pond.startDrain();
        vm.stopBroadcast();

        vm.startBroadcast(FISHER);
        pond.returnCollectionDeposits(address(nft1155), 0, pond.MAX_RETURN_BATCH_SIZE());
        vm.stopBroadcast();
        require(nft1155.balanceOf(DEPOSITOR, 2001) == 3, "drain return failed");
        require(nft1155.balanceOf(address(pond), 2001) == 0, "pond not drained");
        require(pond.activeEntryCount() == 0, "active index after drain mismatch");
    }

    function makeVoucher(
        FishingPond pond,
        bytes32 catchId,
        FishingPond.TokenStandard standard,
        address collection,
        uint256 tokenId,
        uint256 amount,
        uint256 entryId
    ) internal view returns (FishingPond.ClaimVoucher memory) {
        return FishingPond.ClaimVoucher({
            catchId: catchId,
            fisher: FISHER,
            standard: standard,
            collection: collection,
            tokenId: tokenId,
            amount: amount,
            pondEntryId: entryId,
            expiresAt: block.timestamp + pond.MAX_VOUCHER_TTL(),
            chainId: block.chainid,
            verifyingContract: address(pond)
        });
    }

    function signVoucher(FishingPond pond, FishingPond.ClaimVoucher memory voucher) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(DEPLOYER_KEY, pond.hashClaimVoucher(voucher));
        return bytes.concat(r, s, bytes1(v));
    }
}

contract FishingPondSmoke721 is ERC721 {
    constructor() ERC721("Fishing Pond Smoke ERC721", "FPS721") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function tokenURI(uint256 tokenId) public pure override returns (string memory) {
        return string.concat(
            "data:application/json,{\"name\":\"Smoke Pond Prize #",
            Strings.toString(tokenId),
            "\",\"description\":\"A smoke-test ERC-721 prize from the mferland fishing pond.\",\"image\":\"https://heads.mfers.dev/8292.png\"}"
        );
    }
}

contract FishingPondSmoke1155 is ERC1155 {
    constructor() ERC1155("") {}

    function mint(address to, uint256 tokenId, uint256 amount) external {
        _mint(to, tokenId, amount, "");
    }

    function uri(uint256 tokenId) public pure override returns (string memory) {
        return string.concat(
            "data:application/json,{\"name\":\"Smoke Pond Stack #",
            Strings.toString(tokenId),
            "\",\"description\":\"A smoke-test ERC-1155 prize from the mferland fishing pond.\",\"image\":\"https://heads.mfers.dev/8292.png\"}"
        );
    }
}
