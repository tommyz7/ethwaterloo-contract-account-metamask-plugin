pragma solidity >=0.5.0 <0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";

contract TCAD is ERC20, ERC20Detailed {
    constructor(address account, uint amount) public ERC20Detailed("True CAD", "TCAD", 18) {
        _mint(account, amount);
    }
}