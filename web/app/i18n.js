/* Presentation-only localization. Canonical rules, model inputs and saves stay unchanged. */
'use strict';
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./locales/en.js'):root.GuandanEnglish);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.GuandanI18n=api;
})(globalThis,function(english){
  const KEY='guandan.language.v1',ZH='zh-CN';
  let locale=ZH;try{locale=localStorage.getItem(KEY)==='en'?'en':ZH;}catch{}
  const protectedNames=new Set(),originals=new WeakMap(),attributes=new WeakMap();
  function translate(source,language=locale){
    if(language!=='en'||typeof source!=='string'||!/[\u3400-\u9fff]/u.test(source))return source;
    if(Object.hasOwn(english.messages,source.trim()))return english.translate(source);
    const placeholders=[];
    let value=source;
    for(const name of [...protectedNames].sort((a,b)=>b.length-a.length))if(name&&value.includes(name)){
      const key='\uE000'+placeholders.length+'\uE001';placeholders.push(name);value=value.split(name).join(key);
    }
    value=english.translate(value);
    return value.replace(/\uE000(\d+)\uE001/g,(_,i)=>placeholders[Number(i)]);
  }
  const skip=element=>element?.closest('script,style,textarea,[translate="no"],code,pre');
  function textNode(node){
    if(skip(node.parentElement))return;
    const previous=originals.get(node),source=previous&&node.data===previous.rendered?previous.source:node.data;
    const rendered=translate(source);originals.set(node,{source,rendered});if(node.data!==rendered)node.data=rendered;
  }
  function element(node){
    if(skip(node))return;
    const saved=attributes.get(node)||{};
    for(const name of ['aria-label','aria-valuetext','title','placeholder','alt'])if(node.hasAttribute(name)){
      const current=node.getAttribute(name),previous=saved[name],source=previous&&current===previous.rendered?previous.source:current;
      const rendered=translate(source);saved[name]={source,rendered};if(current!==rendered)node.setAttribute(name,rendered);
    }
    attributes.set(node,saved);
  }
  function walk(node){
    if(node.nodeType===3){textNode(node);return;}
    if(node.nodeType!==1&&node.nodeType!==9)return;
    if(node.nodeType===1)element(node);
    const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let next;
    while((next=walker.nextNode()))next.nodeType===3?textNode(next):element(next);
  }
  let observer;
  function observing(){observer?.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','aria-valuetext','title','placeholder','alt']});}
  function refresh(){if(typeof document==='undefined')return;observer?.disconnect();walk(document.documentElement);observing();}
  function setLocale(value){
    locale=value==='en'?'en':ZH;
    try{localStorage.setItem(KEY,locale);}catch{}
    if(typeof document==='undefined')return;
    document.documentElement.lang=locale;
    const button=document.getElementById('language-toggle');
    if(button){button.textContent=locale==='en'?'中文':'English';button.setAttribute('aria-label',locale==='en'?'Switch to Chinese':'切换到英文');}
    refresh();
    window.GuandanDesktop?.setLanguage(locale);
    window.GuandanPadNative?.setLanguage?.(locale);
    window.dispatchEvent(new CustomEvent('guandan-language-change',{detail:{locale}}));
  }
  function start(){
    observer=new MutationObserver(records=>{
      observer.disconnect();
      const nodes=new Set();for(const record of records){if(record.type==='childList')record.addedNodes.forEach(node=>nodes.add(node));else nodes.add(record.target);}
      nodes.forEach(walk);observing();
    });
    document.getElementById('language-toggle')?.addEventListener('click',()=>setLocale(locale==='en'?ZH:'en'));
    setLocale(locale);
  }
  if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',start,{once:true});
  return Object.freeze({get locale(){return locale;},t:translate,setLocale,refresh,protectName(name){if(name)protectedNames.add(name);},KEY});
});
