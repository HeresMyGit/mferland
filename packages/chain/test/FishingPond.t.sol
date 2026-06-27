// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {FishingPond} from "../src/FishingPond.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
}

contract FishingPondTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant AWARD_SIGNER_KEY = 0xA11CE;
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    address internal awardSigner;
    address internal admin = address(this);
    address internal depositor = address(0xD0);
    address internal fisher = address(0xF15);
    address internal attacker = address(0xA77A);

    FishingPond internal pond;
    Mock721 internal nft721;
    Mock1155 internal nft1155;

    function setUp() public {
        awardSigner = vm.addr(AWARD_SIGNER_KEY);
        pond = new FishingPond(admin, awardSigner, 1, 0);
        nft721 = new Mock721();
        nft1155 = new Mock1155();

        nft721.mint(depositor, 101);
        nft721.mint(depositor, 102);
        nft1155.mint(depositor, 7, 3);
    }

    function testDepositsErc721AndClaimsWithAwardVoucher() public {
        uint256 entryId = deposit721(101);
        bytes32 catchId = keccak256("catch-721");
        FishingPond.ClaimVoucher memory voucher = makeVoucher(
            catchId, fisher, FishingPond.TokenStandard.ERC721, address(nft721), 101, 1, entryId, validExpiresAt()
        );

        claimAs(fisher, voucher);

        assertEq(nft721.ownerOf(101), fisher);
        assertEq(pond.catchClaimed(catchId), true);
        assertEq(pond.walletDailyCatchCount(fisher, block.timestamp / 1 days), 1);
        (,,, uint256 remainingAmount,, FishingPond.EntryStatus status) = pond.entries(entryId);
        assertEq(remainingAmount, 0);
        assertEq(uint256(status), uint256(FishingPond.EntryStatus.Claimed));
    }

    function testDepositsErc1155AndClaimsOneUnitAtATime() public {
        uint256 entryId = deposit1155(7, 3);
        bytes32 catchId = keccak256("catch-1155");
        FishingPond.ClaimVoucher memory voucher = makeVoucher(
            catchId, fisher, FishingPond.TokenStandard.ERC1155, address(nft1155), 7, 1, entryId, validExpiresAt()
        );

        claimAs(fisher, voucher);

        assertEq(nft1155.balanceOf(fisher, 7), 1);
        assertEq(nft1155.balanceOf(address(pond), 7), 2);
        (,,, uint256 remainingAmount,, FishingPond.EntryStatus status) = pond.entries(entryId);
        assertEq(remainingAmount, 2);
        assertEq(uint256(status), uint256(FishingPond.EntryStatus.Active));
    }

    function testRejectsDuplicateCatchId() public {
        uint256 entryId = deposit1155(7, 3);
        bytes32 catchId = keccak256("duplicate-catch");
        FishingPond.ClaimVoucher memory first = makeVoucher(
            catchId, fisher, FishingPond.TokenStandard.ERC1155, address(nft1155), 7, 1, entryId, validExpiresAt()
        );
        FishingPond.ClaimVoucher memory second = makeVoucher(
            catchId,
            address(0xB0B),
            FishingPond.TokenStandard.ERC1155,
            address(nft1155),
            7,
            1,
            entryId,
            validExpiresAt()
        );

        claimAs(fisher, first);

        bytes memory secondSignature = signVoucher(second);
        vm.prank(address(0xB0B));
        vm.expectRevert(FishingPond.CatchAlreadyClaimed.selector);
        pond.claim(second, secondSignature);
    }

    function testEnforcesDailyCaps() public {
        uint256 firstEntryId = deposit721(101);
        uint256 secondEntryId = deposit721(102);
        FishingPond.ClaimVoucher memory first = makeVoucher(
            keccak256("daily-first"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            1,
            firstEntryId,
            validExpiresAt()
        );
        FishingPond.ClaimVoucher memory second = makeVoucher(
            keccak256("daily-second"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            102,
            1,
            secondEntryId,
            validExpiresAt()
        );

        claimAs(fisher, first);

        bytes memory secondSignature = signVoucher(second);
        vm.prank(fisher);
        vm.expectRevert(FishingPond.DailyWalletCapReached.selector);
        pond.claim(second, secondSignature);

        vm.warp(1 days);
        FishingPond.ClaimVoucher memory nextDaySecond = makeVoucher(
            keccak256("daily-second-next-day"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            102,
            1,
            secondEntryId,
            validExpiresAt()
        );
        claimAs(fisher, nextDaySecond);
        assertEq(nft721.ownerOf(102), fisher);
    }

    function testEnforcesOptionalGlobalDailyCap() public {
        pond.setDailyCaps(2, 1);
        uint256 entryId = deposit1155(7, 3);
        FishingPond.ClaimVoucher memory first = makeVoucher(
            keccak256("global-first"),
            fisher,
            FishingPond.TokenStandard.ERC1155,
            address(nft1155),
            7,
            1,
            entryId,
            validExpiresAt()
        );
        FishingPond.ClaimVoucher memory second = makeVoucher(
            keccak256("global-second"),
            address(0xB0B),
            FishingPond.TokenStandard.ERC1155,
            address(nft1155),
            7,
            1,
            entryId,
            validExpiresAt()
        );

        claimAs(fisher, first);

        bytes memory secondSignature = signVoucher(second);
        vm.prank(address(0xB0B));
        vm.expectRevert(FishingPond.DailyGlobalCapReached.selector);
        pond.claim(second, secondSignature);
    }

    function testRejectsExpiredVoucherWithoutBurningClaim() public {
        uint256 entryId = deposit721(101);
        FishingPond.ClaimVoucher memory voucher = makeVoucher(
            keccak256("expired-voucher"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            1,
            entryId,
            block.timestamp + 1
        );
        bytes memory signature = signVoucher(voucher);

        vm.warp(block.timestamp + 2);
        vm.prank(fisher);
        vm.expectRevert(FishingPond.VoucherExpired.selector);
        pond.claim(voucher, signature);

        assertEq(nft721.ownerOf(101), address(pond));
        assertEq(pond.catchClaimed(voucher.catchId), false);
    }

    function testPauseBlocksClaimWithoutBurningClaim() public {
        uint256 entryId = deposit721(101);
        FishingPond.ClaimVoucher memory voucher = makeVoucher(
            keccak256("paused-voucher"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            1,
            entryId,
            validExpiresAt()
        );
        bytes memory signature = signVoucher(voucher);

        pond.pause();
        vm.prank(fisher);
        vm.expectRevert();
        pond.claim(voucher, signature);

        assertEq(nft721.ownerOf(101), address(pond));
        assertEq(pond.catchClaimed(voucher.catchId), false);
    }

    function testRejectsOverClaimAndWrongSigner() public {
        uint256 entryId = deposit721(101);
        FishingPond.ClaimVoucher memory overClaim = makeVoucher(
            keccak256("overclaim"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            2,
            entryId,
            validExpiresAt()
        );

        bytes memory overClaimSignature = signVoucher(overClaim);
        vm.prank(fisher);
        vm.expectRevert(FishingPond.InvalidAmount.selector);
        pond.claim(overClaim, overClaimSignature);

        FishingPond.ClaimVoucher memory wrongSigner = makeVoucher(
            keccak256("wrong-signer"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            1,
            entryId,
            validExpiresAt()
        );
        bytes memory wrongSignature = signVoucherWithKey(wrongSigner, 0xBAD);
        vm.prank(fisher);
        vm.expectRevert(FishingPond.InvalidSignature.selector);
        pond.claim(wrongSigner, wrongSignature);
    }

    function testRejectsUnauthorizedSenderAndForgedVoucherFields() public {
        uint256 entryId = deposit721(101);
        FishingPond.ClaimVoucher memory voucher = makeVoucher(
            keccak256("authz-base"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            1,
            entryId,
            validExpiresAt()
        );
        bytes memory signature = signVoucher(voucher);

        vm.prank(attacker);
        vm.expectRevert(FishingPond.VoucherMismatch.selector);
        pond.claim(voucher, signature);

        FishingPond.ClaimVoucher memory forgedFisher = voucher;
        forgedFisher.fisher = attacker;
        vm.prank(attacker);
        vm.expectRevert(FishingPond.InvalidSignature.selector);
        pond.claim(forgedFisher, signature);

        FishingPond.ClaimVoucher memory wrongContract = voucher;
        wrongContract.verifyingContract = address(0xBEEF);
        bytes memory wrongContractSignature = signVoucher(wrongContract);
        vm.prank(fisher);
        vm.expectRevert(FishingPond.VoucherMismatch.selector);
        pond.claim(wrongContract, wrongContractSignature);

        FishingPond.ClaimVoucher memory wrongChain = voucher;
        wrongChain.chainId = block.chainid + 1;
        bytes memory wrongChainSignature = signVoucher(wrongChain);
        vm.prank(fisher);
        vm.expectRevert(FishingPond.VoucherMismatch.selector);
        pond.claim(wrongChain, wrongChainSignature);
    }

    function testRejectsReplayOntoEquivalentEntry() public {
        uint256 firstEntryId = deposit1155(7, 1);
        uint256 secondEntryId = deposit1155(7, 1);
        FishingPond.ClaimVoucher memory voucher = makeVoucher(
            keccak256("equivalent-entry"),
            fisher,
            FishingPond.TokenStandard.ERC1155,
            address(nft1155),
            7,
            1,
            firstEntryId,
            validExpiresAt()
        );
        bytes memory firstEntrySignature = signVoucher(voucher);

        FishingPond.ClaimVoucher memory forgedEntry = voucher;
        forgedEntry.pondEntryId = secondEntryId;
        vm.prank(fisher);
        vm.expectRevert(FishingPond.InvalidSignature.selector);
        pond.claim(forgedEntry, firstEntrySignature);

        (,,, uint256 firstRemaining,, FishingPond.EntryStatus firstStatus) = pond.entries(firstEntryId);
        (,,, uint256 secondRemaining,, FishingPond.EntryStatus secondStatus) = pond.entries(secondEntryId);
        assertEq(firstRemaining, 1);
        assertEq(secondRemaining, 1);
        assertEq(uint256(firstStatus), uint256(FishingPond.EntryStatus.Active));
        assertEq(uint256(secondStatus), uint256(FishingPond.EntryStatus.Active));
    }

    function testRejectsMalleableAndMalformedSignatures() public {
        uint256 entryId = deposit721(101);
        FishingPond.ClaimVoucher memory voucher = makeVoucher(
            keccak256("malleable-sig"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            1,
            entryId,
            validExpiresAt()
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AWARD_SIGNER_KEY, pond.hashClaimVoucher(voucher));
        bytes32 highS = bytes32(SECP256K1_N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        bytes memory malleableSignature = bytes.concat(r, highS, bytes1(flippedV));

        vm.prank(fisher);
        vm.expectRevert();
        pond.claim(voucher, malleableSignature);

        vm.prank(fisher);
        vm.expectRevert();
        pond.claim(voucher, hex"1234");
    }

    function testReentrantReceiverCannotClaimSecondVoucherDuringTransfer() public {
        pond.setDailyCaps(3, 0);
        uint256 erc721EntryId = deposit721(101);
        uint256 erc1155EntryId = deposit1155(7, 3);
        ReentrantClaimReceiver receiver = new ReentrantClaimReceiver();

        FishingPond.ClaimVoucher memory erc721Voucher = makeVoucher(
            keccak256("reentrant-outer"),
            address(receiver),
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            1,
            erc721EntryId,
            validExpiresAt()
        );
        FishingPond.ClaimVoucher memory erc1155Voucher = makeVoucher(
            keccak256("reentrant-inner"),
            address(receiver),
            FishingPond.TokenStandard.ERC1155,
            address(nft1155),
            7,
            1,
            erc1155EntryId,
            validExpiresAt()
        );
        receiver.setReentry(pond, erc1155Voucher, signVoucher(erc1155Voucher));
        receiver.claim(pond, erc721Voucher, signVoucher(erc721Voucher));

        assertEq(receiver.reentryAttempted(), true);
        assertEq(receiver.reentrySucceeded(), false);
        assertEq(nft721.ownerOf(101), address(receiver));
        assertEq(nft1155.balanceOf(address(receiver), 7), 0);
        assertEq(pond.catchClaimed(erc721Voucher.catchId), true);
        assertEq(pond.catchClaimed(erc1155Voucher.catchId), false);

        (,,, uint256 remainingAmount,, FishingPond.EntryStatus status) = pond.entries(erc1155EntryId);
        assertEq(remainingAmount, 3);
        assertEq(uint256(status), uint256(FishingPond.EntryStatus.Active));
    }

    function testReceiverRevertDoesNotBurnVoucherOrEntry() public {
        uint256 entryId = deposit721(101);
        RevertingClaimReceiver receiver = new RevertingClaimReceiver();
        FishingPond.ClaimVoucher memory rejectedVoucher = makeVoucher(
            keccak256("receiver-reject"),
            address(receiver),
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            1,
            entryId,
            validExpiresAt()
        );
        bytes memory rejectedSignature = signVoucher(rejectedVoucher);

        vm.expectRevert();
        receiver.claim(pond, rejectedVoucher, rejectedSignature);

        assertEq(nft721.ownerOf(101), address(pond));
        assertEq(pond.catchClaimed(rejectedVoucher.catchId), false);
        (,,, uint256 remainingAmount,, FishingPond.EntryStatus status) = pond.entries(entryId);
        assertEq(remainingAmount, 1);
        assertEq(uint256(status), uint256(FishingPond.EntryStatus.Active));

        FishingPond.ClaimVoucher memory cleanVoucher = makeVoucher(
            keccak256("receiver-reject-recovery"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            1,
            entryId,
            validExpiresAt()
        );
        claimAs(fisher, cleanVoucher);
        assertEq(nft721.ownerOf(101), fisher);
    }

    function testClaimRevertsIfErc721CollectionDoesNotDeliverPrize() public {
        NoopOutbound721 badNft = new NoopOutbound721();
        badNft.mint(depositor, 201);
        vm.prank(depositor);
        badNft.approve(address(pond), 201);
        vm.prank(depositor);
        uint256 entryId = pond.depositERC721(address(badNft), 201);

        badNft.setNoopOutboundFrom(address(pond), true);
        FishingPond.ClaimVoucher memory voucher = makeVoucher(
            keccak256("noop-721-claim"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(badNft),
            201,
            1,
            entryId,
            validExpiresAt()
        );
        bytes memory signature = signVoucher(voucher);

        vm.prank(fisher);
        vm.expectRevert(FishingPond.TransferVerificationFailed.selector);
        pond.claim(voucher, signature);

        assertEq(badNft.ownerOf(201), address(pond));
        assertEq(pond.catchClaimed(voucher.catchId), false);
        (,,, uint256 remainingAmount,, FishingPond.EntryStatus status) = pond.entries(entryId);
        assertEq(remainingAmount, 1);
        assertEq(uint256(status), uint256(FishingPond.EntryStatus.Active));
    }

    function testClaimRevertsIfErc1155CollectionDoesNotDeliverPrize() public {
        NoopOutbound1155 badNft = new NoopOutbound1155();
        badNft.mint(depositor, 99, 2);
        vm.prank(depositor);
        badNft.setApprovalForAll(address(pond), true);
        vm.prank(depositor);
        uint256 entryId = pond.depositERC1155(address(badNft), 99, 2);

        badNft.setNoopOutboundFrom(address(pond), true);
        FishingPond.ClaimVoucher memory voucher = makeVoucher(
            keccak256("noop-1155-claim"),
            fisher,
            FishingPond.TokenStandard.ERC1155,
            address(badNft),
            99,
            1,
            entryId,
            validExpiresAt()
        );
        bytes memory signature = signVoucher(voucher);

        vm.prank(fisher);
        vm.expectRevert(FishingPond.TransferVerificationFailed.selector);
        pond.claim(voucher, signature);

        assertEq(badNft.balanceOf(fisher, 99), 0);
        assertEq(badNft.balanceOf(address(pond), 99), 2);
        assertEq(pond.catchClaimed(voucher.catchId), false);
        (,,, uint256 remainingAmount,, FishingPond.EntryStatus status) = pond.entries(entryId);
        assertEq(remainingAmount, 2);
        assertEq(uint256(status), uint256(FishingPond.EntryStatus.Active));
    }

    function testDepositRevertsIfErc721CollectionDoesNotDeliverCustody() public {
        NoopOutbound721 badNft = new NoopOutbound721();
        badNft.mint(depositor, 201);
        badNft.setNoopOutboundFrom(depositor, true);

        vm.prank(depositor);
        badNft.approve(address(pond), 201);
        vm.prank(depositor);
        vm.expectRevert(FishingPond.TransferVerificationFailed.selector);
        pond.depositERC721(address(badNft), 201);

        assertEq(badNft.ownerOf(201), depositor);
        assertEq(pond.activeEntryCount(), 0);
    }

    function testDepositRevertsIfErc1155CollectionDoesNotDeliverCustody() public {
        NoopOutbound1155 badNft = new NoopOutbound1155();
        badNft.mint(depositor, 99, 2);
        badNft.setNoopOutboundFrom(depositor, true);

        vm.prank(depositor);
        badNft.setApprovalForAll(address(pond), true);
        vm.prank(depositor);
        vm.expectRevert(FishingPond.TransferVerificationFailed.selector);
        pond.depositERC1155(address(badNft), 99, 2);

        assertEq(badNft.balanceOf(depositor, 99), 2);
        assertEq(pond.activeEntryCount(), 0);
    }

    function testDrainReturnsRemainingAssetsToOriginalDepositors() public {
        uint256 erc721EntryId = deposit721(101);
        uint256 erc1155EntryId = deposit1155(7, 3);

        FishingPond.ClaimVoucher memory partialClaim = makeVoucher(
            keccak256("partial-before-drain"),
            fisher,
            FishingPond.TokenStandard.ERC1155,
            address(nft1155),
            7,
            1,
            erc1155EntryId,
            validExpiresAt()
        );
        claimAs(fisher, partialClaim);

        pond.startDrain();
        vm.expectRevert(FishingPond.DrainActive.selector);
        pond.unpause();

        uint256[] memory entryIds = new uint256[](2);
        entryIds[0] = erc721EntryId;
        entryIds[1] = erc1155EntryId;

        vm.prank(address(0xCA11));
        pond.returnDeposits(entryIds);

        assertEq(nft721.ownerOf(101), depositor);
        assertEq(nft1155.balanceOf(depositor, 7), 2);
        assertEq(nft1155.balanceOf(fisher, 7), 1);
        (,,, uint256 remainingAmount,, FishingPond.EntryStatus status) = pond.entries(erc1155EntryId);
        assertEq(remainingAmount, 0);
        assertEq(uint256(status), uint256(FishingPond.EntryStatus.Returned));
    }

    function testAdminCanMigrateSpecificDepositsWhenPaused() public {
        uint256 erc721EntryId = deposit721(101);
        uint256 erc1155EntryId = deposit1155(7, 3);
        MockMigrationTarget target = new MockMigrationTarget();
        pond.pause();
        pond.setMigrationTarget(address(target));

        uint256[] memory entryIds = new uint256[](2);
        entryIds[0] = erc721EntryId;
        entryIds[1] = erc1155EntryId;
        pond.migrateDeposits(entryIds);

        assertEq(nft721.ownerOf(101), address(target));
        assertEq(nft1155.balanceOf(address(target), 7), 3);
        assertEq(pond.activeEntryCount(), 0);

        (,,, uint256 erc721Amount,, FishingPond.EntryStatus erc721Status) = pond.entries(erc721EntryId);
        assertEq(erc721Amount, 0);
        assertEq(uint256(erc721Status), uint256(FishingPond.EntryStatus.Migrated));

        (,,, uint256 erc1155Amount,, FishingPond.EntryStatus erc1155Status) = pond.entries(erc1155EntryId);
        assertEq(erc1155Amount, 0);
        assertEq(uint256(erc1155Status), uint256(FishingPond.EntryStatus.Migrated));
    }

    function testAdminCanMigrateCollectionDepositsWhenPaused() public {
        uint256 erc721EntryId = deposit721(101);
        uint256 erc1155EntryId = deposit1155(7, 3);
        MockMigrationTarget target = new MockMigrationTarget();
        pond.pause();
        pond.setMigrationTarget(address(target));

        pond.migrateCollectionDeposits(address(nft1155), 0, pond.MAX_RETURN_BATCH_SIZE());

        assertEq(nft721.ownerOf(101), address(pond));
        assertEq(nft1155.balanceOf(address(target), 7), 3);
        assertEq(pond.activeEntryCount(), 1);
        assertEq(pond.activeEntryIdAt(0), erc721EntryId);

        (,,, uint256 erc1155Amount,, FishingPond.EntryStatus erc1155Status) = pond.entries(erc1155EntryId);
        assertEq(erc1155Amount, 0);
        assertEq(uint256(erc1155Status), uint256(FishingPond.EntryStatus.Migrated));
    }

    function testMigrationRequiresPauseAndTarget() public {
        uint256 entryId = deposit721(101);
        uint256[] memory entryIds = new uint256[](1);
        entryIds[0] = entryId;

        vm.expectRevert(FishingPond.PondNotPaused.selector);
        pond.migrateDeposits(entryIds);

        pond.pause();
        vm.expectRevert(FishingPond.MigrationTargetUnset.selector);
        pond.migrateDeposits(entryIds);
    }

    function testAdminCanReturnSpecificDepositWithoutDrain() public {
        uint256 returnedEntryId = deposit721(101);
        uint256 keptEntryId = deposit1155(7, 3);

        uint256[] memory entryIds = new uint256[](1);
        entryIds[0] = returnedEntryId;
        pond.adminReturnDeposits(entryIds);

        assertEq(nft721.ownerOf(101), depositor);
        assertEq(nft1155.balanceOf(address(pond), 7), 3);

        (,,, uint256 returnedAmount,, FishingPond.EntryStatus returnedStatus) = pond.entries(returnedEntryId);
        assertEq(returnedAmount, 0);
        assertEq(uint256(returnedStatus), uint256(FishingPond.EntryStatus.Returned));

        (,,, uint256 keptAmount,, FishingPond.EntryStatus keptStatus) = pond.entries(keptEntryId);
        assertEq(keptAmount, 3);
        assertEq(uint256(keptStatus), uint256(FishingPond.EntryStatus.Active));

        FishingPond.ClaimVoucher memory voucher = makeVoucher(
            keccak256("returned-entry-claim"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            1,
            returnedEntryId,
            validExpiresAt()
        );
        bytes memory signature = signVoucher(voucher);
        vm.prank(fisher);
        vm.expectRevert(FishingPond.EntryInactive.selector);
        pond.claim(voucher, signature);
    }

    function testIndexesActiveAndCollectionEntries() public {
        uint256 first721EntryId = deposit721(101);
        uint256 second721EntryId = deposit721(102);
        uint256 erc1155EntryId = deposit1155(7, 3);

        assertEq(pond.activeEntryCount(), 3);
        assertEq(pond.activeEntryIdAt(0), first721EntryId);
        assertEq(pond.activeEntryIdAt(1), second721EntryId);
        assertEq(pond.activeEntryIdAt(2), erc1155EntryId);
        assertEq(pond.collectionEntryCount(address(nft721)), 2);
        assertEq(pond.collectionEntryIdAt(address(nft721), 0), first721EntryId);
        assertEq(pond.collectionEntryIdAt(address(nft721), 1), second721EntryId);
        assertEq(pond.collectionEntryCount(address(nft1155)), 1);
        assertEq(pond.collectionEntryIdAt(address(nft1155), 0), erc1155EntryId);

        FishingPond.ClaimVoucher memory voucher = makeVoucher(
            keccak256("index-claim"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            1,
            first721EntryId,
            validExpiresAt()
        );
        claimAs(fisher, voucher);

        assertEq(pond.activeEntryCount(), 2);
        uint256 activeA = pond.activeEntryIdAt(0);
        uint256 activeB = pond.activeEntryIdAt(1);
        assertEq(
            (activeA == second721EntryId && activeB == erc1155EntryId)
                || (activeA == erc1155EntryId && activeB == second721EntryId),
            true
        );
        assertEq(pond.collectionEntryCount(address(nft721)), 2);
    }

    function testDrainCanReturnCollectionChunk() public {
        uint256 erc721EntryId = deposit721(101);
        uint256 erc1155EntryId = deposit1155(7, 3);

        pond.startDrain();
        vm.prank(address(0xCA11));
        pond.returnCollectionDeposits(address(nft721), 0, pond.MAX_RETURN_BATCH_SIZE());

        assertEq(nft721.ownerOf(101), depositor);
        assertEq(nft1155.balanceOf(address(pond), 7), 3);
        assertEq(pond.activeEntryCount(), 1);
        assertEq(pond.activeEntryIdAt(0), erc1155EntryId);

        (,,, uint256 erc721Amount,, FishingPond.EntryStatus erc721Status) = pond.entries(erc721EntryId);
        assertEq(erc721Amount, 0);
        assertEq(uint256(erc721Status), uint256(FishingPond.EntryStatus.Returned));

        (,,, uint256 erc1155Amount,, FishingPond.EntryStatus erc1155Status) = pond.entries(erc1155EntryId);
        assertEq(erc1155Amount, 3);
        assertEq(uint256(erc1155Status), uint256(FishingPond.EntryStatus.Active));
    }

    function testAdminCanReturnCollectionWithoutDrain() public {
        uint256 erc721EntryId = deposit721(101);
        uint256 erc1155EntryId = deposit1155(7, 3);

        pond.adminReturnCollectionDeposits(address(nft1155), 0, pond.MAX_RETURN_BATCH_SIZE());

        assertEq(nft721.ownerOf(101), address(pond));
        assertEq(nft1155.balanceOf(depositor, 7), 3);
        assertEq(pond.activeEntryCount(), 1);
        assertEq(pond.activeEntryIdAt(0), erc721EntryId);

        (,,, uint256 erc721Amount,, FishingPond.EntryStatus erc721Status) = pond.entries(erc721EntryId);
        assertEq(erc721Amount, 1);
        assertEq(uint256(erc721Status), uint256(FishingPond.EntryStatus.Active));

        (,,, uint256 erc1155Amount,, FishingPond.EntryStatus erc1155Status) = pond.entries(erc1155EntryId);
        assertEq(erc1155Amount, 0);
        assertEq(uint256(erc1155Status), uint256(FishingPond.EntryStatus.Returned));
    }

    function testCollectionReturnSkipsInactiveEntries() public {
        uint256 claimedEntryId = deposit721(101);
        uint256 returnedEntryId = deposit721(102);

        FishingPond.ClaimVoucher memory voucher = makeVoucher(
            keccak256("inactive-collection-skip"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            1,
            claimedEntryId,
            validExpiresAt()
        );
        claimAs(fisher, voucher);

        pond.adminReturnCollectionDeposits(address(nft721), 0, pond.MAX_RETURN_BATCH_SIZE());

        assertEq(nft721.ownerOf(101), fisher);
        assertEq(nft721.ownerOf(102), depositor);
        assertEq(pond.activeEntryCount(), 0);

        (,,, uint256 claimedAmount,, FishingPond.EntryStatus claimedStatus) = pond.entries(claimedEntryId);
        assertEq(claimedAmount, 0);
        assertEq(uint256(claimedStatus), uint256(FishingPond.EntryStatus.Claimed));

        (,,, uint256 returnedAmount,, FishingPond.EntryStatus returnedStatus) = pond.entries(returnedEntryId);
        assertEq(returnedAmount, 0);
        assertEq(uint256(returnedStatus), uint256(FishingPond.EntryStatus.Returned));
    }

    function testRejectsOversizedReturnBatch() public {
        pond.startDrain();

        uint256[] memory entryIds = new uint256[](pond.MAX_RETURN_BATCH_SIZE() + 1);
        vm.expectRevert(FishingPond.ReturnBatchTooLarge.selector);
        pond.returnDeposits(entryIds);
    }

    function testRejectsOversizedCollectionReturnLimit() public {
        deposit721(101);
        pond.startDrain();

        uint256 oversizedLimit = pond.MAX_RETURN_BATCH_SIZE() + 1;
        vm.expectRevert(FishingPond.ReturnBatchTooLarge.selector);
        pond.returnCollectionDeposits(address(nft721), 0, oversizedLimit);
    }

    function testRejectsZeroCollectionReturnLimit() public {
        deposit721(101);
        pond.startDrain();

        vm.expectRevert(FishingPond.InvalidAmount.selector);
        pond.returnCollectionDeposits(address(nft721), 0, 0);
    }

    function testRejectsVoucherExpiryTooFarInFuture() public {
        uint256 entryId = deposit721(101);
        FishingPond.ClaimVoucher memory voucher = makeVoucher(
            keccak256("too-long-expiry"),
            fisher,
            FishingPond.TokenStandard.ERC721,
            address(nft721),
            101,
            1,
            entryId,
            block.timestamp + pond.MAX_VOUCHER_TTL() + 1
        );

        bytes memory signature = signVoucher(voucher);
        vm.prank(fisher);
        vm.expectRevert(FishingPond.VoucherExpiryTooLong.selector);
        pond.claim(voucher, signature);
    }

    function deposit721(uint256 tokenId) internal returns (uint256 entryId) {
        vm.prank(depositor);
        nft721.approve(address(pond), tokenId);
        vm.prank(depositor);
        entryId = pond.depositERC721(address(nft721), tokenId);
    }

    function deposit1155(uint256 tokenId, uint256 amount) internal returns (uint256 entryId) {
        vm.prank(depositor);
        nft1155.setApprovalForAll(address(pond), true);
        vm.prank(depositor);
        entryId = pond.depositERC1155(address(nft1155), tokenId, amount);
    }

    function makeVoucher(
        bytes32 catchId,
        address recipient,
        FishingPond.TokenStandard standard,
        address collection,
        uint256 tokenId,
        uint256 amount,
        uint256 entryId,
        uint256 expiresAt
    ) internal view returns (FishingPond.ClaimVoucher memory) {
        return FishingPond.ClaimVoucher({
            catchId: catchId,
            fisher: recipient,
            standard: standard,
            collection: collection,
            tokenId: tokenId,
            amount: amount,
            pondEntryId: entryId,
            expiresAt: expiresAt,
            chainId: block.chainid,
            verifyingContract: address(pond)
        });
    }

    function signVoucher(FishingPond.ClaimVoucher memory voucher) internal returns (bytes memory) {
        return signVoucherWithKey(voucher, AWARD_SIGNER_KEY);
    }

    function claimAs(address claimant, FishingPond.ClaimVoucher memory voucher) internal {
        bytes memory signature = signVoucher(voucher);
        vm.prank(claimant);
        pond.claim(voucher, signature);
    }

    function signVoucherWithKey(FishingPond.ClaimVoucher memory voucher, uint256 key) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, pond.hashClaimVoucher(voucher));
        return bytes.concat(r, s, bytes1(v));
    }

    function validExpiresAt() internal view returns (uint256) {
        return block.timestamp + pond.MAX_VOUCHER_TTL();
    }

    function assertEq(uint256 actual, uint256 expected) internal pure {
        require(actual == expected, "uint mismatch");
    }

    function assertEq(address actual, address expected) internal pure {
        require(actual == expected, "address mismatch");
    }

    function assertEq(bool actual, bool expected) internal pure {
        require(actual == expected, "bool mismatch");
    }
}

contract Mock721 is ERC721 {
    constructor() ERC721("Mock721", "M721") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function tokenURI(uint256 tokenId) public pure override returns (string memory) {
        return string.concat(
            "data:application/json,{\"name\":\"Mock Pond Prize #",
            Strings.toString(tokenId),
            "\",\"description\":\"A mock ERC-721 prize from the mferland fishing pond.\",\"image\":\"https://heads.mfers.dev/8292.png\"}"
        );
    }
}

contract Mock1155 is ERC1155 {
    constructor() ERC1155("") {}

    function mint(address to, uint256 tokenId, uint256 amount) external {
        _mint(to, tokenId, amount, "");
    }

    function uri(uint256 tokenId) public pure override returns (string memory) {
        return string.concat(
            "data:application/json,{\"name\":\"Mock Pond Stack #",
            Strings.toString(tokenId),
            "\",\"description\":\"A mock ERC-1155 prize from the mferland fishing pond.\",\"image\":\"https://heads.mfers.dev/8292.png\"}"
        );
    }
}

contract MockMigrationTarget is ERC721Holder, ERC1155Holder {}

contract ReentrantClaimReceiver is ERC721Holder {
    FishingPond private reentryPond;
    FishingPond.ClaimVoucher private reentryVoucher;
    bytes private reentrySignature;

    bool public reentryAttempted;
    bool public reentrySucceeded;

    function setReentry(FishingPond pond, FishingPond.ClaimVoucher memory voucher, bytes memory signature) external {
        reentryPond = pond;
        reentryVoucher = voucher;
        reentrySignature = signature;
        reentryAttempted = false;
        reentrySucceeded = false;
    }

    function claim(FishingPond pond, FishingPond.ClaimVoucher memory voucher, bytes memory signature) external {
        pond.claim(voucher, signature);
    }

    function onERC721Received(address, address, uint256, bytes memory) public override returns (bytes4) {
        reentryAttempted = true;
        try reentryPond.claim(reentryVoucher, reentrySignature) {
            reentrySucceeded = true;
        } catch {
            reentrySucceeded = false;
        }
        return this.onERC721Received.selector;
    }
}

contract RevertingClaimReceiver is ERC721Holder {
    function claim(FishingPond pond, FishingPond.ClaimVoucher memory voucher, bytes memory signature) external {
        pond.claim(voucher, signature);
    }

    function onERC721Received(address, address, uint256, bytes memory) public pure override returns (bytes4) {
        revert("receiver rejects claim");
    }
}

contract NoopOutbound721 is ERC721 {
    address public noopFrom;
    bool public noopOutbound;

    constructor() ERC721("NoopOutbound721", "N721") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function setNoopOutboundFrom(address from, bool enabled) external {
        noopFrom = from;
        noopOutbound = enabled;
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address previousOwner = _ownerOf(tokenId);
        if (noopOutbound && previousOwner == noopFrom && to != noopFrom) {
            return previousOwner;
        }
        return super._update(to, tokenId, auth);
    }
}

contract NoopOutbound1155 is ERC1155 {
    address public noopFrom;
    bool public noopOutbound;

    constructor() ERC1155("") {}

    function mint(address to, uint256 tokenId, uint256 amount) external {
        _mint(to, tokenId, amount, "");
    }

    function setNoopOutboundFrom(address from, bool enabled) external {
        noopFrom = from;
        noopOutbound = enabled;
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (noopOutbound && from == noopFrom && to != noopFrom) {
            return;
        }
        super._update(from, to, ids, values);
    }
}
