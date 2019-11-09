import Web3 from "web3";
import { Client } from "loom-js";

/**
|--------------------------------------------------
|  Interfaces
|--------------------------------------------------
*/
export type Dispatch = React.Dispatch<IAction>;


export interface IAppState {
  selectedEthAddr: string;
  ethWeb3: Web3| null;
  ethBalance: string;
  injectedProvider: any;
  recoveryCountdown: number;
  ethersProvider: any| null;
}

export interface IAction {
  type: string; //enum from Store.ActionType
  payload: any;
}
