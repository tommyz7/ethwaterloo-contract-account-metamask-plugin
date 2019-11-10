import React from 'react'
import { Button, Input } from 'antd';
import useInjectedWeb3 from '../components/hooks/useInjectedWeb3';
import { Store, ActionType } from '../common/Store';
import useLoadInjectedWeb3State from '../components/hooks/useLoadInjectedWeb3State';
import { notify } from '../common/Actions';
import InvokeTest from '../components/test/InvokeTest';

const someTopSpace = {
  marginTop: '2em'
}

export default function Test() {
  const { state, dispatch } = React.useContext(Store);
  useInjectedWeb3();
  useLoadInjectedWeb3State();

  
  return (
    <React.Fragment>
      <div className="offset">
        <div className="jumbotron">
          <div className="narrow">
            <div className="col-12">
              <h3 className="heading text-center">Defi-Custody React Dapp Demo</h3>
              <div className="heading-underline"></div>
            
              <div className="whiteBackground"> 
              <div className="row seeMe"> 
                  <div className="col-md-8">
                    My Account
                  </div>     
                  <div className="col-md-4">
                  
                  </div>     
                </div>
                <div className="row seeMe"> 
                  <div className="col-md-8">
                    <Button
                      type="dashed"
                      onClick={()=> {
                        notify('creating wallet through meta mask');
                        dispatch({
                          type: ActionType.SET_RECOVERY_COUNTDOWN,
                          payload: Date.now()
                        });
                      }}
                    >
                      Create Wallet
                    </Button>
                  </div>
                  <div className="col-md-4">
                  
                  </div>
                </div>
                <div className="row seeMe"> 
                  <div className="col-md-8">
                    {state.selectedEthAddr}
                  </div>
                  <div className="col-md-4">
                    [ENS address]
                  </div>
                </div>

                <div className="row seeMe onScreenBox"> 
                  <div className="col-md-8">
                    Recovery Address
                  </div>     
                  <div className="col-md-4">
                  
                  </div>     
                </div>
                <div className="row seeMe"> 
                  <div className="col-md-8">
                    <Input
                      placeholder="0x or ENS recovery address"
                    />
                  </div>     
                  <div className="col-md-4">
                    <Button
                      type="dashed"
                      onClick={()=> {
                        notify('setting recovery address');
                      }}
                    >
                      Set Recovery Address
                    </Button>
                  </div>     
                </div>

                

                <div className="row seeMe onScreenBox"> 
                  <div className="col-md-8">
                    Recovery Countdown & Reset
                  </div>     
                  <div className="col-md-4">
                  
                  </div>     
                </div>
                <div className="row seeMe"> 
                  <div className="col-md-8">
                    [{state.recoveryCountdown}]
                  </div>     
                  <div className="col-md-4">
                    <Button
                      type="dashed"
                      onClick={()=> {
                        notify('resetting recovery countdown');
                      }}
                    >
                    Reset
                    </Button>
                  </div>     
                </div>

              </div>       
            </div>
          </div>
        </div>
      </div>

      <InvokeTest />

    </React.Fragment>
  )
}

