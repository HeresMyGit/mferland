// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MferGearNFT} from "./MferGearNFT.sol";
import {MferGold} from "./MferGold.sol";

interface IERC20Payment {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IBurnableToken {
    function burnFrom(address from, uint256 amount) external;
}

contract MferGearStore {
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MFER_DISCOUNT_BPS = 1_000;
    uint256 public constant MFERGPT_DISCOUNT_BPS = 2_500;
    uint8 public constant MAX_GEAR_TIER = 3;

    MferGearNFT public immutable gear;
    IBurnableToken public immutable gold;
    IERC20Payment public immutable mfer;
    IBurnableToken public immutable mfergpt;
    address public owner;
    address payable public treasury;
    mapping(uint16 => uint256) public ethPriceByGearType;
    mapping(uint16 => uint256) public tokenPriceByGearType;
    mapping(uint8 => uint256) public upgradeGoldCostByTier;

    event GearListed(uint16 indexed gearType, uint256 ethPrice, uint256 tokenPrice);
    event GearPurchased(address indexed buyer, uint16 indexed gearType, uint256 indexed tokenId, string paymentToken, uint256 paid);
    event GearUpgraded(address indexed owner, uint256 indexed tokenId, uint8 tier, uint256 goldBurned);

    error NotOwner();
    error InvalidAddress();
    error NotListed();
    error WrongEthAmount();
    error NotTokenOwner();
    error MaxTier();

    constructor(
        MferGearNFT gearNft,
        MferGold goldToken,
        IERC20Payment mferToken,
        IBurnableToken mfergptToken,
        address payable storeTreasury,
        address initialOwner
    ) {
        if (
            address(gearNft) == address(0) ||
            address(goldToken) == address(0) ||
            address(mferToken) == address(0) ||
            address(mfergptToken) == address(0) ||
            storeTreasury == address(0) ||
            initialOwner == address(0)
        ) revert InvalidAddress();

        gear = gearNft;
        gold = IBurnableToken(address(goldToken));
        mfer = mferToken;
        mfergpt = mfergptToken;
        treasury = storeTreasury;
        owner = initialOwner;
        upgradeGoldCostByTier[1] = 50 ether;
        upgradeGoldCostByTier[2] = 125 ether;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function listGear(uint16 gearType, uint256 ethPrice, uint256 tokenPrice) external onlyOwner {
        ethPriceByGearType[gearType] = ethPrice;
        tokenPriceByGearType[gearType] = tokenPrice;
        emit GearListed(gearType, ethPrice, tokenPrice);
    }

    function setUpgradeCost(uint8 currentTier, uint256 goldCost) external onlyOwner {
        upgradeGoldCostByTier[currentTier] = goldCost;
    }

    function buyWithEth(uint16 gearType) external payable returns (uint256 tokenId) {
        uint256 price = ethPriceByGearType[gearType];
        if (price == 0) revert NotListed();
        if (msg.value != price) revert WrongEthAmount();

        (bool sent,) = treasury.call{value: msg.value}("");
        require(sent, "treasury transfer failed");
        tokenId = gear.mintTo(msg.sender, gearType);
        emit GearPurchased(msg.sender, gearType, tokenId, "ETH", msg.value);
    }

    function buyWithMfer(uint16 gearType) external returns (uint256 tokenId) {
        uint256 price = discountedTokenPrice(gearType, MFER_DISCOUNT_BPS);
        mfer.transferFrom(msg.sender, treasury, price);
        tokenId = gear.mintTo(msg.sender, gearType);
        emit GearPurchased(msg.sender, gearType, tokenId, "MFER", price);
    }

    function buyWithMferGpt(uint16 gearType) external returns (uint256 tokenId) {
        uint256 price = discountedTokenPrice(gearType, MFERGPT_DISCOUNT_BPS);
        mfergpt.burnFrom(msg.sender, price);
        tokenId = gear.mintTo(msg.sender, gearType);
        emit GearPurchased(msg.sender, gearType, tokenId, "MFERGPT", price);
    }

    function upgradeWithGold(uint256 tokenId) external {
        if (gear.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        (, uint8 currentTier) = gear.gear(tokenId);
        if (currentTier >= MAX_GEAR_TIER) revert MaxTier();

        uint256 cost = upgradeGoldCostByTier[currentTier];
        gold.burnFrom(msg.sender, cost);
        gear.upgradeTier(tokenId, MAX_GEAR_TIER);
        (, uint8 nextTier) = gear.gear(tokenId);
        emit GearUpgraded(msg.sender, tokenId, nextTier, cost);
    }

    function discountedTokenPrice(uint16 gearType, uint256 discountBps) public view returns (uint256) {
        uint256 price = tokenPriceByGearType[gearType];
        if (price == 0) revert NotListed();
        return price * (BASIS_POINTS - discountBps) / BASIS_POINTS;
    }
}
