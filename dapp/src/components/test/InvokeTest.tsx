import React from 'react'
import { Button } from 'antd';
import { Store } from '../../common/Store';
import { setAValueOnTheContract, getAValueFromContract } from '../../common/Actions';
import useInjectedWeb3 from '../hooks/useInjectedWeb3';
import useLoadInjectedWeb3State from '../hooks/useLoadInjectedWeb3State';

export default function InvokeTest() {
  const { state } = React.useContext(Store);
  
  return (
    <div className="narrow">
      <div className="col-12">
        <div className="row seeMe"> 
          <div className="col-md-8">
            <Button
              type="dashed"
              onClick={async() => {
                console.log('set val');
                let ts: number = Date.now();
                let val: string = `{set-${ts}}`;
                await setAValueOnTheContract(state.ethersProvider, state.selectedEthAddr,
                                                              val, state.selectedEthAddr);
              }}>                                                
                Test Set Val
            </Button>
           
          </div>     
          <div className="col-md-4">
            <Button
              type="dashed"
              onClick={ async() => {
                console.log('get val');
                await getAValueFromContract(state.ethersProvider, state.selectedEthAddr);
              }}>
                Test Get Val
            </Button>
          </div>     

        </div>
      </div>
    </div>
  )
}


/*
*/

//