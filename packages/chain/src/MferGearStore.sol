// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MferGearNFT} from "./MferGearNFT.sol";

interface IERC20Payment {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IGearProductPricing {
    function gearProductId(uint16 gearType) external pure returns (bytes32);
    function getProductPrice(bytes32 productId)
        external
        view
        returns (uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice, uint64 updatedAt);
}

contract MferGearStore {
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MFER_DISCOUNT_BPS = 1_000;
    uint256 public constant MFERGPT_DISCOUNT_BPS = 2_500;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    MferGearNFT public immutable gear;
    IGearProductPricing public immutable pricing;
    IERC20Payment public immutable mfer;
    IERC20Payment public immutable mfergpt;
    address public owner;
    address payable public treasury;
    mapping(uint16 => bool) public gearListed;
    bool private locked;

    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);
    event TreasurySet(address indexed treasury);
    event GearListed(uint16 indexed gearType, bytes32 indexed productId);
    event GearDelisted(uint16 indexed gearType);
    event GearPurchased(
        address indexed buyer, uint16 indexed gearType, uint256 indexed tokenId, string paymentToken, uint256 paid
    );

    error NotOwner();
    error InvalidAddress();
    error InvalidPrice();
    error NotListed();
    error PaymentFailed();
    error WrongEthAmount();
    error PaymentExceedsMaximum();
    error TreasuryTransferFailed();
    error ReentrantCall();

    constructor(
        MferGearNFT gearNft,
        IGearProductPricing productPricing,
        IERC20Payment mferToken,
        IERC20Payment mfergptToken,
        address payable storeTreasury,
        address initialOwner
    ) {
        if (
            address(gearNft) == address(0) || address(productPricing) == address(0)
                || address(mferToken) == address(0) || address(mfergptToken) == address(0)
                || storeTreasury == address(0) || initialOwner == address(0)
        ) revert InvalidAddress();

        gear = gearNft;
        pricing = productPricing;
        mfer = mferToken;
        mfergpt = mfergptToken;
        treasury = storeTreasury;
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
        emit TreasurySet(storeTreasury);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (locked) revert ReentrantCall();
        locked = true;
        _;
        locked = false;
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert InvalidAddress();
        emit OwnershipTransferred(owner, nextOwner);
        owner = nextOwner;
    }

    function setTreasury(address payable nextTreasury) external onlyOwner {
        if (nextTreasury == address(0)) revert InvalidAddress();
        treasury = nextTreasury;
        emit TreasurySet(nextTreasury);
    }

    function listGear(uint16 gearType) external onlyOwner {
        _validateGearPrice(gearType);
        gearListed[gearType] = true;
        emit GearListed(gearType, pricing.gearProductId(gearType));
    }

    function delistGear(uint16 gearType) external onlyOwner {
        gearListed[gearType] = false;
        emit GearDelisted(gearType);
    }

    function buyWithEth(uint16 gearType) external payable nonReentrant returns (uint256 tokenId) {
        uint256 price = ethPriceByGearType(gearType);
        if (msg.value != price) revert WrongEthAmount();

        (bool sent,) = treasury.call{value: msg.value}("");
        if (!sent) revert TreasuryTransferFailed();
        tokenId = gear.mintTo(msg.sender, gearType);
        emit GearPurchased(msg.sender, gearType, tokenId, "ETH", msg.value);
    }

    function buyWithMfer(uint16 gearType, uint256 maxPayment) external nonReentrant returns (uint256 tokenId) {
        uint256 price = mferPriceByGearType(gearType);
        _validateMaxPayment(price, maxPayment);
        _transferExact(mfer, msg.sender, treasury, price);
        tokenId = gear.mintTo(msg.sender, gearType);
        emit GearPurchased(msg.sender, gearType, tokenId, "MFER", price);
    }

    function buyWithMferGpt(uint16 gearType, uint256 maxPayment) external nonReentrant returns (uint256 tokenId) {
        uint256 price = mferGptPriceByGearType(gearType);
        _validateMaxPayment(price, maxPayment);
        _transferExact(mfergpt, msg.sender, BURN_ADDRESS, price);
        tokenId = gear.mintTo(msg.sender, gearType);
        emit GearPurchased(msg.sender, gearType, tokenId, "MFERGPT", price);
    }

    function ethPriceByGearType(uint16 gearType) public view returns (uint256 ethPrice) {
        (ethPrice,,,) = _gearPrice(gearType);
    }

    function mferPriceByGearType(uint16 gearType) public view returns (uint256 mferPrice) {
        (, mferPrice,,) = _gearPrice(gearType);
    }

    function mferGptPriceByGearType(uint16 gearType) public view returns (uint256 mferGptPrice) {
        (,, mferGptPrice,) = _gearPrice(gearType);
    }

    function pricingUpdatedAtByGearType(uint16 gearType) public view returns (uint64 updatedAt) {
        (,,, updatedAt) = _gearPrice(gearType);
    }

    function tokenPriceByGearType(uint16 gearType) public view returns (uint256) {
        return mferPriceByGearType(gearType);
    }

    function discountedTokenPrice(uint16 gearType, uint256 discountBps) public view returns (uint256) {
        if (discountBps == MFER_DISCOUNT_BPS) return mferPriceByGearType(gearType);
        if (discountBps == MFERGPT_DISCOUNT_BPS) return mferGptPriceByGearType(gearType);
        revert InvalidPrice();
    }

    function _gearPrice(uint16 gearType)
        internal
        view
        returns (uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice, uint64 updatedAt)
    {
        if (!gearListed[gearType]) revert NotListed();
        (ethPrice, mferPrice, mferGptPrice, updatedAt) = pricing.getProductPrice(pricing.gearProductId(gearType));
        if (ethPrice == 0 || mferPrice == 0 || mferGptPrice == 0) revert NotListed();
    }

    function _validateGearPrice(uint16 gearType) internal view {
        (uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice,) =
            pricing.getProductPrice(pricing.gearProductId(gearType));
        if (ethPrice == 0 || mferPrice == 0 || mferGptPrice == 0) revert InvalidPrice();
    }

    function _validateMaxPayment(uint256 amount, uint256 maximum) internal pure {
        if (amount > maximum) revert PaymentExceedsMaximum();
    }

    function _transferExact(IERC20Payment token, address from, address to, uint256 amount) internal {
        uint256 recipientBefore = token.balanceOf(to);
        bool paid = token.transferFrom(from, to, amount);
        if (!paid || token.balanceOf(to) != recipientBefore + amount) revert PaymentFailed();
    }
}
