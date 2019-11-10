pragma solidity >=0.5.0 <0.6.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";

contract DCWallet is Ownable {
    string public word;
    uint public timedelta; // in seconds
    uint public lastCall; // in seconds
    address[] public recoverableAssets;
    address payable public recoveryAddress;

    event Execution(address destination, uint value, bytes data);
    event ExecutionFailure(address destination, uint value, bytes data);
    event NewRecoveryAddress(address recoveryAddress, uint timedelta);

    constructor(address[] memory assets) public {
        setRecoverableAssets(assets);
    }

    modifier updateLastCall() {
        lastCall = now;
        _;
    }

    function timeTillDeadline() public view returns (uint) {
        if (now < lastCall + timedelta) {
            return (lastCall + timedelta) - now;
        }
        return 0;
    }

    function isRecoverable() public view returns (bool) {
        return now >= lastCall + timedelta;
    }

    function setRecoverableAssets(address[] memory assets) public onlyOwner {
        for (uint8 i = 0; i < assets.length; i++) {
            recoverableAssets.push(assets[i]);
        }
    }

    function sendEth(address payable to, uint value) public payable updateLastCall onlyOwner {
        to.transfer(value);
    }

    /// @dev extend the deadline for recovery
    function iAmAlive() public updateLastCall onlyOwner returns (bool) {
        return true;
    }

    function setRecoveryAddress(
        address payable _recoveryAddress,
        uint256 _timedelta
    ) public updateLastCall onlyOwner {
        require(recoveryAddress != address(0),
            "#DCWallet setRecoveryAddress(): recoveryAddress cannot be zero address");
        require(timedelta > 0,
            "#DCWallet setRecoveryAddress(): timedelta must be bigger than zero");

        recoveryAddress = _recoveryAddress;
        timedelta = _timedelta;

        emit NewRecoveryAddress(_recoveryAddress, _timedelta);
    }

    function recoverFunds() public {
        require(isRecoverable(), "#DCWallet recoverFunds(): Wallet is not recoverable");

        for (uint8 i = 0; i < recoverableAssets.length; i++) {
            IERC20 erc20 = IERC20(recoverableAssets[i]);
            IERC20(recoverableAssets[i])
                .transfer(recoveryAddress, erc20.balanceOf(address(this)));
        }

        // send ETH
        recoveryAddress.transfer(address(this).balance);
    }

    // Thank you Gnosis :)
    function executeTransaction(address destination, uint value, bytes memory data)
        public
        updateLastCall
        onlyOwner
        returns (bool)
    {
        uint dataLength = data.length;
        bool result;
        assembly {
            let x := mload(0x40)   // "Allocate" memory for output (0x40 is where "free memory" pointer is stored by convention)
            let d := add(data, 32) // First 32 bytes are the padded length of data, so exclude that
            result := call(
                sub(gas, 34710),   // 34710 is the value that solidity is currently emitting
                                   // It includes callGas (700) + callVeryLow (3, to pay for SUB) + callValueTransferGas (9000) +
                                   // callNewAccountGas (25000, in case the destination address does not exist and needs creating)
                destination,
                value,
                d,
                dataLength,        // Size of the input (in bytes) - this is what fixes the padding problem
                x,
                0                  // Output is ignored, therefore the output size is zero
            )
        }
        if (result)
            emit Execution(destination, value, data);
        else {
            emit ExecutionFailure(destination, value, data);
        }
        return result;
    }

    function () external payable {}
}
