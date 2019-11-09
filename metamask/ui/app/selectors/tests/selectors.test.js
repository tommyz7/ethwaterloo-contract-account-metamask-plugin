import assert from 'assert'
import selectors from '../selectors.js'
const {
  getAddressBook,
} = selectors
import mockState from './selectors-test-data'

describe('selectors', () => {

  describe('getAddressBook()', () => {
    it('should return the address book', () => {
      assert.deepEqual(
        getAddressBook(mockState),
        [
          {
            address: '0x06195827297c7a80a443b6894d3bdb8824b43896',
            name: 'Address Book Account 1',
            chainId: '3',
          },
        ],
      )
    })
  })

})
