import React from 'react';
import { Store, ActionType } from '../../common/Store';
import Web3 from 'web3';



export default function useLoadInjectedWeb3State() {
  const { state, dispatch } = React.useContext(Store);

  React.useEffect(() => {
    if (state.injectedProvider){
      //console.log('have injected provider'); 
      if (state.injectedProvider.selectedAddress){
        //console.log('setting selected addr', state.injectedProvider.selectedAddress);

        dispatch({
          type: ActionType.SET_SELECTED_ETH_ADDR,
          payload: state.injectedProvider.selectedAddress
        });

        let w3: Web3 = new Web3(state.injectedProvider);

        dispatch({
          type: ActionType.SET_ETH_WEB3,
          payload: w3
        });


      }else{
        console.warn('dont have selected address, yet');
      }
    }
  }, [state.injectedProvider]);



  React.useEffect(() => {
    const fetchBalance = async() => {
      if (state.injectedProvider){
        let w3: Web3 = new Web3(state.injectedProvider);
        let b = await w3.eth.getBalance(state.selectedEthAddr);
        let converted = w3.utils.fromWei(b, 'ether');
        //console.log("coverted:", converted);

        dispatch({
          type: ActionType.SET_ETH_WEB3,
          payload: w3
        })

        dispatch({
          type: ActionType.SET_ETH_BALANCE,
          payload: converted
        })
      }
    }

    if (state.selectedEthAddr){
      fetchBalance();
    }
  }, [state.selectedEthAddr])
}