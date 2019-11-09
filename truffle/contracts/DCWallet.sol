pragma solidity >=0.5.0 <0.6.0;

contract DCWallet {
    string public word;
    uint public timedelta; // in seconds
    uint public lastCall; // in seconds

    event WordChanged(address indexed author, string oldValue, string newValue);
    event Execution(address destination, uint value, bytes data);
    event ExecutionFailure(address destination, uint value, bytes data);

    constructor(string memory value) public {
        word = value;
        emit WordChanged(msg.sender, word, value);
    }

    function getValue() public view returns (string memory) {
        return word;
    }

    function setValue(string memory value) public {
        word = value;
    }

    function sendEth(address payable to, uint value) public payable {
        to.transfer(value);
    }

    function isRecoverable() public view returns (bool) {
        return now >= lastCall + timedelta;
    }

    function timeTillDeadline() public view returns (uint) {
        if (now < lastCall + timedelta) {
            return (lastCall + timedelta) - now;
        }
        return 0;
    }

    function iAmAlive() public {
        lastCall = now;
    }

    function executeTransaction(address destination, uint value, bytes memory data)
        public
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
