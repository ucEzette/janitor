// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

interface IWETH {
    function withdraw(uint256 amount) external;
}

contract JanitorSweeper {
    using SafeERC20 for IERC20;

    ISwapRouter public immutable swapRouter;
    address public immutable WETH;
    address public owner;
    uint256 public feeBps = 100; // 1% Fee

    event DustSwept(address indexed user, address tokenIn, uint256 amountIn, uint256 ethOut);

    constructor(address _swapRouter, address _weth) {
        swapRouter = ISwapRouter(_swapRouter);
        WETH = _weth;
        owner = msg.sender;
    }

    struct SweepParams {
        address tokenIn;
        uint24 feeTier;
        uint256 amount;
        uint256 amountOutMin;
    }

    function sweepDust(SweepParams[] calldata params) external {
        uint256 totalEthGenerated = 0;

        for (uint256 i = 0; i < params.length; i++) {
            if (params[i].amount == 0) continue;

            IERC20 token = IERC20(params[i].tokenIn);
            
            // Pull tokens
            token.safeTransferFrom(msg.sender, address(this), params[i].amount);
            
            // Approve Uniswap
            token.forceApprove(address(swapRouter), params[i].amount);

            // Swap
            ISwapRouter.ExactInputSingleParams memory swapParams =
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: params[i].tokenIn,
                    tokenOut: WETH,
                    fee: params[i].feeTier,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: params[i].amount,
                    amountOutMinimum: params[i].amountOutMin,
                    sqrtPriceLimitX96: 0
                });

            try swapRouter.exactInputSingle(swapParams) returns (uint256 amountOut) {
                totalEthGenerated += amountOut;
                emit DustSwept(msg.sender, params[i].tokenIn, params[i].amount, amountOut);
            } catch {
                // If swap fails, return tokens
                token.safeTransfer(msg.sender, params[i].amount);
            }
        }

        if (totalEthGenerated > 0) {
            IWETH(WETH).withdraw(totalEthGenerated);
            
            uint256 janitorCut = (totalEthGenerated * feeBps) / 10000;
            uint256 userPayout = totalEthGenerated - janitorCut;

            payable(owner).transfer(janitorCut);
            payable(msg.sender).transfer(userPayout);
        }
    }

    receive() external payable {}
}