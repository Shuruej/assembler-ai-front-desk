"use client";
import { useEffect,useState } from "react";
type Choice="light"|"dark"|"system";
const options:[Choice,string][]=[["light","☀"],["system","◐"],["dark","☾"]];
function resolve(v:Choice){return v==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):v}
export default function ThemeToggle(){
 const [choice,setChoice]=useState<Choice>("system");
 useEffect(()=>{const saved=(localStorage.getItem("assembler-theme") as Choice)||"system";setChoice(saved);document.documentElement.dataset.theme=resolve(saved)},[]);
 function pick(v:Choice){setChoice(v);localStorage.setItem("assembler-theme",v);document.documentElement.dataset.theme=resolve(v)}
 return <div className="theme-switcher" role="group" aria-label="Color theme">{options.map(([v,icon])=><button key={v} type="button" aria-label={v+" theme"} aria-pressed={choice===v} onClick={()=>pick(v)}>{icon}</button>)}</div>
}