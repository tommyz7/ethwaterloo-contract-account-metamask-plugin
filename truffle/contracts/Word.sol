pragma solidity >=0.5.0 <0.6.0;

contract Word {
  string public word;

  event WordChanged(address indexed author, string oldValue, string newValue);

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
  function () external payable {}
}
