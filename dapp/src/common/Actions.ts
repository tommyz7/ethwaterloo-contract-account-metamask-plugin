import _ from "lodash";
import { toast } from "react-toastify";
import Axios from "axios";
import DLContract from './../contracts/DCWallet.json'
import Web3 from "web3";
import { loadTokenContract } from "../utils/EthUtil.js";


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


export const setAValueOnTheContract = async(web3: Web3, fromAddr: string, stringVal: string) => {
  let contractAddr: string = '0xedd06b70322E8B1B5dD7Be7673D3E394a14996cc';
  
  console.log("web3:", web3);

  let dlContract = await loadTokenContract(web3, DLContract, contractAddr);
  console.log(dlContract);

  const tx = await dlContract.methods.setValue(
    stringVal
  )
    .send({
      from: fromAddr
    });

  console.log('invoke tx hash:', tx);
  notify('set value, with hash:' + tx.hash);
}


export const getAValueFromContract = async(web3: Web3) => {
  let contractAddr: string = '0xedd06b70322E8B1B5dD7Be7673D3E394a14996cc';
  
  console.log("web3:", web3);

  let dlContract = await loadTokenContract(web3, DLContract, contractAddr);
  console.log(dlContract);

  const val = await dlContract.methods.getValue().call();

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

