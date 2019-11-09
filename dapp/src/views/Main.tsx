import React from "react";
import Header from "./Header";


export default function Main() {

  const attribStyle = {}
  
  return (
      <React.Fragment>
        <div id="home">
          <Header />
        <div className="landing">
          <div className="home-wrap">
            <div className="home-inner">
            </div>
          </div>
        </div>
      </div>
      <div className="caption text-center">
        <h1>ethWaterloo</h1>
        <h3>hack</h3>
        <a className="btn btn-outline-light btn-lg" href="#overview">Do Something</a>
        <a className="btn btn-outline-light btn-lg" href="#overview">Do Something Else</a>
      </div>
      <span><a href="" 
        onClick={() => {
          window.open("https://unsplash.com/photos/46dgbaKZTjk");
        }}
      >Photo credit: Axi Aimee</a></span>
      <div id="overview" className="offset">
        <div className="col-12 narrow text-center">
          <h1>...</h1>
          <p className="lead">
            ...      
          </p>
          <a className="btn btn-secondary btn-md" 
            onClick={() => {
              //location.assign('/submit');
            }}
          >
          Submit some (k)ode</a>
        </div>
      </div>
      </React.Fragment>
  );
}
