// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MferGearNFT {
    struct Gear {
        uint16 gearType;
        uint8 tier;
    }

    string public name;
    string public symbol;
    address public owner;
    address public minter;
    uint256 public nextTokenId = 1;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(uint256 => Gear) public gear;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed spender, uint256 indexed tokenId);
    event MinterSet(address indexed minter);
    event TierUpgraded(uint256 indexed tokenId, uint8 tier);

    error NotOwner();
    error NotMinter();
    error NotTokenOwner();
    error InvalidAddress();
    error MissingToken();
    error MaxTier();

    constructor(string memory collectionName, string memory collectionSymbol, address initialOwner) {
        if (initialOwner == address(0)) revert InvalidAddress();
        name = collectionName;
        symbol = collectionSymbol;
        owner = initialOwner;
        minter = initialOwner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
        _;
    }

    function setMinter(address nextMinter) external onlyOwner {
        if (nextMinter == address(0)) revert InvalidAddress();
        minter = nextMinter;
        emit MinterSet(nextMinter);
    }

    function mintTo(address to, uint16 gearType) external onlyMinter returns (uint256 tokenId) {
        if (to == address(0)) revert InvalidAddress();
        tokenId = nextTokenId++;
        ownerOf[tokenId] = to;
        balanceOf[to] += 1;
        gear[tokenId] = Gear({ gearType: gearType, tier: 1 });
        emit Transfer(address(0), to, tokenId);
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

    function upgradeTier(uint256 tokenId, uint8 maxTier) external onlyMinter {
        if (ownerOf[tokenId] == address(0)) revert MissingToken();
        Gear storage tokenGear = gear[tokenId];
        if (tokenGear.tier >= maxTier) revert MaxTier();
        tokenGear.tier += 1;
        emit TierUpgraded(tokenId, tokenGear.tier);
    }
}
