// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MferGold} from "./MferGold.sol";

contract QuestRewardDistributor {
    MferGold public immutable gold;
    address public owner;
    mapping(address => bool) public rewarders;
    mapping(address => mapping(bytes32 => bool)) public claimed;

    event RewarderSet(address indexed rewarder, bool allowed);
    event QuestRewardClaimed(address indexed player, bytes32 indexed questId, uint256 amount);

    error NotOwner();
    error NotRewarder();
    error AlreadyClaimed();
    error InvalidAddress();
    error InvalidAmount();

    constructor(MferGold goldToken, address initialOwner) {
        if (address(goldToken) == address(0) || initialOwner == address(0)) revert InvalidAddress();
        gold = goldToken;
        owner = initialOwner;
        rewarders[initialOwner] = true;
        emit RewarderSet(initialOwner, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRewarder() {
        if (!rewarders[msg.sender]) revert NotRewarder();
        _;
    }

    function setRewarder(address rewarder, bool allowed) external onlyOwner {
        if (rewarder == address(0)) revert InvalidAddress();
        rewarders[rewarder] = allowed;
        emit RewarderSet(rewarder, allowed);
    }

    function distributeQuestReward(address player, bytes32 questId, uint256 amount) external onlyRewarder {
        if (player == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (claimed[player][questId]) revert AlreadyClaimed();

        claimed[player][questId] = true;
        gold.mint(player, amount);
        emit QuestRewardClaimed(player, questId, amount);
    }
}
