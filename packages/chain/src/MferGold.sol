// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MferGold {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public owner;
    mapping(address => bool) public minters;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event MinterSet(address indexed minter, bool allowed);
    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);

    error NotOwner();
    error NotMinter();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidAddress();

    constructor(string memory tokenName, string memory tokenSymbol, address initialOwner) {
        if (initialOwner == address(0)) revert InvalidAddress();
        name = tokenName;
        symbol = tokenSymbol;
        owner = initialOwner;
        minters[initialOwner] = true;
        emit OwnershipTransferred(address(0), initialOwner);
        emit MinterSet(initialOwner, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyMinter() {
        if (!minters[msg.sender]) revert NotMinter();
        _;
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert InvalidAddress();
        address previousOwner = owner;
        owner = nextOwner;
        emit OwnershipTransferred(previousOwner, nextOwner);
        if (minters[previousOwner]) {
            minters[previousOwner] = false;
            emit MinterSet(previousOwner, false);
        }
        if (!minters[nextOwner]) {
            minters[nextOwner] = true;
            emit MinterSet(nextOwner, true);
        }
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        if (minter == address(0)) revert InvalidAddress();
        minters[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    function mint(address to, uint256 amount) external onlyMinter {
        if (to == address(0)) revert InvalidAddress();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function burnFrom(address from, uint256 amount) external {
        if (msg.sender != from) {
            uint256 approved = allowance[from][msg.sender];
            if (approved < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = approved - amount;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _burn(from, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) revert InvalidAddress();
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (msg.sender != from) {
            uint256 approved = allowance[from][msg.sender];
            if (approved < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = approved - amount;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }
}
