// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMferGptBurnable {
    function burnFrom(address from, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

interface IMferPayment {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IMferProductPricing {
    function SEASON_0_PASS_PRODUCT_ID() external view returns (bytes32);
    function getProductPrice(bytes32 productId)
        external
        view
        returns (uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice, uint64 updatedAt);
}

contract MferLaunchPass {
    string public name;
    string public symbol;
    address public owner;
    address payable public treasury;
    IMferPayment public immutable mfer;
    IMferGptBurnable public immutable mfergpt;
    IMferProductPricing public immutable pricing;
    bytes32 public immutable productId;
    uint256 public immutable maxSupply;
    uint256 public nextTokenId = 1;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;

    bool private locked;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed spender, uint256 indexed tokenId);
    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);
    event PassPurchased(address indexed buyer, uint256 indexed tokenId, string paymentToken, uint256 paid);
    event PricingSet(uint256 ethPrice, uint256 mferPrice, uint256 mferGptPrice);
    event TreasurySet(address indexed treasury);

    error NotOwner();
    error InvalidAddress();
    error InvalidPrice();
    error WrongEthAmount();
    error SoldOut();
    error MissingToken();
    error NotTokenOwner();
    error PaymentFailed();
    error PaymentExceedsMaximum();
    error TreasuryTransferFailed();
    error ReentrantCall();

    constructor(
        string memory collectionName,
        string memory collectionSymbol,
        IMferPayment mferToken,
        IMferGptBurnable mferGptToken,
        IMferProductPricing productPricing,
        address payable passTreasury,
        address initialOwner,
        uint256 supplyCap
    ) {
        if (
            address(mferToken) == address(0) || address(mferGptToken) == address(0)
                || address(productPricing) == address(0) || passTreasury == address(0) || initialOwner == address(0)
        ) {
            revert InvalidAddress();
        }
        if (supplyCap == 0) {
            revert InvalidPrice();
        }

        name = collectionName;
        symbol = collectionSymbol;
        mfer = mferToken;
        mfergpt = mferGptToken;
        pricing = productPricing;
        productId = productPricing.SEASON_0_PASS_PRODUCT_ID();
        (uint256 initialEthPrice, uint256 initialMferPrice, uint256 initialMferGptPrice,) =
            productPricing.getProductPrice(productId);
        if (initialEthPrice == 0 || initialMferPrice == 0 || initialMferGptPrice == 0) revert InvalidPrice();
        treasury = passTreasury;
        owner = initialOwner;
        maxSupply = supplyCap;
        emit OwnershipTransferred(address(0), initialOwner);
        emit TreasurySet(passTreasury);
        emit PricingSet(initialEthPrice, initialMferPrice, initialMferGptPrice);
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

    function ethPrice() public view returns (uint256 price) {
        (price,,,) = pricing.getProductPrice(productId);
        if (price == 0) revert InvalidPrice();
    }

    function mferPrice() public view returns (uint256 price) {
        (, price,,) = pricing.getProductPrice(productId);
        if (price == 0) revert InvalidPrice();
    }

    function mferGptPrice() public view returns (uint256 price) {
        (,, price,) = pricing.getProductPrice(productId);
        if (price == 0) revert InvalidPrice();
    }

    function pricingUpdatedAt() public view returns (uint64 updatedAt) {
        (,,, updatedAt) = pricing.getProductPrice(productId);
    }

    function mintWithEth() external payable nonReentrant returns (uint256 tokenId) {
        uint256 price = ethPrice();
        if (msg.value != price) revert WrongEthAmount();
        tokenId = _mint(msg.sender);
        (bool sent,) = treasury.call{value: msg.value}("");
        if (!sent) revert TreasuryTransferFailed();
        emit PassPurchased(msg.sender, tokenId, "ETH", msg.value);
    }

    function mintWithMfer(uint256 maxPayment) external nonReentrant returns (uint256 tokenId) {
        uint256 price = mferPrice();
        _validateMaxPayment(price, maxPayment);
        _transferExact(mfer, msg.sender, treasury, price);
        tokenId = _mint(msg.sender);
        emit PassPurchased(msg.sender, tokenId, "MFER", price);
    }

    function mintWithMferGpt(uint256 maxPayment) external nonReentrant returns (uint256 tokenId) {
        uint256 price = mferGptPrice();
        _validateMaxPayment(price, maxPayment);
        uint256 balanceBefore = mfergpt.balanceOf(msg.sender);
        uint256 supplyBefore = mfergpt.totalSupply();
        mfergpt.burnFrom(msg.sender, price);
        if (mfergpt.balanceOf(msg.sender) + price != balanceBefore || mfergpt.totalSupply() + price != supplyBefore) {
            revert PaymentFailed();
        }
        tokenId = _mint(msg.sender);
        emit PassPurchased(msg.sender, tokenId, "MFERGPT", price);
    }

    function approve(address spender, uint256 tokenId) external {
        address tokenOwner = ownerOf[tokenId];
        if (tokenOwner == address(0)) revert MissingToken();
        if (msg.sender != tokenOwner) revert NotTokenOwner();
        getApproved[tokenId] = spender;
        emit Approval(tokenOwner, spender, tokenId);
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        if (to == address(0)) revert InvalidAddress();
        address tokenOwner = ownerOf[tokenId];
        if (tokenOwner == address(0)) revert MissingToken();
        if (tokenOwner != from) revert NotTokenOwner();
        if (msg.sender != tokenOwner && msg.sender != getApproved[tokenId]) revert NotTokenOwner();

        getApproved[tokenId] = address(0);
        balanceOf[from] -= 1;
        balanceOf[to] += 1;
        ownerOf[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function _mint(address to) internal returns (uint256 tokenId) {
        if (to == address(0)) revert InvalidAddress();
        tokenId = nextTokenId;
        if (tokenId > maxSupply) revert SoldOut();
        nextTokenId = tokenId + 1;
        ownerOf[tokenId] = to;
        balanceOf[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    function _validateMaxPayment(uint256 amount, uint256 maximum) internal pure {
        if (amount > maximum) revert PaymentExceedsMaximum();
    }

    function _transferExact(IMferPayment token, address from, address to, uint256 amount) internal {
        uint256 treasuryBefore = token.balanceOf(to);
        bool paid = token.transferFrom(from, to, amount);
        if (!paid || token.balanceOf(to) != treasuryBefore + amount) revert PaymentFailed();
    }
}
