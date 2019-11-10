import React from "react";
import {
  IAction,
  IAppState
} from "./Interfaces";


export enum ActionType {
  SET_SELECTED_ETH_ADDR = "SET_SELECTED_ETH_ADDR",
  SET_ETH_WEB3 = "SET_ETH_WEB3",
  SET_ETH_BALANCE = "SET_ETH_BALANCE",
  SET_INJECTED_PROVIDER = "SET_INJECTED_PROVIDER",
  SET_RECOVERY_COUNTDOWN = "SET_RECOVERY_COUNTDOWN",
  SET_ETHERS_PROVIDER = "SET_ETHERS_PROVIDER"
}


const initialState: IAppState = {
  selectedEthAddr: '--',
  ethBalance: '--',
  injectedProvider: null,
  recoveryCountdown: -1,
  ethersProvider: null
};


export const Store = React.createContext<IAppState | any>(initialState);

function reducer(state: IAppState, action: IAction | any): IAppState {
  switch (action.type) {
    case ActionType.SET_SELECTED_ETH_ADDR:
      return {
        ...state, selectedEthAddr: action.payload
      }
    case ActionType.SET_ETH_WEB3:
      return {
        ...state, ethersProvider: action.payload
      }
    case ActionType.SET_ETH_BALANCE:
      return {
        ...state, ethBalance: action.payload
      }
    case ActionType.SET_INJECTED_PROVIDER:
        return {
          ...state, injectedProvider: action.payload
      }
    case ActionType.SET_RECOVERY_COUNTDOWN:
        return {
          ...state, recoveryCountdown: action.payload
      }
    case ActionType.SET_ETHERS_PROVIDER:
      return {
        ...state, ethersProvider: action.payload
      }
    default:
      return state;
  }
}


export function StoreProvider(props: any): JSX.Element {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  return (
    <Store.Provider value={{ state, dispatch }}>
      {props.children}
    </Store.Provider>
  );
}

