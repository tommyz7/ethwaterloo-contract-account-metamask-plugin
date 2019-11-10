import _ from "lodash";
import { toast } from "react-toastify";
import Axios from "axios";
import DLContract from './../contracts/DCWallet.json'
import Web3 from "web3";
import { loadTokenContract } from "../utils/EthUtil.js";
import { ethers } from "ethers";


export const notify = (msg: string, success?: boolean) => {
  !success ? toast(msg) : toast.success(msg, { autoClose: false });
};


export const notifyError = (msg: string) => {
  toast.error(msg, { autoClose: false });
};


export const notifyWarn = (msg: string) => {
  if (!toast.isActive("nfId")) {
    toast.warn(msg, { toastId: "nfId" });
  }
};


export const setAValueOnTheContract = async(ethersProvider: any, fromAddr: string, 
                                              stringVal: string, contractAddr: string) => {
  
  console.log("ethers provider:", ethersProvider);

  let dlContract = await loadTokenContract(ethersProvider, DLContract, contractAddr);
  console.log(dlContract);

  const tx = await dlContract.setValue(
    stringVal
  )
    .send({
      from: fromAddr
    });

  console.log('invoke tx hash:', tx);
  notify('set value, with hash:' + tx.hash);
}



export const getAValueFromContract = async(ethersProvider: any, contractAddr: string) => { 
  let dlContract = await loadTokenContract(ethersProvider, DLContract, contractAddr);
  console.log(dlContract);
  const val = await dlContract.getValue();

  console.log('value returned from contract was:', val);
  notify('value returned from contract was:' + val);
}

/*
  direct return
*/
export const rpcStatus = async():Promise<boolean> => {
  try{
    const result = await Axios.get('/api/v1/status');
    return true;
  }catch (error){
    console.error("Could not connect to server on rpc check");
    return false;
  }
};

