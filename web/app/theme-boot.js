'use strict';
(function(scope,factory){
  const api=factory(scope);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{scope.GuandanTheme=api;let saved;try{saved=JSON.parse(scope.localStorage.getItem('guandan.desktop.preferences.v1')||'{}').theme;}catch{}api.apply(saved);}
})(globalThis,function(scope){
  const colors={day:'#f4f1e9',night:'#141d1a',black:'#000000'};
  const normalize=value=>typeof value==='string'&&Object.hasOwn(colors,value)?value:'day';
  function apply(value){
    const theme=normalize(value),doc=scope.document;if(!doc)return theme;
    doc.documentElement.dataset.theme=theme;
    let meta=doc.querySelector('meta[name="theme-color"]');
    if(!meta){meta=doc.createElement('meta');meta.name='theme-color';doc.head.append(meta);}meta.content=colors[theme];
    try{scope.GuandanDesktop?.setTheme?.(theme);}catch{}
    return theme;
  }
  return Object.freeze({normalize,apply});
});
