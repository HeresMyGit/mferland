// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract FishingPond is AccessControl, ERC721Holder, ERC1155Holder, Pausable, ReentrancyGuard, EIP712 {
    enum TokenStandard {
        Unknown,
        ERC721,
        ERC1155
    }

    enum EntryStatus {
        Unknown,
        Active,
        Claimed,
        Returned,
        Migrated
    }

    struct PondEntry {
        TokenStandard standard;
        address collection;
        uint256 tokenId;
        uint256 remainingAmount;
        address depositor;
        EntryStatus status;
    }

    struct ClaimVoucher {
        bytes32 catchId;
        address fisher;
        TokenStandard standard;
        address collection;
        uint256 tokenId;
        uint256 amount;
        uint256 pondEntryId;
        uint256 expiresAt;
        uint256 chainId;
        address verifyingContract;
    }

    struct ReturnTransfer {
        TokenStandard standard;
        address collection;
        uint256 tokenId;
        uint256 amount;
        address depositor;
    }

    bytes32 public constant AWARD_SIGNER_ROLE = keccak256("AWARD_SIGNER_ROLE");
    uint256 public constant ERC721_AMOUNT = 1;
    uint256 public constant ERC1155_V1_CATCH_AMOUNT = 1;
    uint256 public constant MAX_RETURN_BATCH_SIZE = 50;
    uint256 public constant MAX_VOUCHER_TTL = 30 minutes;

    bytes32 private constant CLAIM_VOUCHER_TYPEHASH = keccak256(
        "ClaimVoucher(bytes32 catchId,address fisher,uint8 standard,address collection,uint256 tokenId,uint256 amount,uint256 pondEntryId,uint256 expiresAt,uint256 chainId,address verifyingContract)"
    );

    uint256 public nextEntryId = 1;
    uint256 public perWalletDailyCatchCap;
    uint256 public globalDailyCatchCap;
    bool public drainStarted;
    address public migrationTarget;

    mapping(uint256 => PondEntry) public entries;
    mapping(bytes32 => bool) public catchClaimed;
    mapping(address => mapping(uint256 => uint256)) public walletDailyCatchCount;
    mapping(uint256 => uint256) public globalDailyCatchCount;
    mapping(address => uint256[]) private collectionEntryIds;
    uint256[] private activeEntryIds;
    mapping(uint256 => uint256) private activeEntryIndexPlusOne;

    event Deposited(
        uint256 indexed pondEntryId,
        address indexed depositor,
        TokenStandard indexed standard,
        address collection,
        uint256 tokenId,
        uint256 amount
    );
    event CatchClaimed(
        bytes32 indexed catchId,
        address indexed fisher,
        uint256 indexed pondEntryId,
        TokenStandard standard,
        address collection,
        uint256 tokenId,
        uint256 amount,
        uint256 day
    );
    event DailyCapsSet(uint256 perWalletDailyCatchCap, uint256 globalDailyCatchCap);
    event DrainStarted(address indexed admin);
    event MigrationTargetSet(address indexed target);
    event DepositReturned(
        uint256 indexed pondEntryId,
        address indexed depositor,
        TokenStandard indexed standard,
        address collection,
        uint256 tokenId,
        uint256 amount
    );
    event DepositMigrated(
        uint256 indexed pondEntryId,
        address indexed target,
        TokenStandard indexed standard,
        address collection,
        uint256 tokenId,
        uint256 amount,
        address depositor
    );

    error DrainActive();
    error DrainNotStarted();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidEntry();
    error InvalidSignature();
    error InvalidStandard();
    error VoucherExpired();
    error VoucherMismatch();
    error CatchAlreadyClaimed();
    error EntryInactive();
    error InsufficientEntryAmount();
    error DailyWalletCapReached();
    error DailyGlobalCapReached();
    error ReturnBatchTooLarge();
    error VoucherExpiryTooLong();
    error PondNotPaused();
    error MigrationTargetUnset();
    error TransferVerificationFailed();

    constructor(
        address admin,
        address awardSigner,
        uint256 initialPerWalletDailyCatchCap,
        uint256 initialGlobalDailyCatchCap
    ) EIP712("mferland FishingPond", "1") {
        if (admin == address(0) || awardSigner == address(0)) revert InvalidAddress();
        if (initialPerWalletDailyCatchCap == 0) revert InvalidAmount();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AWARD_SIGNER_ROLE, awardSigner);
        perWalletDailyCatchCap = initialPerWalletDailyCatchCap;
        globalDailyCatchCap = initialGlobalDailyCatchCap;
        emit DailyCapsSet(initialPerWalletDailyCatchCap, initialGlobalDailyCatchCap);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (drainStarted) revert DrainActive();
        _unpause();
    }

    function setDailyCaps(uint256 nextPerWalletDailyCatchCap, uint256 nextGlobalDailyCatchCap)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (nextPerWalletDailyCatchCap == 0) revert InvalidAmount();
        perWalletDailyCatchCap = nextPerWalletDailyCatchCap;
        globalDailyCatchCap = nextGlobalDailyCatchCap;
        emit DailyCapsSet(nextPerWalletDailyCatchCap, nextGlobalDailyCatchCap);
    }

    function startDrain() external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!drainStarted) {
            drainStarted = true;
            if (!paused()) {
                _pause();
            }
            emit DrainStarted(msg.sender);
        }
    }

    function setMigrationTarget(address target) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (target == address(0)) revert InvalidAddress();
        migrationTarget = target;
        emit MigrationTargetSet(target);
    }

    function depositERC721(address collection, uint256 tokenId)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 pondEntryId)
    {
        if (drainStarted) revert DrainActive();
        if (collection == address(0)) revert InvalidAddress();

        pondEntryId = _createEntry(TokenStandard.ERC721, collection, tokenId, ERC721_AMOUNT, msg.sender);
        IERC721(collection).safeTransferFrom(msg.sender, address(this), tokenId);
        if (IERC721(collection).ownerOf(tokenId) != address(this)) revert TransferVerificationFailed();
        emit Deposited(pondEntryId, msg.sender, TokenStandard.ERC721, collection, tokenId, ERC721_AMOUNT);
    }

    function depositERC1155(address collection, uint256 tokenId, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 pondEntryId)
    {
        if (drainStarted) revert DrainActive();
        if (collection == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        uint256 pondBalanceBefore = IERC1155(collection).balanceOf(address(this), tokenId);
        pondEntryId = _createEntry(TokenStandard.ERC1155, collection, tokenId, amount, msg.sender);
        IERC1155(collection).safeTransferFrom(msg.sender, address(this), tokenId, amount, "");
        if (IERC1155(collection).balanceOf(address(this), tokenId) < pondBalanceBefore + amount) {
            revert TransferVerificationFailed();
        }
        emit Deposited(pondEntryId, msg.sender, TokenStandard.ERC1155, collection, tokenId, amount);
    }

    function claim(ClaimVoucher calldata voucher, bytes calldata signature) external nonReentrant whenNotPaused {
        if (drainStarted) revert DrainActive();
        _validateVoucher(voucher, signature);

        uint256 day = block.timestamp / 1 days;
        if (walletDailyCatchCount[voucher.fisher][day] >= perWalletDailyCatchCap) revert DailyWalletCapReached();
        if (globalDailyCatchCap > 0 && globalDailyCatchCount[day] >= globalDailyCatchCap) {
            revert DailyGlobalCapReached();
        }

        PondEntry storage entry = entries[voucher.pondEntryId];
        uint256 remainingAfter = entry.remainingAmount - voucher.amount;

        catchClaimed[voucher.catchId] = true;
        walletDailyCatchCount[voucher.fisher][day] += 1;
        globalDailyCatchCount[day] += 1;
        entry.remainingAmount = remainingAfter;
        if (remainingAfter == 0) {
            entry.status = EntryStatus.Claimed;
            _removeActiveEntry(voucher.pondEntryId);
        }

        emit CatchClaimed(
            voucher.catchId,
            voucher.fisher,
            voucher.pondEntryId,
            voucher.standard,
            voucher.collection,
            voucher.tokenId,
            voucher.amount,
            day
        );

        if (voucher.standard == TokenStandard.ERC721) {
            IERC721(voucher.collection).safeTransferFrom(address(this), voucher.fisher, voucher.tokenId);
            if (IERC721(voucher.collection).ownerOf(voucher.tokenId) != voucher.fisher) {
                revert TransferVerificationFailed();
            }
        } else if (voucher.standard == TokenStandard.ERC1155) {
            uint256 fisherBalanceBefore = IERC1155(voucher.collection).balanceOf(voucher.fisher, voucher.tokenId);
            IERC1155(voucher.collection).safeTransferFrom(
                address(this), voucher.fisher, voucher.tokenId, voucher.amount, ""
            );
            if (
                IERC1155(voucher.collection).balanceOf(voucher.fisher, voucher.tokenId)
                    < fisherBalanceBefore + voucher.amount
            ) {
                revert TransferVerificationFailed();
            }
        } else {
            revert InvalidStandard();
        }
    }

    function returnDeposits(uint256[] calldata entryIds) external nonReentrant {
        if (!drainStarted) revert DrainNotStarted();
        _returnDeposits(_copyEntryIds(entryIds));
    }

    function adminReturnDeposits(uint256[] calldata entryIds) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        _returnDeposits(_copyEntryIds(entryIds));
    }

    function returnCollectionDeposits(address collection, uint256 start, uint256 limit) external nonReentrant {
        if (!drainStarted) revert DrainNotStarted();
        _returnCollectionDeposits(collection, start, limit);
    }

    function adminReturnCollectionDeposits(address collection, uint256 start, uint256 limit)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
    {
        _returnCollectionDeposits(collection, start, limit);
    }

    function migrateDeposits(uint256[] calldata entryIds) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        _migrateDeposits(_copyEntryIds(entryIds));
    }

    function migrateCollectionDeposits(address collection, uint256 start, uint256 limit)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
    {
        if (collection == address(0)) revert InvalidAddress();
        if (limit == 0) revert InvalidAmount();
        if (limit > MAX_RETURN_BATCH_SIZE) revert ReturnBatchTooLarge();

        uint256 collectionLength = collectionEntryIds[collection].length;
        if (start >= collectionLength) return;

        uint256 end = start + limit;
        if (end > collectionLength) end = collectionLength;

        uint256[] memory entryIds = new uint256[](end - start);
        for (uint256 i = start; i < end; i += 1) {
            entryIds[i - start] = collectionEntryIds[collection][i];
        }
        _migrateDeposits(entryIds);
    }

    function activeEntryCount() external view returns (uint256) {
        return activeEntryIds.length;
    }

    function activeEntryIdAt(uint256 index) external view returns (uint256) {
        if (index >= activeEntryIds.length) revert InvalidEntry();
        return activeEntryIds[index];
    }

    function collectionEntryCount(address collection) external view returns (uint256) {
        return collectionEntryIds[collection].length;
    }

    function collectionEntryIdAt(address collection, uint256 index) external view returns (uint256) {
        if (index >= collectionEntryIds[collection].length) revert InvalidEntry();
        return collectionEntryIds[collection][index];
    }

    function hashClaimVoucher(ClaimVoucher memory voucher) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    CLAIM_VOUCHER_TYPEHASH,
                    voucher.catchId,
                    voucher.fisher,
                    voucher.standard,
                    voucher.collection,
                    voucher.tokenId,
                    voucher.amount,
                    voucher.pondEntryId,
                    voucher.expiresAt,
                    voucher.chainId,
                    voucher.verifyingContract
                )
            )
        );
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl, ERC1155Holder) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _returnDeposits(uint256[] memory entryIds) internal {
        if (entryIds.length > MAX_RETURN_BATCH_SIZE) revert ReturnBatchTooLarge();

        ReturnTransfer[] memory transfers = new ReturnTransfer[](entryIds.length);
        uint256 transferCount = 0;

        for (uint256 i = 0; i < entryIds.length; i += 1) {
            PondEntry storage entry = entries[entryIds[i]];
            if (entry.status != EntryStatus.Active || entry.remainingAmount == 0) continue;

            ReturnTransfer memory transfer = ReturnTransfer({
                standard: entry.standard,
                collection: entry.collection,
                tokenId: entry.tokenId,
                amount: entry.remainingAmount,
                depositor: entry.depositor
            });
            if (transfer.standard != TokenStandard.ERC721 && transfer.standard != TokenStandard.ERC1155) {
                revert InvalidStandard();
            }

            entry.remainingAmount = 0;
            entry.status = EntryStatus.Returned;
            _removeActiveEntry(entryIds[i]);

            transfers[transferCount] = transfer;
            transferCount += 1;

            emit DepositReturned(
                entryIds[i],
                transfer.depositor,
                transfer.standard,
                transfer.collection,
                transfer.tokenId,
                transfer.amount
            );
        }

        for (uint256 i = 0; i < transferCount; i += 1) {
            ReturnTransfer memory transfer = transfers[i];
            if (transfer.standard == TokenStandard.ERC721) {
                IERC721(transfer.collection).safeTransferFrom(address(this), transfer.depositor, transfer.tokenId);
            } else if (transfer.standard == TokenStandard.ERC1155) {
                IERC1155(transfer.collection).safeTransferFrom(
                    address(this), transfer.depositor, transfer.tokenId, transfer.amount, ""
                );
            } else {
                revert InvalidStandard();
            }
        }
    }

    function _returnCollectionDeposits(address collection, uint256 start, uint256 limit) internal {
        if (collection == address(0)) revert InvalidAddress();
        if (limit == 0) revert InvalidAmount();
        if (limit > MAX_RETURN_BATCH_SIZE) revert ReturnBatchTooLarge();

        uint256 collectionLength = collectionEntryIds[collection].length;
        if (start >= collectionLength) return;

        uint256 end = start + limit;
        if (end > collectionLength) end = collectionLength;

        uint256[] memory entryIds = new uint256[](end - start);
        for (uint256 i = start; i < end; i += 1) {
            entryIds[i - start] = collectionEntryIds[collection][i];
        }
        _returnDeposits(entryIds);
    }

    function _migrateDeposits(uint256[] memory entryIds) internal {
        if (!paused()) revert PondNotPaused();
        address target = migrationTarget;
        if (target == address(0)) revert MigrationTargetUnset();
        if (entryIds.length > MAX_RETURN_BATCH_SIZE) revert ReturnBatchTooLarge();

        ReturnTransfer[] memory transfers = new ReturnTransfer[](entryIds.length);
        uint256[] memory migratedEntryIds = new uint256[](entryIds.length);
        uint256 transferCount = 0;

        for (uint256 i = 0; i < entryIds.length; i += 1) {
            PondEntry storage entry = entries[entryIds[i]];
            if (entry.status != EntryStatus.Active || entry.remainingAmount == 0) continue;

            ReturnTransfer memory transfer = ReturnTransfer({
                standard: entry.standard,
                collection: entry.collection,
                tokenId: entry.tokenId,
                amount: entry.remainingAmount,
                depositor: entry.depositor
            });
            if (transfer.standard != TokenStandard.ERC721 && transfer.standard != TokenStandard.ERC1155) {
                revert InvalidStandard();
            }

            entry.remainingAmount = 0;
            entry.status = EntryStatus.Migrated;
            _removeActiveEntry(entryIds[i]);

            transfers[transferCount] = transfer;
            migratedEntryIds[transferCount] = entryIds[i];
            transferCount += 1;

            emit DepositMigrated(
                entryIds[i],
                target,
                transfer.standard,
                transfer.collection,
                transfer.tokenId,
                transfer.amount,
                transfer.depositor
            );
        }

        for (uint256 i = 0; i < transferCount; i += 1) {
            ReturnTransfer memory transfer = transfers[i];
            bytes memory data = abi.encode(migratedEntryIds[i], transfer.depositor);
            if (transfer.standard == TokenStandard.ERC721) {
                IERC721(transfer.collection).safeTransferFrom(address(this), target, transfer.tokenId, data);
            } else if (transfer.standard == TokenStandard.ERC1155) {
                IERC1155(transfer.collection).safeTransferFrom(
                    address(this), target, transfer.tokenId, transfer.amount, data
                );
            } else {
                revert InvalidStandard();
            }
        }
    }

    function _copyEntryIds(uint256[] calldata entryIds) internal pure returns (uint256[] memory copiedEntryIds) {
        copiedEntryIds = new uint256[](entryIds.length);
        for (uint256 i = 0; i < entryIds.length; i += 1) {
            copiedEntryIds[i] = entryIds[i];
        }
    }

    function _createEntry(
        TokenStandard standard,
        address collection,
        uint256 tokenId,
        uint256 amount,
        address depositor
    ) internal returns (uint256 pondEntryId) {
        if (depositor == address(0)) revert InvalidAddress();
        if (standard != TokenStandard.ERC721 && standard != TokenStandard.ERC1155) revert InvalidStandard();
        if (standard == TokenStandard.ERC721 && amount != ERC721_AMOUNT) revert InvalidAmount();

        pondEntryId = nextEntryId++;
        entries[pondEntryId] = PondEntry({
            standard: standard,
            collection: collection,
            tokenId: tokenId,
            remainingAmount: amount,
            depositor: depositor,
            status: EntryStatus.Active
        });
        collectionEntryIds[collection].push(pondEntryId);
        activeEntryIndexPlusOne[pondEntryId] = activeEntryIds.length + 1;
        activeEntryIds.push(pondEntryId);
    }

    function _removeActiveEntry(uint256 pondEntryId) internal {
        uint256 indexPlusOne = activeEntryIndexPlusOne[pondEntryId];
        if (indexPlusOne == 0) return;

        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = activeEntryIds.length - 1;
        if (index != lastIndex) {
            uint256 lastEntryId = activeEntryIds[lastIndex];
            activeEntryIds[index] = lastEntryId;
            activeEntryIndexPlusOne[lastEntryId] = indexPlusOne;
        }
        activeEntryIds.pop();
        delete activeEntryIndexPlusOne[pondEntryId];
    }

    function _validateVoucher(ClaimVoucher calldata voucher, bytes calldata signature) internal view {
        _validateVoucherBasics(voucher);
        _validateVoucherEntry(voucher);
        _validateVoucherSignature(voucher, signature);
    }

    function _validateVoucherBasics(ClaimVoucher calldata voucher) internal view {
        if (voucher.catchId == bytes32(0)) revert VoucherMismatch();
        if (voucher.fisher == address(0) || voucher.collection == address(0)) revert InvalidAddress();
        if (msg.sender != voucher.fisher) revert VoucherMismatch();
        // slither-disable-next-line timestamp
        if (block.timestamp > voucher.expiresAt) revert VoucherExpired();
        // slither-disable-next-line timestamp
        if (voucher.expiresAt > block.timestamp + MAX_VOUCHER_TTL) revert VoucherExpiryTooLong();
        if (voucher.chainId != block.chainid || voucher.verifyingContract != address(this)) revert VoucherMismatch();
        if (catchClaimed[voucher.catchId]) revert CatchAlreadyClaimed();
        if (voucher.standard != TokenStandard.ERC721 && voucher.standard != TokenStandard.ERC1155) {
            revert InvalidStandard();
        }
        if (voucher.standard == TokenStandard.ERC721 && voucher.amount != ERC721_AMOUNT) revert InvalidAmount();
        if (voucher.standard == TokenStandard.ERC1155 && voucher.amount != ERC1155_V1_CATCH_AMOUNT) {
            revert InvalidAmount();
        }
    }

    function _validateVoucherEntry(ClaimVoucher calldata voucher) internal view {
        PondEntry storage entry = entries[voucher.pondEntryId];
        if (entry.depositor == address(0)) revert InvalidEntry();
        if (entry.status != EntryStatus.Active) revert EntryInactive();
        if (
            entry.standard != voucher.standard || entry.collection != voucher.collection
                || entry.tokenId != voucher.tokenId
        ) {
            revert VoucherMismatch();
        }
        if (entry.remainingAmount < voucher.amount) revert InsufficientEntryAmount();
    }

    function _validateVoucherSignature(ClaimVoucher calldata voucher, bytes calldata signature) internal view {
        address signer = ECDSA.recover(hashClaimVoucher(voucher), signature);
        if (!hasRole(AWARD_SIGNER_ROLE, signer)) revert InvalidSignature();
    }
}
