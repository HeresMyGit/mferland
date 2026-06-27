// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

interface IERC20TransferFrom {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract OnchainFishingRod is ERC721, Ownable {
    string private baseTokenUri;
    uint256 public nextTokenId = 1;
    address public mintPaymentToken;
    address public mintPaymentRecipient;
    uint256 public mintPrice;

    event BaseURISet(string baseURI);
    event MintPaymentSet(address indexed token, address indexed recipient, uint256 price);
    event RodMinted(address indexed to, uint256 indexed tokenId);

    error InvalidPaymentConfig();
    error PaymentTransferFailed();

    constructor(string memory collectionName, string memory collectionSymbol, string memory initialBaseURI, address initialOwner)
        ERC721(collectionName, collectionSymbol)
        Ownable(initialOwner)
    {
        baseTokenUri = initialBaseURI;
        emit BaseURISet(initialBaseURI);
    }

    function mint() external returns (uint256 tokenId) {
        tokenId = _paidMint(msg.sender);
    }

    function mint(address to) external returns (uint256 tokenId) {
        if (msg.sender == owner()) {
            tokenId = _mintRod(to);
        } else {
            tokenId = _paidMint(to);
        }
    }

    function setMintPayment(address token, address recipient, uint256 price) external onlyOwner {
        if (price > 0 && (token == address(0) || recipient == address(0))) revert InvalidPaymentConfig();
        mintPaymentToken = token;
        mintPaymentRecipient = recipient;
        mintPrice = price;
        emit MintPaymentSet(token, recipient, price);
    }

    function setBaseURI(string calldata nextBaseURI) external onlyOwner {
        baseTokenUri = nextBaseURI;
        emit BaseURISet(nextBaseURI);
    }

    function _paidMint(address to) internal returns (uint256 tokenId) {
        if (mintPrice == 0 || mintPaymentToken == address(0) || mintPaymentRecipient == address(0)) {
            revert InvalidPaymentConfig();
        }
        bool ok = IERC20TransferFrom(mintPaymentToken).transferFrom(msg.sender, mintPaymentRecipient, mintPrice);
        if (!ok) revert PaymentTransferFailed();
        tokenId = _mintRod(to);
    }

    function _mintRod(address to) internal returns (uint256 tokenId) {
        tokenId = nextTokenId;
        nextTokenId = tokenId + 1;
        _safeMint(to, tokenId);
        emit RodMinted(to, tokenId);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenUri;
    }
}
