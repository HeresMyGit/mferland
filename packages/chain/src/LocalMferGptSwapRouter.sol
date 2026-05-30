// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILocalSwapToken {
    function balanceOf(address owner) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract LocalMferGptSwapRouter {
    ILocalSwapToken public immutable mfergpt;
    address payable public immutable treasury;
    uint256 public immutable mfergptPerEthWei;

    event SwapExactEthForMferGpt(address indexed sender, address indexed to, uint256 amountInWei, uint256 amountOutWei);

    error InvalidAddress();
    error InvalidPath();
    error Expired();
    error AmountInRequired();
    error InsufficientOutput();
    error InsufficientLiquidity();
    error TransferFailed();

    constructor(ILocalSwapToken mfergptToken, address payable treasuryAddress, uint256 tokenAmountPerEth) {
        if (address(mfergptToken) == address(0) || treasuryAddress == address(0) || tokenAmountPerEth == 0) {
            revert InvalidAddress();
        }
        mfergpt = mfergptToken;
        treasury = treasuryAddress;
        mfergptPerEthWei = tokenAmountPerEth;
    }

    receive() external payable {}

    function quoteExactETHForTokens(uint256 amountInWei) external view returns (uint256) {
        return _quote(amountInWei);
    }

    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts)
    {
        if (block.timestamp > deadline) revert Expired();
        if (msg.value == 0) revert AmountInRequired();
        if (to == address(0)) revert InvalidAddress();
        if (path.length != 2 || path[1] != address(mfergpt)) revert InvalidPath();

        uint256 amountOut = _quote(msg.value);
        if (amountOut < amountOutMin) revert InsufficientOutput();
        if (mfergpt.balanceOf(address(this)) < amountOut) revert InsufficientLiquidity();
        if (!mfergpt.transfer(to, amountOut)) revert TransferFailed();

        (bool sent,) = treasury.call{value: msg.value}("");
        if (!sent) revert TransferFailed();

        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = amountOut;
        emit SwapExactEthForMferGpt(msg.sender, to, msg.value, amountOut);
    }

    function _quote(uint256 amountInWei) internal view returns (uint256) {
        return amountInWei * mfergptPerEthWei / 1 ether;
    }
}
