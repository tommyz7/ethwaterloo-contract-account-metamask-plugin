import React from 'react';
import { Store, ActionType } from '../../common/Store';
import { notifyError } from '../../common/Actions';



export default function useInjectedWeb3() {
    const { dispatch } = React.useContext(Store);
    let provider;

    React.useEffect(() => {
      const windowProvider = async() => {
        if (typeof window.ethereum !== 'undefined'
            || (typeof window.web3 !== 'undefined')) {

            //provider = window['ethereum']
 
            try{                
            //await window.ethereum.send('eth_request_accts');

               await window.ethereum.send({
                   method: 'wallet_requestPermissions',
                   params: [{
                    'eth_accounts': {},
                   }]
               })

               let addrs = await window.ethereum.send('eth_accounts');
               console.log(addrs);

               dispatch({
                type: ActionType.SET_SELECTED_ETH_ADDR,
                payload: addrs.result[0]
               });
       

            }catch (e){

                //remove above call
                //try

                    //send wallet permission

                    // call accounts again

                //catch
                    


                console.error('user refused to connect');
                notifyError('Please note that you are required to connect to this application for it to work correctly.')
            }
            //finally 
            provider = window.ethereum;
            dispatch({
                type: ActionType.SET_INJECTED_PROVIDER,
                payload: provider
            })

            
            
            provider.on('accountsChanged', function(accounts) {
                console.log("accounts changed");
                dispatch({
                    type: ActionType.SET_SELECTED_ETH_ADDR,
                    payload: accounts[0]
                })
            })

            provider.on('networkChanged', function(accounts) {
                console.log('networkChanged changed');
                console.log(accounts);
            })

          }
        }

        windowProvider();
    }, [window['ethereum']]);

    return provider;
}

