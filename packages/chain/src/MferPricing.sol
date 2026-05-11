// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MferPricing {
    struct ProductPrice {
        uint256 ethPrice;
        uint256 mferPrice;
        uint256 mferGptPrice;
        uint64 updatedAt;
    }

    bytes32 public constant SEASON_0_PASS_PRODUCT_ID = keccak256("season0-pass");

    address public owner;
    mapping(bytes32 => ProductPrice) private productPrices;

    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);
    event ProductPriceSet(
        bytes32 indexed productId,
        uint256 ethPrice,
        uint256 mferPrice,
        uint256 mferGptPrice,
        uint64 updatedAt
    );

    error NotOwner();
    error InvalidAddress();
    error InvalidPrice();

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert InvalidAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert InvalidAddress();
        emit OwnershipTransferred(owner, nextOwner);
        owner = nextOwner;
    }

    function setProductPrice(bytes32 productId, uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice)
        public
        onlyOwner
    {
        if (productId == bytes32(0) || ethPrice == 0 || mferPrice == 0 || mferGptPrice == 0) revert InvalidPrice();
        uint64 updatedAt = uint64(block.timestamp);
        productPrices[productId] = ProductPrice({
            ethPrice: ethPrice,
            mferPrice: mferPrice,
            mferGptPrice: mferGptPrice,
            updatedAt: updatedAt
        });
        emit ProductPriceSet(productId, ethPrice, mferPrice, mferGptPrice, updatedAt);
    }

    function setSeason0PassPrice(uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice) external onlyOwner {
        setProductPrice(SEASON_0_PASS_PRODUCT_ID, ethPrice, mferPrice, mferGptPrice);
    }

    function setGearPrice(uint16 gearType, uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice)
        external
        onlyOwner
    {
        setProductPrice(gearProductId(gearType), ethPrice, mferPrice, mferGptPrice);
    }

    function getProductPrice(bytes32 productId)
        public
        view
        returns (uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice, uint64 updatedAt)
    {
        ProductPrice memory price = productPrices[productId];
        return (price.ethPrice, price.mferPrice, price.mferGptPrice, price.updatedAt);
    }

    function getGearPrice(uint16 gearType)
        external
        view
        returns (uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice, uint64 updatedAt)
    {
        return getProductPrice(gearProductId(gearType));
    }

    function gearProductId(uint16 gearType) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("chain-gear:", gearType));
    }
}
