'use strict';
const client=new DanLMClient();
window.GuandanEngine.listen(async({id,payload})=>{
  try{window.GuandanEngine.result({id,value:await client.request(payload)});}
  catch(error){window.GuandanEngine.result({id,error:error.message});}
});
