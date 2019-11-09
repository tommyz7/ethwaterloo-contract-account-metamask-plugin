pragma solidity >=0.5.0 <0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";

contract USDC is ERC20, ERC20Detailed("USD Coin", "USDC", 6) {
    function mint(address account, uint256 amount) public returns (bool) {
        _mint(account, amount);
        return true;
    }
}