import React from 'react';
import { Store, ActionType } from '../../common/Store';
import {ethers} from 'ethers';

export default function useLoadInjectedWeb3State() {
  const { state, dispatch } = React.useContext(Store);

  React.useEffect(() => {
    if (state.injectedProvider){
      console.log('have injected provider'); 
      // if (state.injectedProvider.selectedAddress){
      // console.log('setting selected addr', state.injectedProvider.selectedAddress);

        // let provider = new ethers.providers.Web3Provider(web3.currentProvider);

        // let w3: Web3 = new Web3(state.injectedProvider);
        //let ethersProvider = new ethers.providers.Web3Provider(state.injectedProvider);
        
        console.log(ethers);
        console.log(state.injectedProvider);
        let provider = new ethers.providers.Web3Provider(state.injectedProvider);
        
        console.log(state.injectedProvider);      
        //console.log(provider);

        dispatch({
          type: ActionType.SET_ETHERS_PROVIDER,
          payload: provider
        });

      }else{
        console.warn('dont have selected address, yet');
      }
    }, [state.injectedProvider]);



  React.useEffect(() => {
    const fetchBalance = async() => {
      if (state.injectedProvider){
  //      let w3: Web3 = new Web3(state.injectedProvider);
    //    let b = await w3.eth.getBalance(state.selectedEthAddr);
     //   let converted = w3.utils.fromWei(b, 'ether');
        //console.log("coverted:", converted);

       /* dispatch({
          type: ActionType.SET_ETH_WEB3,
          payload: w3
        })

        dispatch({
          type: ActionType.SET_ETH_BALANCE,
          payload: converted
        })*/
      }
    }

    if (state.selectedEthAddr){
      fetchBalance();
    }
  }, [state.selectedEthAddr])
}